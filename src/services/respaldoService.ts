import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { getDatabase } from '../database/db';
import { SCHEMA_VERSION } from '../database/schema';
import type { OrdenDashboard } from './analyticsService';
import { ErrorFolios, FOLIO_MAXIMO, enSerieFolios, numeroDeFolio, registrarFolioExterno } from './foliosService';
import { insertarOrdenNueva, obtenerOrden, reemplazarHijosDeOrden } from './ordenesService';
import type { ServicioParaGuardar } from './ordenesService';
import type { NuevaOrden, NuevoOrdenEquipo, NuevoOrdenMaterial, NuevoOrdenTecnico } from '../types/ordenes.types';
import type { NuevoServicio, Servicio } from '../types/tarifario.types';
import { importarServiciosDesdeJSON, listarServicios } from './tarifarioService';
import { fechaHoyISO, formatearFecha } from '@/utils/fechas';
import { formatearImporte, importeComoTexto } from '@/utils/moneda';

// v4 = v3 del tablero anterior (orden_equipos) + folio_rangos y folios_emitidos.
// Se aceptan v1–v3: sin folios (sus órdenes pasan al libro al restaurar) y, antes
// de v3, sin equipos ni técnicos firmantes (se restauran como listas vacías).
const VERSION_RESPALDO = 4;
const VERSIONES_RESPALDO_ACEPTADAS = [1, 2, 3, 4];

interface RespaldoCompleto {
  version: number;
  exportadoEn: string;
  tablas: {
    servicios: unknown[];
    tecnicos: unknown[];
    configuracion: unknown[];
    ordenes: unknown[];
    orden_equipos: unknown[];
    orden_materiales: unknown[];
    orden_servicios: unknown[];
    orden_tecnicos: unknown[];
    folio_rangos?: unknown[];
    folios_emitidos?: unknown[];
  };
}

function nombreArchivoConFecha(prefijo: string, extension: string): string {
  const fecha = fechaHoyISO();
  return `${prefijo}-${fecha}.${extension}`;
}

/** Escribe el contenido en un archivo temporal y abre la hoja de compartir del sistema. */
async function compartirTexto(contenido: string, nombreArchivo: string): Promise<void> {
  const archivo = new File(Paths.cache, nombreArchivo);
  if (archivo.exists) archivo.delete();
  archivo.create();
  archivo.write(contenido);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(archivo.uri);
  } else {
    // En web (y algún dispositivo raro sin hoja de compartir) no hay
    // Sharing — el archivo ya quedó escrito en caché, así que al menos
    // no se pierde el trabajo, aunque no haya UI nativa para mandarlo.
    throw new Error('Este dispositivo no tiene disponible la función de compartir archivos.');
  }
}

/** Abre el selector de archivos del sistema y devuelve el contenido como texto. */
async function elegirYLeerArchivo(mimeTypes: string[]): Promise<string | null> {
  const resultado = await File.pickFileAsync({ mimeTypes });
  if (resultado.canceled) return null;
  return resultado.result.text();
}

// ============================================================
// Respaldo completo — para compartir con la brigada
// ============================================================

export async function exportarRespaldoCompleto(): Promise<void> {
  const db = await getDatabase();
  const [servicios, tecnicos, configuracion, ordenes, orden_equipos, orden_materiales, orden_servicios, orden_tecnicos, folio_rangos, folios_emitidos] =
    await Promise.all([
      db.getAllAsync(`SELECT * FROM servicios`),
      db.getAllAsync(`SELECT * FROM tecnicos`),
      db.getAllAsync(`SELECT * FROM configuracion`),
      db.getAllAsync(`SELECT * FROM ordenes`),
      db.getAllAsync(`SELECT * FROM orden_equipos`),
      db.getAllAsync(`SELECT * FROM orden_materiales`),
      db.getAllAsync(`SELECT * FROM orden_servicios`),
      db.getAllAsync(`SELECT * FROM orden_tecnicos`),
      db.getAllAsync(
        `SELECT r.tecnicoId, COALESCE(t.nombre, r.tecnicoNombre) AS tecnicoNombre, r.historico, r.desde, r.hasta, r.siguiente, r.creadoEn
         FROM folio_rangos r LEFT JOIN tecnicos t ON t.id = r.tecnicoId ORDER BY r.desde`
      ),
      db.getAllAsync(`SELECT numero, origen, emitidoEn FROM folios_emitidos ORDER BY numero`),
    ]);

  const respaldo: RespaldoCompleto = {
    version: VERSION_RESPALDO,
    exportadoEn: new Date().toISOString(),
    tablas: { servicios, tecnicos, configuracion, ordenes, orden_equipos, orden_materiales, orden_servicios, orden_tecnicos, folio_rangos, folios_emitidos },
  };

  await compartirTexto(JSON.stringify(respaldo, null, 2), nombreArchivoConFecha('gbottel-respaldo', 'json'));
}

/**
 * Restauración de un respaldo. Sustituye los DATOS locales (órdenes, técnicos,
 * tarifario, configuración) por los del archivo, pero NO los folios:
 *  - el libro `folios_emitidos` solo crece: se conserva el local y se le
 *    suman los folios del archivo y los de sus órdenes. Nada se renumera ni
 *    se reutiliza.
 *  - los bloques de folios se FUSIONAN: un bloque local y uno del archivo con
 *    los mismos límites quedan con el `siguiente` mayor; los bloques que solo
 *    existen en un lado se conservan; si dos bloques se solapan con límites
 *    distintos, la restauración se rechaza antes de borrar nada.
 * El archivo se valida y se previsualiza ANTES de tocar la base.
 */
export interface RangoRespaldo {
  tecnicoId: number | null;
  tecnicoNombre: string | null;
  desde: number;
  hasta: number;
  siguiente: number;
}

export interface RespaldoValidado {
  version: number;
  tablas: RespaldoCompleto['tablas'];
  rangos: RangoRespaldo[];
  folios: string[];
}

export interface ResumenRespaldo {
  version: number;
  exportadoEn: string | null;
  ordenesEnArchivo: number;
  ordenesLocalesQueSeReemplazan: number;
  tecnicosEnArchivo: number;
  foliosNuevosParaElLibro: number;
  rangosCoincidentes: number;
  rangosNuevos: number;
  rangosSoloLocales: number;
}

export interface PreparacionRespaldo {
  validado: RespaldoValidado;
  resumen: ResumenRespaldo;
}

const TABLAS_RESPALDO = ['servicios', 'tecnicos', 'configuracion', 'ordenes', 'orden_materiales', 'orden_servicios'] as const;
const TABLAS_OPCIONALES = ['orden_equipos', 'orden_tecnicos'] as const;

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function entero(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

/** Valida el contenido ya parseado. No toca la base de datos. Lanza ErrorFolios('RESPALDO_INVALIDO'). */
export function validarRespaldo(datos: unknown): RespaldoValidado {
  const falla = (m: string): never => {
    throw new ErrorFolios('RESPALDO_INVALIDO', `Respaldo no válido: ${m}`);
  };
  if (!esObjeto(datos)) return falla('el archivo no contiene un objeto JSON.');
  if (!VERSIONES_RESPALDO_ACEPTADAS.includes(datos.version as number)) {
    return falla(`versión ${String(datos.version)} no compatible (se aceptan ${VERSIONES_RESPALDO_ACEPTADAS.join(' y ')}).`);
  }
  if (!esObjeto(datos.tablas)) return falla('falta "tablas".');
  const tablas = datos.tablas as Record<string, unknown>;
  for (const t of TABLAS_RESPALDO) {
    if (!Array.isArray(tablas[t])) return falla(`falta la tabla "${t}" o no es una lista.`);
    if ((tablas[t] as unknown[]).some((f) => !esObjeto(f))) return falla(`la tabla "${t}" contiene filas que no son objetos.`);
  }
  for (const t of ['folio_rangos', 'folios_emitidos', ...TABLAS_OPCIONALES]) {
    if (tablas[t] !== undefined && !Array.isArray(tablas[t])) return falla(`la tabla "${t}" no es una lista.`);
    if (Array.isArray(tablas[t]) && (tablas[t] as unknown[]).some((f) => !esObjeto(f))) return falla(`la tabla "${t}" contiene filas que no son objetos.`);
  }
  tablas.orden_equipos = tablas.orden_equipos ?? [];
  tablas.orden_tecnicos = tablas.orden_tecnicos ?? [];

  const ordenes = tablas.ordenes as Record<string, unknown>[];
  const idsOrden = new Set<number>();
  const foliosVistos = new Set<string>();
  const clavesVistas = new Set<string>();
  for (const o of ordenes) {
    if (!entero(o.id)) return falla('una orden no tiene id numérico.');
    if (idsOrden.has(o.id)) return falla(`id de orden repetido (${o.id}).`);
    idsOrden.add(o.id);
    if (typeof o.numeroOrden !== 'string' || o.numeroOrden === '') return falla(`la orden ${o.id} no tiene folio.`);
    if (foliosVistos.has(o.numeroOrden)) return falla(`folio repetido en el archivo (${o.numeroOrden}).`);
    foliosVistos.add(o.numeroOrden);
    if (typeof o.claveGuardado === 'string') {
      if (clavesVistas.has(o.claveGuardado)) return falla(`clave de guardado repetida (${o.claveGuardado}).`);
      clavesVistas.add(o.claveGuardado);
    }
  }
  for (const t of ['orden_equipos', 'orden_materiales', 'orden_servicios', 'orden_tecnicos'] as const) {
    for (const f of tablas[t] as Record<string, unknown>[]) {
      if (!entero(f.ordenId) || !idsOrden.has(f.ordenId)) return falla(`una fila de "${t}" apunta a una orden que no está en el archivo.`);
    }
  }

  const nombrePorTecnico = new Map<number, string>();
  for (const t of tablas.tecnicos as Record<string, unknown>[]) {
    if (entero(t.id) && typeof t.nombre === 'string') nombrePorTecnico.set(t.id, t.nombre);
  }
  for (const o of ordenes) {
    if (o.tecnicoPrincipalId != null && (!entero(o.tecnicoPrincipalId) || !nombrePorTecnico.has(o.tecnicoPrincipalId))) {
      return falla(`la orden ${o.id} tiene un técnico principal que no está en el archivo.`);
    }
  }

  const rangos: RangoRespaldo[] = [];
  for (const r of (tablas.folio_rangos ?? []) as Record<string, unknown>[]) {
    if (!esObjeto(r)) return falla('un bloque de folios no es un objeto.');
    if (!entero(r.desde) || !entero(r.hasta) || !entero(r.siguiente)) return falla('un bloque de folios tiene límites no numéricos.');
    if (r.desde < 1 || r.hasta < r.desde || r.hasta > FOLIO_MAXIMO) return falla(`bloque de folios inválido (${r.desde}–${r.hasta}).`);
    if (r.siguiente < r.desde || r.siguiente > r.hasta + 1) return falla(`el siguiente (${r.siguiente}) está fuera del bloque ${r.desde}–${r.hasta}.`);
    if (r.historico === 1) continue; // el bloque histórico lo cubre el libro de folios
    const idTecnico = entero(r.tecnicoId) ? r.tecnicoId : null;
    if (idTecnico != null && !nombrePorTecnico.has(idTecnico)) return falla(`el bloque ${r.desde}–${r.hasta} apunta a un técnico que no está en el archivo.`);
    rangos.push({
      tecnicoId: idTecnico,
      tecnicoNombre: idTecnico != null ? nombrePorTecnico.get(idTecnico) ?? null : typeof r.tecnicoNombre === 'string' ? r.tecnicoNombre : null,
      desde: r.desde,
      hasta: r.hasta,
      siguiente: r.siguiente,
    });
  }
  const ordenados = [...rangos].sort((a, b) => a.desde - b.desde);
  for (let i = 1; i < ordenados.length; i++) {
    if (ordenados[i].desde <= ordenados[i - 1].hasta) {
      return falla(`el archivo tiene bloques de folios solapados (${ordenados[i - 1].desde}–${ordenados[i - 1].hasta} y ${ordenados[i].desde}–${ordenados[i].hasta}).`);
    }
  }

  const folios = new Set<string>(foliosVistos);
  for (const f of (tablas.folios_emitidos ?? []) as Record<string, unknown>[]) {
    if (!esObjeto(f) || typeof f.numero !== 'string' || f.numero === '') return falla('un registro del libro de folios no tiene número.');
    folios.add(f.numero);
  }

  return {
    version: datos.version as number,
    tablas: tablas as unknown as RespaldoCompleto['tablas'],
    rangos,
    folios: [...folios],
  };
}

interface RangoLocalFusion {
  id: number;
  desde: number;
  hasta: number;
  siguiente: number;
  historico: number;
}

export interface FusionRangos {
  coincidentes: { local: RangoLocalFusion; respaldo: RangoRespaldo }[];
  nuevos: RangoRespaldo[];
  soloLocales: RangoLocalFusion[];
  conflictos: string[];
}

/** Compara bloques locales y del archivo sin tocar nada. */
export function fusionarRangos(locales: RangoLocalFusion[], respaldo: RangoRespaldo[]): FusionRangos {
  const coincidentes: FusionRangos['coincidentes'] = [];
  const nuevos: RangoRespaldo[] = [];
  const conflictos: string[] = [];
  const usadosLocales = new Set<number>();
  const f = (n: number) => String(n).padStart(6, '0');
  for (const b of respaldo) {
    const choques = locales.filter((l) => l.desde <= b.hasta && l.hasta >= b.desde);
    if (choques.length === 0) {
      nuevos.push(b);
    } else if (choques.length === 1 && !choques[0].historico && choques[0].desde === b.desde && choques[0].hasta === b.hasta) {
      coincidentes.push({ local: choques[0], respaldo: b });
      usadosLocales.add(choques[0].id);
    } else {
      conflictos.push(
        `El bloque ${f(b.desde)}–${f(b.hasta)} del archivo se solapa con ${choques.map((c) => `${f(c.desde)}–${f(c.hasta)}${c.historico ? ' (histórico)' : ''}`).join(', ')} de este dispositivo.`
      );
    }
  }
  const soloLocales = locales.filter((l) => !l.historico && !usadosLocales.has(l.id));
  return { coincidentes, nuevos, soloLocales, conflictos };
}

async function rangosLocales(db: Awaited<ReturnType<typeof getDatabase>>): Promise<RangoLocalFusion[]> {
  return db.getAllAsync<RangoLocalFusion>(`SELECT id, desde, hasta, siguiente, historico FROM folio_rangos`);
}

/** Lee y valida el archivo y calcula qué pasaría. No modifica nada. */
export async function prepararRespaldo(): Promise<PreparacionRespaldo | null> {
  const contenido = await elegirYLeerArchivo(['application/json']);
  if (contenido === null) return null;
  return prepararRespaldoDesdeTexto(contenido);
}

export async function prepararRespaldoDesdeTexto(contenido: string): Promise<PreparacionRespaldo> {
  let parseado: unknown;
  try {
    parseado = JSON.parse(contenido);
  } catch {
    throw new ErrorFolios('RESPALDO_INVALIDO', 'Respaldo no válido: el archivo no es JSON.');
  }
  const validado = validarRespaldo(parseado);

  const db = await getDatabase();
  const locales = await rangosLocales(db);
  const fusion = fusionarRangos(locales, validado.rangos);
  if (fusion.conflictos.length) {
    throw new ErrorFolios('RANGO_SOLAPADO', `No se puede restaurar sin resolver un conflicto de folios:\n${fusion.conflictos.join('\n')}`);
  }
  const ordenesLocales = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ordenes`);
  const enLibro = new Set((await db.getAllAsync<{ numero: string }>(`SELECT numero FROM folios_emitidos`)).map((r) => r.numero));
  return {
    validado,
    resumen: {
      version: validado.version,
      exportadoEn: typeof (parseado as Record<string, unknown>).exportadoEn === 'string' ? ((parseado as Record<string, unknown>).exportadoEn as string) : null,
      ordenesEnArchivo: validado.tablas.ordenes.length,
      ordenesLocalesQueSeReemplazan: ordenesLocales?.n ?? 0,
      tecnicosEnArchivo: validado.tablas.tecnicos.length,
      foliosNuevosParaElLibro: validado.folios.filter((f) => !enLibro.has(f)).length,
      rangosCoincidentes: fusion.coincidentes.length,
      rangosNuevos: fusion.nuevos.length,
      rangosSoloLocales: fusion.soloLocales.length,
    },
  };
}

/** Aplica un respaldo ya validado: una sola transacción exclusiva con ROLLBACK ante cualquier fallo. */
export async function aplicarRespaldo(prep: PreparacionRespaldo): Promise<void> {
  const datos = prep.validado;
  await enSerieFolios(async () => {
    const db = await getDatabase();
    await db.withExclusiveTransactionAsync(async (txn) => {
      // Se recalcula con el estado actual: pudo cambiar desde la previsualización.
      const fusion = fusionarRangos(await rangosLocales(txn), datos.rangos);
      if (fusion.conflictos.length) {
        throw new ErrorFolios('RANGO_SOLAPADO', `Conflicto de folios:\n${fusion.conflictos.join('\n')}`);
      }

      // Los bloques locales se desligan de sus técnicos (se reemplazan) conservando el nombre.
      await txn.runAsync(
        `UPDATE folio_rangos SET tecnicoNombre = COALESCE((SELECT nombre FROM tecnicos WHERE id = folio_rangos.tecnicoId), tecnicoNombre), tecnicoId = NULL WHERE historico = 0`
      );

      // Hijos antes que padres. El libro de folios y los bloques NO se borran.
      await txn.runAsync(`DELETE FROM orden_materiales`);
      await txn.runAsync(`DELETE FROM orden_servicios`);
      await txn.runAsync(`DELETE FROM orden_tecnicos`);
      await txn.runAsync(`DELETE FROM orden_equipos`);
      await txn.runAsync(`DELETE FROM ordenes`);
      await txn.runAsync(`DELETE FROM tecnicos`);
      await txn.runAsync(`DELETE FROM servicios`);
      await txn.runAsync(`DELETE FROM configuracion`);

      await insertarFilas(txn, 'servicios', datos.tablas.servicios);
      await insertarFilas(txn, 'tecnicos', datos.tablas.tecnicos);
      await insertarFilas(txn, 'configuracion', datos.tablas.configuracion);
      await insertarFilas(txn, 'ordenes', datos.tablas.ordenes);
      await insertarFilas(txn, 'orden_equipos', datos.tablas.orden_equipos);
      await insertarFilas(txn, 'orden_materiales', datos.tablas.orden_materiales);
      await insertarFilas(txn, 'orden_servicios', datos.tablas.orden_servicios);
      await insertarFilas(txn, 'orden_tecnicos', datos.tablas.orden_tecnicos);

      // Bloques: coincidentes → el siguiente mayor; nuevos → se agregan.
      for (const c of fusion.coincidentes) {
        await txn.runAsync(
          `UPDATE folio_rangos SET siguiente = ?, tecnicoId = ?, tecnicoNombre = ? WHERE id = ?`,
          Math.max(c.local.siguiente, c.respaldo.siguiente),
          c.respaldo.tecnicoId,
          c.respaldo.tecnicoNombre,
          c.local.id
        );
      }
      for (const n of fusion.nuevos) {
        await txn.runAsync(
          `INSERT INTO folio_rangos (tecnicoId, tecnicoNombre, historico, desde, hasta, siguiente) VALUES (?, ?, 0, ?, ?, ?)`,
          n.tecnicoId,
          n.tecnicoNombre,
          n.desde,
          n.hasta,
          n.siguiente
        );
      }
      // Bloques que solo existían aquí: se reconectan con el técnico del mismo nombre, si hay.
      await txn.runAsync(
        `UPDATE folio_rangos SET tecnicoId = (SELECT id FROM tecnicos WHERE nombre = folio_rangos.tecnicoNombre ORDER BY id LIMIT 1)
         WHERE historico = 0 AND tecnicoId IS NULL AND tecnicoNombre IS NOT NULL`
      );

      for (const folio of datos.folios) {
        await registrarFolioExterno(txn, folio, 'respaldo');
      }
      await txn.runAsync(`UPDATE ordenes SET estado = 'pendiente' WHERE estado = 'en_progreso'`);

      await txn.runAsync(
        `INSERT INTO configuracion (clave, valor) VALUES ('schemaVersion', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`,
        String(SCHEMA_VERSION)
      );
    });
  });
}

// Whitelist de columnas esperadas por tabla. Sin esto, insertarFilas()
// tomaría los nombres de columna directo de las claves del JSON
// importado y los metería crudos en el SQL — y este archivo es
// justamente el que se comparte por WhatsApp/Telegram con toda la
// brigada. Un archivo corrupto o alterado no debe poder ejecutar SQL
// arbitrario.
const COLUMNAS_POR_TABLA: Record<string, Set<string>> = {
  servicios: new Set([
    'id',
    'codigoServicio',
    'nombreServicio',
    'categoria',
    'descripcionTecnica',
    'detalleFactura',
    'unidad',
    'precioBase',
    'precioTecnico',
    'tiempoEstimado',
    'cantidadTecnicos',
    'idPropietario',
    'insumosCUP',
    'activo',
    'creadoEn',
    'actualizadoEn',
  ]),
  tecnicos: new Set([
    'id',
    'nombre',
    'cargo',
    'ci',
    'telefono',
    'correo',
    'salarioBasico',
    'aportesONAT',
    'planMensualCUP',
    'estado',
    'creadoEn',
  ]),
  configuracion: new Set(['clave', 'valor']),
  ordenes: new Set([
    'id',
    'numeroOrden',
    'tecnicoPrincipalId',
    'claveGuardado',
    'compania',
    'codigoReporte',
    'reportadoPor',
    'fechaReporte',
    'codigoOrden',
    'codigoFactura',
    'tipoCobertura',
    'modalidadMultiple',
    'clienteCodigo',
    'clienteTipo',
    'clienteNombre',
    'clienteDireccion',
    'clienteMunicipio',
    'clienteProvincia',
    'modalidadesServicio',
    'equipoTipo',
    'equipoMarca',
    'equipoModelo',
    'equipoNroSerie',
    'fechaInicio',
    'fechaFin',
    'tiempoTrabajoMinutos',
    'observaciones',
    'tecnicoId',
    'estado',
    'revisorNombre',
    'revisorCargo',
    'revisorFecha',
    'revisorFirmado',
    'tecnicoFirmaNombre',
    'tecnicoFirmaCI',
    'tecnicoFirmado',
    'clienteFirmaNombre',
    'clienteFirmaCargo',
    'clienteFirmaCI',
    'clienteFirmaFecha',
    'clienteFirmado',
    'creadoEn',
    'actualizadoEn',
  ]),
  orden_equipos: new Set(['id', 'ordenId', 'marca', 'modelo', 'nroSerie']),
  orden_materiales: new Set([
    'id',
    'ordenId',
    'vale',
    'codigo',
    'descripcion',
    'unidadMedida',
    'cantidad',
    'nroSerie',
    'importeCUP',
    'importeUSD',
  ]),
  orden_servicios: new Set(['id', 'ordenId', 'servicioId', 'codigo', 'descripcion', 'cantidad', 'importeCUP', 'importeUSD']),
  orden_tecnicos: new Set(['id', 'ordenId', 'tecnicoId', 'nombre', 'cargo', 'ci', 'firmado']),
};

async function insertarFilas(db: Awaited<ReturnType<typeof getDatabase>>, tabla: string, filas: unknown[]): Promise<void> {
  if (!Array.isArray(filas) || filas.length === 0) return;
  const columnasValidas = COLUMNAS_POR_TABLA[tabla];
  if (!columnasValidas) {
    throw new Error(`Tabla desconocida en el respaldo: "${tabla}".`);
  }

  for (const filaSinTipar of filas) {
    const fila = filaSinTipar as Record<string, string | number | null>;
    const columnas = Object.keys(fila).filter((c) => columnasValidas.has(c));
    if (columnas.length === 0) continue;
    const marcadores = columnas.map(() => '?').join(', ');
    const valores = columnas.map((c) => fila[c]);
    await db.runAsync(`INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${marcadores})`, ...valores);
  }
}

// ============================================================
// Tarifario aparte — para actualizar el catálogo por taller/grupo
// ============================================================

export async function exportarTarifarioJSON(): Promise<void> {
  const servicios = await listarServicios({ incluirInactivos: true, limite: 10000 });
  await compartirTexto(JSON.stringify(servicios, null, 2), nombreArchivoConFecha('gbottel-tarifario', 'json'));
}

export async function importarTarifarioJSON(): Promise<{
  importado: boolean;
  resultado?: { importados: number; duplicados: number; errores: string[] };
}> {
  const contenido = await elegirYLeerArchivo(['application/json']);
  if (contenido === null) return { importado: false };

  const datos = JSON.parse(contenido);
  if (!Array.isArray(datos)) {
    throw new Error('El archivo debe contener una lista de servicios en formato JSON.');
  }

  const resultado = await importarServiciosDesdeJSON(datos as NuevoServicio[]);
  return { importado: true, resultado };
}

/**
 * Reemplaza SOLO el tarifario (tabla `servicios`) por lo que venga en el
 * archivo — a diferencia de importarTarifarioJSON(), que solo agrega filas
 * nuevas y deja los códigos repetidos de lado sin tocar los existentes.
 * Pensado para el caso real de un taller específico (ej. clima): dejar en
 * el dispositivo solo las tarifas que le corresponden a ese técnico, no las
 * 1858 del catálogo completo más las que traiga el archivo importado.
 *
 * NO toca técnicos, órdenes ni configuración — para reemplazar todo eso
 * junto está importarRespaldoCompleto(). Las órdenes ya cerradas no se
 * rompen: orden_servicios.servicioId tiene ON DELETE SET NULL (ver
 * schema.ts), así que conservan su propio código y descripción aunque el
 * servicio original del tarifario ya no exista.
 *
 * El borrado y la importación son dos transacciones separadas (mismo patrón
 * que resetearBaseDeDatos() + importarServiciosDesdeJSON() en Ajustes) en
 * vez de una sola anidada, porque expo-sqlite no está confirmado que
 * soporte transacciones anidadas de forma segura.
 */
export async function reemplazarTarifarioJSON(): Promise<{
  reemplazado: boolean;
  resultado?: { importados: number; duplicados: number; errores: string[] };
}> {
  const contenido = await elegirYLeerArchivo(['application/json']);
  if (contenido === null) return { reemplazado: false };

  const datos = JSON.parse(contenido);
  if (!Array.isArray(datos)) {
    throw new Error('El archivo debe contener una lista de servicios en formato JSON.');
  }

  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM servicios`);
  });

  const resultado = await importarServiciosDesdeJSON(datos as NuevoServicio[]);
  return { reemplazado: true, resultado };
}

export type { Servicio };

/** Restablecimiento de fábrica: elimina los datos operativos y recarga el catálogo inicial. */
export async function resetearBaseDeDatos(): Promise<void> {
  const db = await getDatabase();
  await enSerieFolios(() =>
    db.withTransactionAsync(async () => {
      // Los folios ya emitidos y los bloques de folios se CONSERVAN: restablecer no
      // debe permitir reutilizar un folio. Los bloques quedan sin técnico (con su
      // nombre) hasta que se vuelvan a vincular en Ajustes → Rangos de folios.
      await db.runAsync(
        `UPDATE folio_rangos SET tecnicoNombre = COALESCE((SELECT nombre FROM tecnicos WHERE id = folio_rangos.tecnicoId), tecnicoNombre), tecnicoId = NULL WHERE historico = 0`
      );
      await db.runAsync(`DELETE FROM orden_materiales`);
      await db.runAsync(`DELETE FROM orden_servicios`);
      await db.runAsync(`DELETE FROM orden_tecnicos`);
      await db.runAsync(`DELETE FROM orden_equipos`);
      await db.runAsync(`DELETE FROM ordenes`);
      await db.runAsync(`DELETE FROM tecnicos`);
      await db.runAsync(`DELETE FROM servicios`);
      await db.runAsync(`DELETE FROM configuracion`);
      await db.runAsync(`INSERT INTO configuracion (clave, valor) VALUES ('schemaVersion', ?)`, String(SCHEMA_VERSION));
    })
  );
}

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: 'Pendiente', finalizada: 'Finalizada', facturada: 'Facturada',
};

const moneda = formatearImporte;

function protegerCSV(valor: string): string {
  return /^[=+\-@]/.test(valor) ? `'${valor}` : valor;
}

function escaparCSV(valor: string): string {
  const seguro = protegerCSV(valor);
  return /[",\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

function escaparHTML(valor: string): string {
  return valor.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * CSV en vez de un .xlsx real: cualquier software con función de importar
 * datos lee CSV, y evita sumar una librería solo para escribir el binario
 * de Excel. Si en algún momento hace falta el .xlsx real (con varias hojas,
 * fórmulas, etc.), avisar — es un cambio de librería, no de este archivo.
 */
export async function exportarOrdenesCSV(ordenes: OrdenDashboard[]): Promise<void> {
  const encabezados = ['Folio', 'Cliente', 'Fecha', 'Estado', 'Total CUP', 'Total USD'];
  const filas = ordenes.map((o) => [
    o.folio, o.cliente, formatearFecha(o.fecha),
    ETIQUETA_ESTADO[o.estado] ?? o.estado,
    importeComoTexto(o.totalCUP), importeComoTexto(o.totalUSD),
  ]);
  const csv = '\uFEFF' + [encabezados, ...filas].map((fila) => fila.map(escaparCSV).join(',')).join('\r\n');
  await compartirTexto(csv, nombreArchivoConFecha('gbottel-ordenes', 'csv'));
}

export async function exportarOrdenesPDF(ordenes: OrdenDashboard[]): Promise<void> {
  const filas = ordenes
    .map(
      (o) => `<tr>
        <td>${escaparHTML(o.folio)}</td>
        <td>${escaparHTML(o.cliente)}</td>
        <td>${escaparHTML(formatearFecha(o.fecha))}</td>
        <td>${escaparHTML(ETIQUETA_ESTADO[o.estado] ?? o.estado)}</td>
        <td style="text-align:right">${escaparHTML(moneda(o.totalCUP, 'CUP'))}</td>
        <td style="text-align:right">${escaparHTML(moneda(o.totalUSD, 'USD'))}</td>
      </tr>`
    )
    .join('');
  const html = `<html><head><meta charset="utf-8" />
    <style>
      body { font-family: Helvetica, Arial, sans-serif; padding: 20px; color: #1a1a1a; }
      h1 { font-size: 16px; margin-bottom: 2px; }
      .sub { font-size: 11px; color: #666; margin-bottom: 14px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #ddd; padding: 5px 7px; font-size: 10px; text-align: left; }
      th { background: #f2f2f2; }
    </style></head>
    <body>
      <h1>GBOTtel — Órdenes de Servicio</h1>
      <div class="sub">Generado el ${formatearFecha(fechaHoyISO())} · ${ordenes.length} orden${ordenes.length === 1 ? '' : 'es'}</div>
      <table>
        <thead><tr><th>Folio</th><th>Cliente</th><th>Fecha</th><th>Estado</th><th>CUP</th><th>USD</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </body></html>`;
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
  } else {
    throw new Error('Este dispositivo no tiene disponible la función de compartir archivos.');
  }
}

export interface OrdenTraspasoOmitida {
  folio: string;
  cliente: string;
  motivo: string;
}

export interface PreparacionTraspaso {
  /** Órdenes que se importarían tal cual (folio incluido). */
  aImportar: Record<string, unknown>[];
  omitidas: OrdenTraspasoOmitida[];
  /** Órdenes cuyo técnico principal no se encontró por nombre: se importan sin principal. */
  sinPrincipalLocal: number;
}

export type ResultadoImportarOrdenes = { importadas: number; omitidas: number; detalleOmitidas: string[]; sinPrincipalLocal: number };

/**
 * Traspaso de órdenes entre dispositivos (ej. jefe de brigada de
 * vacaciones, un técnico queda a cargo y después el jefe agrega lo que
 * ese técnico generó). Lleva la orden COMPLETA (servicios, materiales,
 * técnicos, firmas) — no el resumen que usan exportarOrdenesCSV/PDF.
 *
 * Formato v2: el folio VIAJA con la orden (`folio`) y NO se renumera al
 * importar. `tecnicoId` no viaja como número (cada dispositivo tiene su
 * propia tabla de técnicos): se envían los nombres del técnico y del
 * principal, y del otro lado se reasocian por nombre.
 */
export async function exportarOrdenesJSON(ordenes: OrdenDashboard[]): Promise<void> {
  const db = await getDatabase();
  const completas = [];
  const nombreTecnico = async (id: number | null): Promise<string | null> => {
    if (!id) return null;
    const t = await db.getFirstAsync<{ nombre: string }>(`SELECT nombre FROM tecnicos WHERE id=?`, id);
    return t?.nombre ?? null;
  };
  for (const resumen of ordenes) {
    const completa = await obtenerOrden(resumen.id);
    if (!completa) continue;
    const tecnicoNombre = await nombreTecnico(completa.tecnicoId);
    const principalNombre = await nombreTecnico(completa.tecnicoPrincipalId ?? null);
    const { id, numeroOrden, tecnicoId, tecnicoPrincipalId, claveGuardado, ...resto } = completa;
    completas.push({
      ...resto,
      folio: numeroOrden,
      folioOrigen: numeroOrden,
      tecnicoNombre,
      principalNombre,
      materiales: completa.materiales.map(({ id, ordenId, ...m }) => m),
      servicios: completa.servicios.map(({ id, ordenId, ...s }) => s),
      tecnicos: completa.tecnicos.map(({ id, ordenId, ...t }) => t),
      equipos: completa.equipos.map(({ id, ordenId, ...e }) => e),
    });
  }
  const payload = { version: 2, exportadoEn: new Date().toISOString(), ordenes: completas };
  await compartirTexto(JSON.stringify(payload, null, 2), nombreArchivoConFecha('gbottel-ordenes-traspaso', 'json'));
}

function descripcionOrden(o: Record<string, unknown>): { folio: string; cliente: string } {
  return {
    folio: typeof o.folio === 'string' && o.folio ? o.folio : typeof o.folioOrigen === 'string' && o.folioOrigen ? o.folioOrigen : '(sin folio)',
    cliente: typeof o.clienteNombre === 'string' && o.clienteNombre ? o.clienteNombre : 'sin cliente',
  };
}

/** Valida el archivo de traspaso y decide qué se importa y qué se omite. No modifica la base. */
export async function prepararTraspasoDesdeTexto(contenido: string): Promise<PreparacionTraspaso> {
  let datos: unknown;
  try {
    datos = JSON.parse(contenido);
  } catch {
    throw new ErrorFolios('TRASPASO_INVALIDO', 'El archivo no es JSON.');
  }
  if (!esObjeto(datos) || !Array.isArray(datos.ordenes)) {
    throw new ErrorFolios('TRASPASO_INVALIDO', 'El archivo no tiene el formato esperado de traspaso de órdenes.');
  }

  const db = await getDatabase();
  return clasificarTraspaso(db, datos.ordenes as unknown[]);
}

async function clasificarTraspaso(db: Awaited<ReturnType<typeof getDatabase>>, ordenesArchivo: unknown[]): Promise<PreparacionTraspaso> {
  const rangos = await db.getAllAsync<{ desde: number; hasta: number; historico: number; nombre: string | null }>(
    `SELECT r.desde, r.hasta, r.historico, COALESCE(t.nombre, r.tecnicoNombre) AS nombre
     FROM folio_rangos r LEFT JOIN tecnicos t ON t.id = r.tecnicoId`
  );
  const tecnicos = await db.getAllAsync<{ id: number; nombre: string }>(`SELECT id, nombre FROM tecnicos`);
  const nombresLocales = new Set(tecnicos.map((t) => t.nombre));
  const enLibro = new Set((await db.getAllAsync<{ numero: string }>(`SELECT numero FROM folios_emitidos`)).map((r) => r.numero));
  const existentes = await db.getAllAsync<{ numeroOrden: string }>(`SELECT numeroOrden FROM ordenes`);
  const ordenesLocales = new Set(existentes.map((o) => o.numeroOrden));

  const aImportar: Record<string, unknown>[] = [];
  const omitidas: OrdenTraspasoOmitida[] = [];
  const vistos = new Set<string>();
  let sinPrincipalLocal = 0;

  for (const bruta of ordenesArchivo) {
    if (!esObjeto(bruta)) {
      omitidas.push({ folio: '(desconocido)', cliente: '', motivo: 'Entrada que no es una orden.' });
      continue;
    }
    const { folio: f, cliente } = descripcionOrden(bruta);
    const omitir = (motivo: string) => omitidas.push({ folio: f, cliente, motivo });
    const folio = typeof bruta.folio === 'string' ? bruta.folio : '';
    if (!folio) {
      omitir('Archivo antiguo sin folio permanente: vuelve a exportarla desde esta versión de GBOTtel.');
      continue;
    }
    if (vistos.has(folio)) {
      omitir('Folio repetido dentro del archivo.');
      continue;
    }
    vistos.add(folio);
    if (ordenesLocales.has(folio)) {
      omitir('Ya existe una orden con ese folio en este dispositivo.');
      continue;
    }
    if (enLibro.has(folio)) {
      omitir('Ese folio ya fue emitido en este dispositivo (su orden fue eliminada); no se reutiliza.');
      continue;
    }
    const numero = numeroDeFolio(folio);
    if (numero != null) {
      const principal = typeof bruta.principalNombre === 'string' ? bruta.principalNombre : null;
      const choque = rangos.find((r) => r.desde <= numero && numero <= r.hasta);
      if (choque && (choque.historico || !principal || choque.nombre !== principal)) {
        omitir(`El folio cae dentro de un bloque de este dispositivo que no pertenece a ${principal ?? 'ese técnico principal'}.`);
        continue;
      }
    }
    const principalNombre = typeof bruta.principalNombre === 'string' ? bruta.principalNombre : null;
    if (principalNombre && !nombresLocales.has(principalNombre)) sinPrincipalLocal++;
    aImportar.push(bruta);
  }
  return { aImportar, omitidas, sinPrincipalLocal };
}

export async function prepararTraspaso(): Promise<PreparacionTraspaso | null> {
  const contenido = await elegirYLeerArchivo(['application/json']);
  if (contenido === null) return null;
  return prepararTraspasoDesdeTexto(contenido);
}

/**
 * Importa las órdenes aceptables en UNA transacción exclusiva: todas o
 * ninguna. Cada una conserva su folio, que pasa al libro de folios; nunca
 * se renumera nada de lo existente. Los casos que cambiaron desde la
 * previsualización (p. ej. otro guardado) se vuelven a clasificar dentro.
 */
export async function aplicarTraspaso(prep: PreparacionTraspaso): Promise<ResultadoImportarOrdenes> {
  return enSerieFolios(async () => {
    const db = await getDatabase();
    let resultado: ResultadoImportarOrdenes = { importadas: 0, omitidas: 0, detalleOmitidas: [], sinPrincipalLocal: 0 };

    await db.withExclusiveTransactionAsync(async (txn) => {
      const vigente = await clasificarTraspaso(txn, prep.aImportar);
      const tecnicosPropios = await txn.getAllAsync<{ id: number; nombre: string }>(`SELECT id, nombre FROM tecnicos`);
      const idPorNombre = new Map(tecnicosPropios.map((t) => [t.nombre, t.id]));

      const ordenadas = [...vigente.aImportar].sort((a, b) => String(a.fechaReporte ?? '').localeCompare(String(b.fechaReporte ?? '')));
      for (const o of ordenadas) {
        const { folio, folioOrigen, tecnicoNombre, principalNombre, equipos, materiales, servicios, tecnicos, ...datosOrden } = o as Record<string, unknown> & {
          folio: string;
          folioOrigen?: string;
          tecnicoNombre?: string | null;
          principalNombre?: string | null;
          equipos?: Record<string, unknown>[];
          materiales?: Record<string, unknown>[];
          servicios?: Record<string, unknown>[];
          tecnicos?: Record<string, unknown>[];
        };
        const tecnicoId = tecnicoNombre ? idPorNombre.get(tecnicoNombre) ?? null : null;
        const principalId = principalNombre ? idPorNombre.get(principalNombre) ?? null : null;
        // El folio entra al libro ANTES que la orden: si ya estaba, la transacción entera se revierte.
        await txn.runAsync(`INSERT INTO folios_emitidos (numero, origen) VALUES (?, 'importado')`, folio);
        const id = await insertarOrdenNueva(txn, folio, principalId, null, { ...datosOrden, tecnicoId } as NuevaOrden);
        await reemplazarHijosDeOrden(txn, id, {
          equipos: (equipos ?? []) as unknown as NuevoOrdenEquipo[],
          materiales: (materiales ?? []) as unknown as NuevoOrdenMaterial[],
          servicios: (servicios ?? []) as unknown as ServicioParaGuardar[],
          tecnicos: (tecnicos ?? []).map((t) => ({
            ...t,
            tecnicoId: t.nombre ? idPorNombre.get(String(t.nombre)) ?? null : null,
          })) as unknown as NuevoOrdenTecnico[],
        });
      }
      await txn.runAsync(`UPDATE ordenes SET estado = 'pendiente' WHERE estado = 'en_progreso'`);
      resultado = {
        importadas: ordenadas.length,
        omitidas: prep.omitidas.length + (prep.aImportar.length - vigente.aImportar.length),
        detalleOmitidas: [...prep.omitidas, ...vigente.omitidas].map((x) => `${x.folio} — ${x.cliente}: ${x.motivo}`),
        sinPrincipalLocal: vigente.sinPrincipalLocal,
      };
    });
    return resultado;
  });
}
