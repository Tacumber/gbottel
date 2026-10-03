/**
 * services/tarifarioService.ts
 *
 * Capa de acceso a datos del módulo Tarifario — Fase 1.1.
 * Cubre: crear, leer, listar, actualizar, dar de baja (soft delete).
 *
 * La búsqueda por texto (FTS5) y los filtros avanzados (categoría,
 * precio, técnico) se agregan en la Fase 1.3, sobre esta misma base.
 */
import { getDatabase } from '../database/db';
import type {
  Servicio,
  NuevoServicio,
  ActualizacionServicio,
  OpcionesListado,
} from '../types/tarifario.types';

export async function crearServicio(datos: NuevoServicio): Promise<number> {
  const db = await getDatabase();

  const existente = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM servicios WHERE codigoServicio = ?',
    datos.codigoServicio
  );
  if (existente) {
    throw new Error(`Ya existe un servicio con el código "${datos.codigoServicio}".`);
  }

  const resultado = await db.runAsync(
    `INSERT INTO servicios
      (codigoServicio, nombreServicio, categoria, descripcionTecnica, detalleFactura, unidad, precioBase, precioTecnico, tiempoEstimado, cantidadTecnicos, idPropietario, insumosCUP)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    datos.codigoServicio,
    datos.nombreServicio,
    datos.categoria,
    datos.descripcionTecnica,
    datos.detalleFactura ?? null,
    datos.unidad,
    datos.precioBase,
    datos.precioTecnico,
    datos.tiempoEstimado,
    datos.cantidadTecnicos ?? 1,
    datos.idPropietario ?? null,
    datos.insumosCUP ?? null
  );

  return resultado.lastInsertRowId;
}

/**
 * Importación masiva desde el JSON generado a partir del xlsx real
 * (ver src/data/servicios_seed.json). Corre en una sola transacción:
 * si algo falla a mitad de camino, no deja la base a medio importar.
 *
 * No usa crearServicio() fila por fila (sería 1858 SELECT + 1858 INSERT
 * por separado) — hace el INSERT directo y deja que la restricción
 * UNIQUE de codigoServicio detecte duplicados, contándolos en vez de
 * frenar toda la importación por uno solo.
 */
export async function importarServiciosDesdeJSON(
  servicios: NuevoServicio[]
): Promise<{ importados: number; duplicados: number; errores: string[] }> {
  const db = await getDatabase();
  let importados = 0;
  let duplicados = 0;
  const errores: string[] = [];

  await db.withTransactionAsync(async () => {
    for (const s of servicios) {
      try {
        await db.runAsync(
          `INSERT INTO servicios
            (codigoServicio, nombreServicio, categoria, descripcionTecnica, detalleFactura, unidad, precioBase, precioTecnico, tiempoEstimado, cantidadTecnicos, idPropietario, insumosCUP)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          s.codigoServicio,
          s.nombreServicio,
          s.categoria,
          s.descripcionTecnica,
          s.detalleFactura ?? null,
          s.unidad,
          s.precioBase,
          s.precioTecnico,
          s.tiempoEstimado,
          s.cantidadTecnicos ?? 1,
          s.idPropietario ?? null,
          s.insumosCUP ?? null
        );
        importados++;
      } catch (err) {
        // Solo se cuenta como "duplicado" si la causa real es la
        // restricción UNIQUE(codigoServicio). Cualquier otro error (NOT
        // NULL, tipo de dato inválido, etc.) es un problema de datos real
        // y se cuenta aparte — antes se mezclaban los dos bajo
        // "duplicados", lo que escondía errores genuinos.
        const mensaje = String(err);
        if (/UNIQUE constraint failed/i.test(mensaje)) {
          duplicados++;
        } else if (errores.length < 20) {
          errores.push(`${s.codigoServicio}: ${mensaje}`);
        }
      }
    }
  });

  return { importados, duplicados, errores };
}

/**
 * Renombra en bloque una categoría (ej. reemplazar los placeholders
 * "Modalidad 1"…"Modalidad 4" por los nombres reales una vez confirmados).
 * Devuelve cuántas filas cambiaron.
 */
export async function renombrarCategoria(nombreActual: string, nombreNuevo: string): Promise<number> {
  const db = await getDatabase();
  const resultado = await db.runAsync(
    `UPDATE servicios SET categoria = ?, actualizadoEn = datetime('now') WHERE categoria = ?`,
    nombreNuevo,
    nombreActual
  );
  return resultado.changes;
}

export async function obtenerServicioPorId(id: number): Promise<Servicio | null> {
  const db = await getDatabase();
  return db.getFirstAsync<Servicio>('SELECT * FROM servicios WHERE id = ?', id);
}

export async function obtenerServicioPorCodigo(codigo: string): Promise<Servicio | null> {
  const db = await getDatabase();
  return db.getFirstAsync<Servicio>('SELECT * FROM servicios WHERE codigoServicio = ?', codigo);
}

export async function listarServicios(opciones: OpcionesListado = {}): Promise<Servicio[]> {
  const { incluirInactivos = false, categoria, limite = 100, offset = 0 } = opciones;
  const db = await getDatabase();
  const condiciones = [incluirInactivos ? null : 'activo = 1', categoria ? 'categoria = ?' : null].filter(
    (c): c is string => c !== null
  );
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const parametros = [...(categoria ? [categoria] : []), limite, offset];
  return db.getAllAsync<Servicio>(
    `SELECT * FROM servicios ${where} ORDER BY nombreServicio ASC LIMIT ? OFFSET ?`,
    ...parametros
  );
}

export async function contarServicios(incluirInactivos = false): Promise<number> {
  const db = await getDatabase();
  const condicion = incluirInactivos ? '' : 'WHERE activo = 1';
  const fila = await db.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) as total FROM servicios ${condicion}`
  );
  return fila?.total ?? 0;
}

// Whitelist explícita de columnas editables. ActualizacionServicio ya lo
// garantiza en tiempo de compilación, pero los tipos de TypeScript
// desaparecen en tiempo de ejecución — si este objeto alguna vez viene de
// un formulario o de datos externos (sin pasar por el tipo), sin esta
// whitelist el nombre de columna se interpola directo en el SQL. No es
// hipotético: es exactamente la forma que va a tener la próxima pantalla
// de edición del Tarifario.
const COLUMNAS_EDITABLES_SERVICIO = new Set<string>([
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
]);

export async function actualizarServicio(id: number, cambios: ActualizacionServicio): Promise<void> {
  // Se filtran los valores undefined explícitamente: SQLite no acepta
  // "undefined" como parámetro enlazado (solo string, number o null).
  const entradas = Object.entries(cambios).filter(([, valor]) => valor !== undefined) as [string, string | number | null][];
  if (entradas.length === 0) return;

  for (const [campo] of entradas) {
    if (!COLUMNAS_EDITABLES_SERVICIO.has(campo)) {
      throw new Error(`Campo no editable o inexistente: "${campo}".`);
    }
  }

  const db = await getDatabase();
  const asignaciones = entradas.map(([campo]) => `${campo} = ?`).join(', ');
  const valores = entradas.map(([, valor]) => valor);

  await db.runAsync(
    `UPDATE servicios SET ${asignaciones}, actualizadoEn = datetime('now') WHERE id = ?`,
    ...valores,
    id
  );
}

/**
 * Baja lógica, NO física. Un servicio puede estar referenciado por
 * órdenes ya finalizadas o facturadas (orden_servicios.servicioId).
 * Borrarlo de verdad rompería el historial de esas órdenes. "Eliminar"
 * en la UI marca activo = 0 y el servicio deja de aparecer en el
 * Tarifario y en las búsquedas, pero las órdenes viejas lo siguen
 * mostrando correctamente.
 */
export async function eliminarServicio(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE servicios SET activo = 0, actualizadoEn = datetime('now') WHERE id = ?`,
    id
  );
}

export async function reactivarServicio(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE servicios SET activo = 1, actualizadoEn = datetime('now') WHERE id = ?`,
    id
  );
}

/**
 * Traduce texto libre del usuario a una consulta FTS5 segura.
 *
 * FTS5 interpreta *, ", -, (, ), : y AND/OR/NOT como sintaxis de consulta,
 * no como texto literal. Si el texto del usuario se pasara tal cual a
 * MATCH, escribir algo tan común como "instalación (2 técnicos)" rompería
 * la consulta con un error de sintaxis, y alguien escribiendo "OR" como
 * palabra normal alteraría el resultado. Cada palabra se envuelve en
 * comillas dobles (con las comillas internas escapadas duplicándolas, la
 * forma en que FTS5 espera un string literal) y se le agrega un sufijo de
 * prefijo, para que "torni" ya encuentre "tornillo" mientras se escribe.
 */
function construirConsultaFTS(texto: string): string {
  const palabras = texto
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((palabra) => `"${palabra.replace(/"/g, '""')}"*`);
  return palabras.join(' AND ');
}

/**
 * Búsqueda de texto completo sobre nombreServicio, descripcionTecnica y
 * codigoServicio, usando el índice servicios_fts (Fase 1.3 — la
 * infraestructura ya estaba en schema.ts, esta función faltaba).
 * Si el texto queda vacío tras recortar espacios, cae de vuelta a
 * listarServicios() en vez de lanzar una consulta MATCH vacía.
 */
export async function buscarServicios(
  texto: string,
  opciones: OpcionesListado = {}
): Promise<Servicio[]> {
  const consulta = construirConsultaFTS(texto);
  if (!consulta) return listarServicios(opciones);

  const { incluirInactivos = false, categoria, limite = 100, offset = 0 } = opciones;
  const db = await getDatabase();
  const condicionesExtra = [incluirInactivos ? null : 's.activo = 1', categoria ? 's.categoria = ?' : null].filter(
    (c): c is string => c !== null
  );
  const condicion = condicionesExtra.length ? `AND ${condicionesExtra.join(' AND ')}` : '';
  const parametros = [consulta, ...(categoria ? [categoria] : []), limite, offset];

  try {
    return await db.getAllAsync<Servicio>(
      `SELECT s.* FROM servicios_fts
       JOIN servicios s ON s.id = servicios_fts.rowid
       WHERE servicios_fts MATCH ? ${condicion}
       ORDER BY servicios_fts.rank
       LIMIT ? OFFSET ?`,
      ...parametros
    );
  } catch {
    // FTS5 no existe en esta plataforma (típico en web, ver db.ts) o la
    // tabla servicios_fts no llegó a crearse. Se cae a LIKE: más lento,
    // pero con 1858 filas no es un problema real, y funciona en
    // cualquier plataforma sin depender de qué build de SQLite haya.
    return buscarServiciosConLike(texto, opciones);
  }
}

async function buscarServiciosConLike(texto: string, opciones: OpcionesListado): Promise<Servicio[]> {
  const { incluirInactivos = false, categoria, limite = 100, offset = 0 } = opciones;
  const db = await getDatabase();
  const condiciones = [
    incluirInactivos ? null : 'activo = 1',
    categoria ? 'categoria = ?' : null,
    '(nombreServicio LIKE ? OR descripcionTecnica LIKE ? OR codigoServicio LIKE ?)',
  ].filter((c): c is string => c !== null);
  const comodin = `%${texto.trim()}%`;
  const parametros = [...(categoria ? [categoria] : []), comodin, comodin, comodin, limite, offset];

  return db.getAllAsync<Servicio>(
    `SELECT * FROM servicios WHERE ${condiciones.join(' AND ')} ORDER BY nombreServicio ASC LIMIT ? OFFSET ?`,
    ...parametros
  );
}

/** Categorías activas con su conteo — alimenta los chips de filtro del Tarifario. */
export async function obtenerCategorias(): Promise<{ categoria: string; total: number }[]> {
  const db = await getDatabase();
  return db.getAllAsync<{ categoria: string; total: number }>(
    `SELECT categoria, COUNT(*) as total FROM servicios WHERE activo = 1 GROUP BY categoria ORDER BY categoria ASC`
  );
}

/** Estadísticas agregadas del catálogo activo — para el Tablero. */
export async function obtenerEstadisticasTarifario(): Promise<{
  total: number;
  precioPromedio: number;
  precioMinimo: number;
  precioMaximo: number;
}> {
  const db = await getDatabase();
  const fila = await db.getFirstAsync<{
    total: number;
    precioPromedio: number | null;
    precioMinimo: number | null;
    precioMaximo: number | null;
  }>(
    `SELECT COUNT(*) as total, AVG(precioBase) as precioPromedio,
            MIN(precioBase) as precioMinimo, MAX(precioBase) as precioMaximo
     FROM servicios WHERE activo = 1`
  );
  return {
    total: fila?.total ?? 0,
    precioPromedio: fila?.precioPromedio ?? 0,
    precioMinimo: fila?.precioMinimo ?? 0,
    precioMaximo: fila?.precioMaximo ?? 0,
  };
}
