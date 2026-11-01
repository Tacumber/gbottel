/**
 * foliosService.ts
 *
 * Folios por rangos asignados al técnico principal (issue #3).
 *
 * Reglas:
 *  - Cada técnico principal tiene uno o más bloques [desde, hasta]. Los
 *    bloques no se solapan (trigger `rangos_sin_solape_*` + comprobación
 *    previa con mensaje claro).
 *  - Un folio se reserva con compare-and-swap sobre `siguiente` DENTRO de
 *    la misma transacción que crea la orden: si algo falla, el rollback
 *    devuelve el folio; si dos guardados compiten, uno solo gana.
 *  - Todo folio emitido queda en `folios_emitidos` (libro que solo crece).
 *    Nunca se renumera ni se reutiliza, aunque la orden se elimine.
 *  - Sin folios disponibles para el principal → ErrorFolios('SIN_FOLIOS').
 *
 * Límite conocido: dos dispositivos sin conexión entre sí no pueden
 * detectar que se les asignó el mismo bloque; la asignación de bloques es
 * responsabilidad de quien administra los folios (ver README de la rama).
 */
import type * as SQLite from 'expo-sqlite';

import { getDatabase } from '../database/db';

export const FOLIO_MAXIMO = 999999;
export const UMBRAL_AVISO_DEFECTO = 10;
const CLAVE_UMBRAL = 'folioAlertaRestantes';

export type CodigoErrorFolios =
  | 'SIN_PRINCIPAL'
  | 'PRINCIPAL_INVALIDO'
  | 'SIN_FOLIOS'
  | 'CONFLICTO'
  | 'RANGO_INVALIDO'
  | 'RANGO_SOLAPADO'
  | 'FOLIO_EMITIDO'
  | 'RANGO_USADO'
  | 'RANGO_NO_ENCONTRADO'
  | 'RESPALDO_INVALIDO'
  | 'TRASPASO_INVALIDO';

export class ErrorFolios extends Error {
  codigo: CodigoErrorFolios;
  constructor(codigo: CodigoErrorFolios, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorFolios';
    this.codigo = codigo;
  }
}

export interface RangoFolios {
  id: number;
  tecnicoId: number | null;
  tecnicoNombre: string | null;
  tecnicoEstado: string | null;
  historico: number;
  desde: number;
  hasta: number;
  siguiente: number;
  restantes: number;
}

export interface ResumenFoliosTecnico {
  tecnicoId: number;
  nombre: string;
  restantes: number;
  tieneRangos: boolean;
}

export function formatearFolio(numero: number): string {
  return String(numero).padStart(6, '0');
}

/** Devuelve el número del folio si es puramente numérico, o null. */
export function numeroDeFolio(folio: string): number | null {
  return /^[0-9]+$/.test(folio) ? Number(folio) : null;
}

// ---------------------------------------------------------------------
// Serialización: los guardados/ importaciones/ restauraciones de este
// dispositivo corren de uno en uno. Dos transacciones exclusivas de
// expo-sqlite usan conexiones distintas y la segunda fallaría con
// "database is locked"; en cola, la segunda simplemente espera.
// ---------------------------------------------------------------------
let cola: Promise<unknown> = Promise.resolve();
export function enSerieFolios<T>(tarea: () => Promise<T>): Promise<T> {
  const ejecucion = cola.then(tarea, tarea);
  cola = ejecucion.catch(() => undefined);
  return ejecucion;
}

type Db = SQLite.SQLiteDatabase;

function mensajeDeSqlite(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Reserva el próximo folio libre del técnico principal. Debe llamarse
 * dentro de una transacción: la reserva y la creación de la orden se
 * confirman o se revierten juntas.
 */
export async function reservarFolio(db: Db, tecnicoId: number): Promise<string> {
  const principal = await db.getFirstAsync<{ id: number; estado: string }>(
    `SELECT id, estado FROM tecnicos WHERE id = ?`,
    tecnicoId
  );
  if (!principal) throw new ErrorFolios('PRINCIPAL_INVALIDO', 'El técnico principal elegido no existe.');
  if (principal.estado !== 'activo') {
    throw new ErrorFolios('PRINCIPAL_INVALIDO', 'El técnico principal elegido está inactivo.');
  }

  // Cada vuelta consume UN número del bloque. Un número que ya figura en el
  // libro (p. ej. llegó por traspaso desde otro dispositivo) se descarta sin
  // emitirlo y se sigue con el siguiente.
  for (let intento = 0; intento < FOLIO_MAXIMO; intento++) {
    const rango = await db.getFirstAsync<{ id: number; siguiente: number }>(
      `SELECT id, siguiente FROM folio_rangos
       WHERE tecnicoId = ? AND historico = 0 AND siguiente <= hasta
       ORDER BY desde ASC LIMIT 1`,
      tecnicoId
    );
    if (!rango) {
      throw new ErrorFolios(
        'SIN_FOLIOS',
        'No quedan folios disponibles para este técnico principal. Asigna un nuevo rango en Ajustes → Rangos de folios.'
      );
    }
    const avance = await db.runAsync(
      `UPDATE folio_rangos SET siguiente = siguiente + 1 WHERE id = ? AND siguiente = ?`,
      rango.id,
      rango.siguiente
    );
    if (avance.changes !== 1) {
      throw new ErrorFolios('CONFLICTO', 'El rango de folios cambió mientras se guardaba. Intenta de nuevo.');
    }
    const folio = formatearFolio(rango.siguiente);
    const registro = await db.runAsync(
      `INSERT OR IGNORE INTO folios_emitidos (numero, origen) VALUES (?, 'local')`,
      folio
    );
    if (registro.changes === 1) return folio;
  }
  throw new ErrorFolios('SIN_FOLIOS', 'No quedan folios disponibles para este técnico principal.');
}

/**
 * Folio ESCRITO por el técnico para una orden nueva. Debe pertenecer a un bloque activo del
 * técnico principal y no haber sido emitido nunca. Dentro de la transacción de guardado:
 *  - se registra en el libro (inmutable);
 *  - si `continuarSecuencia` es true y el número está por delante del siguiente del bloque, el
 *    siguiente pasa a número + 1 (los números omitidos quedan sin emitir). Nunca retrocede;
 *  - si es false, el bloque conserva su secuencia (los folios ya emitidos se saltan al avanzar).
 * Si coincide justo con el siguiente del bloque, equivale a la emisión normal.
 */
export async function reservarFolioManual(
  db: Db,
  tecnicoId: number,
  numero: number,
  continuarSecuencia: boolean
): Promise<string> {
  if (!Number.isInteger(numero) || numero < 1 || numero > FOLIO_MAXIMO) {
    throw new ErrorFolios('RANGO_INVALIDO', `El folio debe ser un número entero entre 1 y ${FOLIO_MAXIMO}.`);
  }
  const principal = await db.getFirstAsync<{ estado: string }>(`SELECT estado FROM tecnicos WHERE id = ?`, tecnicoId);
  if (!principal) throw new ErrorFolios('PRINCIPAL_INVALIDO', 'El técnico principal elegido no existe.');
  if (principal.estado !== 'activo') {
    throw new ErrorFolios('PRINCIPAL_INVALIDO', 'El técnico principal elegido está inactivo.');
  }
  const rango = await db.getFirstAsync<{ id: number; desde: number; hasta: number; siguiente: number }>(
    `SELECT id, desde, hasta, siguiente FROM folio_rangos
     WHERE tecnicoId = ? AND historico = 0 AND siguiente <= hasta AND desde <= ? AND hasta >= ?`,
    tecnicoId,
    numero,
    numero
  );
  if (!rango) {
    throw new ErrorFolios(
      'RANGO_INVALIDO',
      `El folio ${formatearFolio(numero)} está fuera de los rangos asignados a este técnico principal.`
    );
  }
  const folio = formatearFolio(numero);
  const registro = await db.runAsync(`INSERT OR IGNORE INTO folios_emitidos (numero, origen) VALUES (?, 'manual')`, folio);
  if (registro.changes !== 1) {
    throw new ErrorFolios('FOLIO_EMITIDO', `El folio ${folio} ya fue emitido; no se puede reutilizar.`);
  }
  if (numero === rango.siguiente) {
    // Misma emisión que el modo automático.
    const avance = await db.runAsync(
      `UPDATE folio_rangos SET siguiente = siguiente + 1 WHERE id = ? AND siguiente = ?`,
      rango.id,
      rango.siguiente
    );
    if (avance.changes !== 1) throw new ErrorFolios('CONFLICTO', 'El rango de folios cambió mientras se guardaba. Intenta de nuevo.');
  } else if (continuarSecuencia && numero > rango.siguiente) {
    const avance = await db.runAsync(
      `UPDATE folio_rangos SET siguiente = ? WHERE id = ? AND siguiente = ?`,
      numero + 1,
      rango.id,
      rango.siguiente
    );
    if (avance.changes !== 1) throw new ErrorFolios('CONFLICTO', 'El rango de folios cambió mientras se guardaba. Intenta de nuevo.');
  }
  return folio;
}

/** Registra un folio que llegó de fuera (traspaso/respaldo). No falla si ya estaba. */
export async function registrarFolioExterno(db: Db, folio: string, origen: string): Promise<void> {
  await db.runAsync(`INSERT OR IGNORE INTO folios_emitidos (numero, origen) VALUES (?, ?)`, folio, origen);
}

// ---------------------------------------------------------------------
// Rangos
// ---------------------------------------------------------------------

export async function listarRangos(): Promise<RangoFolios[]> {
  const db = await getDatabase();
  return db.getAllAsync<RangoFolios>(
    `SELECT r.id, r.tecnicoId, COALESCE(t.nombre, r.tecnicoNombre) AS tecnicoNombre, t.estado AS tecnicoEstado,
            r.historico, r.desde, r.hasta, r.siguiente, (r.hasta - r.siguiente + 1) AS restantes
     FROM folio_rangos r LEFT JOIN tecnicos t ON t.id = r.tecnicoId
     ORDER BY r.desde ASC`
  );
}

export async function asignarRango(tecnicoId: number, desde: number, hasta: number): Promise<number> {
  if (!Number.isInteger(desde) || !Number.isInteger(hasta)) {
    throw new ErrorFolios('RANGO_INVALIDO', 'Desde y Hasta deben ser números enteros.');
  }
  if (desde < 1 || hasta < desde || hasta > FOLIO_MAXIMO) {
    throw new ErrorFolios('RANGO_INVALIDO', `El rango debe cumplir 1 ≤ Desde ≤ Hasta ≤ ${FOLIO_MAXIMO}.`);
  }

  return enSerieFolios(async () => {
    const db = await getDatabase();
    let nuevoId = 0;
    try {
      await db.withExclusiveTransactionAsync(async (txn) => {
        const tecnico = await txn.getFirstAsync<{ nombre: string; estado: string }>(
          `SELECT nombre, estado FROM tecnicos WHERE id = ?`,
          tecnicoId
        );
        if (!tecnico) throw new ErrorFolios('PRINCIPAL_INVALIDO', 'El técnico elegido no existe.');
        if (tecnico.estado !== 'activo') throw new ErrorFolios('PRINCIPAL_INVALIDO', 'El técnico elegido está inactivo.');

        const solapado = await txn.getFirstAsync<{ desde: number; hasta: number }>(
          `SELECT desde, hasta FROM folio_rangos WHERE desde <= ? AND hasta >= ? LIMIT 1`,
          hasta,
          desde
        );
        if (solapado) {
          throw new ErrorFolios(
            'RANGO_SOLAPADO',
            `El rango se solapa con el bloque ${formatearFolio(solapado.desde)}–${formatearFolio(solapado.hasta)}.`
          );
        }
        // Folios ya emitidos en este dispositivo (p. ej. llegados por traspaso)
        // dentro del nuevo bloque: no se pueden volver a asignar.
        const emitido = await txn.getFirstAsync<{ numero: string }>(
          `SELECT numero FROM folios_emitidos
           WHERE numero NOT GLOB '*[^0-9]*' AND CAST(numero AS INTEGER) BETWEEN ? AND ? LIMIT 1`,
          desde,
          hasta
        );
        if (emitido) {
          throw new ErrorFolios('FOLIO_EMITIDO', `El folio ${emitido.numero} ya fue emitido y cae dentro de ese rango.`);
        }

        const res = await txn.runAsync(
          `INSERT INTO folio_rangos (tecnicoId, tecnicoNombre, historico, desde, hasta, siguiente) VALUES (?, ?, 0, ?, ?, ?)`,
          tecnicoId,
          tecnico.nombre,
          desde,
          hasta,
          desde
        );
        nuevoId = res.lastInsertRowId;
      });
    } catch (error) {
      if (error instanceof ErrorFolios) throw error;
      if (/RANGO_SOLAPADO/.test(mensajeDeSqlite(error))) {
        throw new ErrorFolios('RANGO_SOLAPADO', 'El rango se solapa con otro bloque existente.');
      }
      throw error;
    }
    return nuevoId;
  });
}

/** Reconecta un bloque huérfano (sin técnico, p. ej. tras restablecer o restaurar) con un técnico activo. */
export async function vincularRango(rangoId: number, tecnicoId: number): Promise<void> {
  return enSerieFolios(async () => {
    const db = await getDatabase();
    await db.withExclusiveTransactionAsync(async (txn) => {
      const rango = await txn.getFirstAsync<{ id: number; tecnicoId: number | null; historico: number }>(
        `SELECT id, tecnicoId, historico FROM folio_rangos WHERE id = ?`,
        rangoId
      );
      if (!rango) throw new ErrorFolios('RANGO_NO_ENCONTRADO', 'El rango no existe.');
      if (rango.historico) throw new ErrorFolios('RANGO_INVALIDO', 'El bloque histórico no se asigna a ningún técnico.');
      if (rango.tecnicoId != null) throw new ErrorFolios('RANGO_INVALIDO', 'Este bloque ya tiene un técnico asignado.');
      const tecnico = await txn.getFirstAsync<{ nombre: string; estado: string }>(
        `SELECT nombre, estado FROM tecnicos WHERE id = ?`,
        tecnicoId
      );
      if (!tecnico || tecnico.estado !== 'activo') {
        throw new ErrorFolios('PRINCIPAL_INVALIDO', 'El técnico elegido no existe o está inactivo.');
      }
      await txn.runAsync(`UPDATE folio_rangos SET tecnicoId = ?, tecnicoNombre = ? WHERE id = ?`, tecnicoId, tecnico.nombre, rangoId);
    });
  });
}

/** Solo se puede quitar un bloque del que no se ha emitido ningún folio. */
export async function eliminarRangoSinUsar(rangoId: number): Promise<void> {
  return enSerieFolios(async () => {
    const db = await getDatabase();
    const res = await db.runAsync(
      `DELETE FROM folio_rangos WHERE id = ? AND historico = 0 AND siguiente = desde`,
      rangoId
    );
    if (res.changes !== 1) {
      throw new ErrorFolios('RANGO_USADO', 'Ese bloque ya emitió folios (o no existe); no se puede quitar.');
    }
  });
}

// ---------------------------------------------------------------------
// Aviso de agotamiento
// ---------------------------------------------------------------------

export async function obtenerUmbralAviso(): Promise<number> {
  const db = await getDatabase();
  const fila = await db.getFirstAsync<{ valor: string | null }>(`SELECT valor FROM configuracion WHERE clave = ?`, CLAVE_UMBRAL);
  const n = Number(fila?.valor);
  return Number.isInteger(n) && n >= 0 ? n : UMBRAL_AVISO_DEFECTO;
}

export async function guardarUmbralAviso(n: number): Promise<void> {
  if (!Number.isInteger(n) || n < 0 || n > FOLIO_MAXIMO) {
    throw new ErrorFolios('RANGO_INVALIDO', 'El umbral de aviso debe ser un entero entre 0 y 999999.');
  }
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO configuracion (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`,
    CLAVE_UMBRAL,
    String(n)
  );
}

export async function resumenFoliosPorTecnico(): Promise<ResumenFoliosTecnico[]> {
  const db = await getDatabase();
  const filas = await db.getAllAsync<{ tecnicoId: number; nombre: string; restantes: number; rangos: number }>(
    `SELECT t.id AS tecnicoId, t.nombre AS nombre,
            COALESCE(SUM(CASE WHEN r.id IS NULL THEN 0 ELSE r.hasta - r.siguiente + 1 END), 0) AS restantes,
            COUNT(r.id) AS rangos
     FROM tecnicos t LEFT JOIN folio_rangos r ON r.tecnicoId = t.id AND r.historico = 0
     WHERE t.estado = 'activo'
     GROUP BY t.id
     ORDER BY t.nombre COLLATE NOCASE ASC`
  );
  return filas.map((f) => ({ tecnicoId: f.tecnicoId, nombre: f.nombre, restantes: f.restantes, tieneRangos: f.rangos > 0 }));
}

/**
 * Folio que se asignaría ahora al técnico principal (sin reservarlo): el primer número del
 * primer bloque con folios libres que no figure ya en el libro. null si no le queda ninguno.
 */
export async function proximoFolioDisponible(tecnicoId: number): Promise<number | null> {
  const db = await getDatabase();
  const rango = await db.getFirstAsync<{ siguiente: number; hasta: number }>(
    `SELECT siguiente, hasta FROM folio_rangos
     WHERE tecnicoId = ? AND historico = 0 AND siguiente <= hasta
     ORDER BY desde ASC LIMIT 1`,
    tecnicoId
  );
  if (!rango) return null;
  for (let n = rango.siguiente; n <= rango.hasta; n++) {
    const usado = await db.getFirstAsync<{ x: number }>(`SELECT 1 AS x FROM folios_emitidos WHERE numero = ?`, formatearFolio(n));
    if (!usado) return n;
  }
  return null;
}

export interface AvisoFolios {
  tecnicoId: number;
  nombre: string;
  restantes: number;
}

/** Técnicos con rangos a los que les quedan pocos folios (o ninguno). */
export async function avisosDeFolios(): Promise<AvisoFolios[]> {
  const [umbral, resumen] = await Promise.all([obtenerUmbralAviso(), resumenFoliosPorTecnico()]);
  return resumen
    .filter((r) => r.tieneRangos && r.restantes <= umbral)
    .map((r) => ({ tecnicoId: r.tecnicoId, nombre: r.nombre, restantes: r.restantes }));
}
