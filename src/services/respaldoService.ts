import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { getDatabase } from '../database/db';
import type { OrdenDashboard } from './analyticsService';
import { guardarOrdenCompleta, obtenerOrden } from './ordenesService';
import type { NuevoServicio, Servicio } from '../types/tarifario.types';
import { importarServiciosDesdeJSON, listarServicios } from './tarifarioService';

const VERSION_RESPALDO = 2;

interface RespaldoCompleto {
  version: number;
  exportadoEn: string;
  tablas: {
    servicios: unknown[];
    tecnicos: unknown[];
    configuracion: unknown[];
    ordenes: unknown[];
    orden_materiales: unknown[];
    orden_servicios: unknown[];
    orden_tecnicos: unknown[];
  };
}

function nombreArchivoConFecha(prefijo: string, extension: string): string {
  const fecha = new Date().toISOString().slice(0, 10);
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
  const [servicios, tecnicos, configuracion, ordenes, orden_materiales, orden_servicios, orden_tecnicos] =
    await Promise.all([
      db.getAllAsync(`SELECT * FROM servicios`),
      db.getAllAsync(`SELECT * FROM tecnicos`),
      db.getAllAsync(`SELECT * FROM configuracion`),
      db.getAllAsync(`SELECT * FROM ordenes`),
      db.getAllAsync(`SELECT * FROM orden_materiales`),
      db.getAllAsync(`SELECT * FROM orden_servicios`),
      db.getAllAsync(`SELECT * FROM orden_tecnicos`),
    ]);

  const respaldo: RespaldoCompleto = {
    version: VERSION_RESPALDO,
    exportadoEn: new Date().toISOString(),
    tablas: { servicios, tecnicos, configuracion, ordenes, orden_materiales, orden_servicios, orden_tecnicos },
  };

  await compartirTexto(JSON.stringify(respaldo, null, 2), nombreArchivoConFecha('gbottel-respaldo', 'json'));
}

/**
 * Reemplaza TODA la base local con lo que venga en el archivo. No es una
 * fusión — lo que había antes en este dispositivo se pierde. Se avisa
 * esto en la pantalla antes de llamar a esta función, no acá.
 */
export async function importarRespaldoCompleto(): Promise<{ importado: boolean }> {
  const contenido = await elegirYLeerArchivo(['application/json']);
  if (contenido === null) return { importado: false };

  const datos = JSON.parse(contenido) as RespaldoCompleto;
  if (!datos?.tablas) {
    throw new Error('El archivo no tiene el formato esperado de un respaldo de GBOTtel.');
  }

  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    // Hijos antes que padres, para no chocar con las llaves foráneas.
    await db.runAsync(`DELETE FROM orden_materiales`);
    await db.runAsync(`DELETE FROM orden_servicios`);
    await db.runAsync(`DELETE FROM orden_tecnicos`);
    await db.runAsync(`DELETE FROM ordenes`);
    await db.runAsync(`DELETE FROM tecnicos`);
    await db.runAsync(`DELETE FROM servicios`);
    await db.runAsync(`DELETE FROM configuracion`);

    await insertarFilas(db, 'servicios', datos.tablas.servicios);
    await insertarFilas(db, 'tecnicos', datos.tablas.tecnicos);
    await insertarFilas(db, 'configuracion', datos.tablas.configuracion);
    await insertarFilas(db, 'ordenes', datos.tablas.ordenes);
    await insertarFilas(db, 'orden_materiales', datos.tablas.orden_materiales);
    await insertarFilas(db, 'orden_servicios', datos.tablas.orden_servicios);
    await insertarFilas(db, 'orden_tecnicos', datos.tablas.orden_tecnicos);
  });

  return { importado: true };
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
    'estado',
    'creadoEn',
  ]),
  configuracion: new Set(['clave', 'valor']),
  ordenes: new Set([
    'id',
    'numeroOrden',
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
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM orden_materiales`);
    await db.runAsync(`DELETE FROM orden_servicios`);
    await db.runAsync(`DELETE FROM orden_tecnicos`);
    await db.runAsync(`DELETE FROM ordenes`);
    await db.runAsync(`DELETE FROM tecnicos`);
    await db.runAsync(`DELETE FROM servicios`);
    await db.runAsync(`DELETE FROM configuracion`);
  });
}

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: 'Pendiente', en_progreso: 'En progreso', finalizada: 'Finalizada', facturada: 'Facturada',
};

function moneda(n: number, codigo: 'CUP' | 'USD'): string {
  return new Intl.NumberFormat('es-CU', { style: 'currency', currency: codigo, maximumFractionDigits: 0 }).format(n || 0);
}

function escaparCSV(valor: string): string {
  return /[",\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
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
    o.folio, o.cliente, o.fecha?.slice(0, 10) ?? '',
    ETIQUETA_ESTADO[o.estado] ?? o.estado,
    String(o.totalCUP ?? 0), String(o.totalUSD ?? 0),
  ]);
  const csv = [encabezados, ...filas].map((fila) => fila.map(escaparCSV).join(',')).join('\n');
  await compartirTexto(csv, nombreArchivoConFecha('gbottel-ordenes', 'csv'));
}

export async function exportarOrdenesPDF(ordenes: OrdenDashboard[]): Promise<void> {
  const filas = ordenes
    .map(
      (o) => `<tr>
        <td>${escaparHTML(o.folio)}</td>
        <td>${escaparHTML(o.cliente)}</td>
        <td>${escaparHTML(o.fecha?.slice(0, 10) ?? '')}</td>
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
      <div class="sub">Generado el ${new Date().toLocaleDateString('es-CU')} · ${ordenes.length} orden${ordenes.length === 1 ? '' : 'es'}</div>
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

export type ResultadoImportarOrdenes = { importadas: number; omitidas: number; detalleOmitidas: string[] };

/**
 * Traspaso de órdenes entre dispositivos (ej. jefe de brigada de
 * vacaciones, un técnico queda a cargo y después el jefe agrega lo que
 * ese técnico generó). Lleva la orden COMPLETA (servicios, materiales,
 * técnicos, firmas) — no el resumen que usan exportarOrdenesCSV/PDF.
 *
 * El folio (numeroOrden) no viaja: es literalmente el id interno con
 * ceros adelante, así que el folio 000015 en un teléfono no tiene
 * relación con el 000015 de otro — coinciden por casualidad. Se manda
 * como folioOrigen, solo de referencia. tecnicoId tampoco viaja como
 * número (mismo problema, cada dispositivo tiene su propia tabla de
 * técnicos con sus propios ids) — se manda el nombre, y del otro lado se
 * intenta volver a asociar por nombre.
 */
export async function exportarOrdenesJSON(ordenes: OrdenDashboard[]): Promise<void> {
  const db = await getDatabase();
  const completas = [];
  for (const resumen of ordenes) {
    const completa = await obtenerOrden(resumen.id);
    if (!completa) continue;
    let tecnicoNombre: string | null = null;
    if (completa.tecnicoId) {
      const t = await db.getFirstAsync<{ nombre: string }>(`SELECT nombre FROM tecnicos WHERE id=?`, completa.tecnicoId);
      tecnicoNombre = t?.nombre ?? null;
    }
    const { id, numeroOrden, tecnicoId, ...resto } = completa;
    completas.push({
      ...resto,
      folioOrigen: numeroOrden,
      tecnicoNombre,
      materiales: completa.materiales.map(({ id, ordenId, ...m }) => m),
      servicios: completa.servicios.map(({ id, ordenId, ...s }) => s),
      tecnicos: completa.tecnicos.map(({ id, ordenId, ...t }) => t),
    });
  }
  const payload = { version: 1, exportadoEn: new Date().toISOString(), ordenes: completas };
  await compartirTexto(JSON.stringify(payload, null, 2), nombreArchivoConFecha('gbottel-ordenes-traspaso', 'json'));
}

async function renumerarOrdenesPorFecha(): Promise<void> {
  const db = await getDatabase();
  const todas = await db.getAllAsync<{ id: number; fecha: string }>(
    `SELECT id, COALESCE(NULLIF(fechaReporte,''),creadoEn) fecha FROM ordenes ORDER BY fecha ASC, id ASC`
  );
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < todas.length; i++) {
      await db.runAsync(`UPDATE ordenes SET numeroOrden = ? WHERE id = ?`, String(i + 1).padStart(6, '0'), todas[i].id);
    }
  });
}

/**
 * mantenerNumeracion=true (recomendado si ya compartiste algún folio en
 * papel con un cliente): las órdenes nuevas se agregan DESPUÉS de las que
 * ya tenés, ordenadas por fecha entre ellas mismas — el folio nuevo lo
 * asigna guardarOrdenCompleta() con el mismo mecanismo de siempre. Los
 * folios que ya existían no se tocan.
 *
 * mantenerNumeracion=false: además de importar, renumera TODAS las
 * órdenes del dispositivo (las tuyas y las nuevas) en orden cronológico
 * estricto. No toca ningún id ni relación — numeroOrden es solo una
 * etiqueta de texto, así que renumerar es seguro para los datos, pero
 * cambia el folio de órdenes que ya existían.
 */
export async function importarOrdenesJSON(mantenerNumeracion: boolean): Promise<ResultadoImportarOrdenes | null> {
  const contenido = await elegirYLeerArchivo(['application/json']);
  if (contenido === null) return null;

  const datos = JSON.parse(contenido);
  if (!datos || !Array.isArray(datos.ordenes)) {
    throw new Error('El archivo no tiene el formato esperado de traspaso de órdenes.');
  }

  const db = await getDatabase();
  const existentes = await db.getAllAsync<{ clienteNombre: string | null; fechaReporte: string | null }>(
    `SELECT clienteNombre, fechaReporte FROM ordenes`
  );
  const clavesExistentes = new Set(existentes.map((o) => `${o.clienteNombre ?? ''}|${o.fechaReporte ?? ''}`));

  const tecnicosPropios = await db.getAllAsync<{ id: number; nombre: string }>(`SELECT id, nombre FROM tecnicos`);
  const idPorNombreTecnico = new Map(tecnicosPropios.map((t) => [t.nombre, t.id]));

  const porImportar: Record<string, unknown>[] = [];
  const detalleOmitidas: string[] = [];
  for (const o of datos.ordenes as Record<string, unknown>[]) {
    const clave = `${o.clienteNombre ?? ''}|${o.fechaReporte ?? ''}`;
    if (clavesExistentes.has(clave)) {
      detalleOmitidas.push(`${o.folioOrigen ?? '(sin folio)'} — ${o.clienteNombre ?? 'sin cliente'}`);
      continue;
    }
    porImportar.push(o);
  }
  porImportar.sort((a, b) => String(a.fechaReporte ?? '').localeCompare(String(b.fechaReporte ?? '')));

  let importadas = 0;
  for (const o of porImportar) {
    const { folioOrigen, tecnicoNombre, materiales, servicios, tecnicos, ...datosOrden } = o as Record<string, unknown> & {
      folioOrigen?: string; tecnicoNombre?: string | null;
      materiales?: Record<string, unknown>[]; servicios?: Record<string, unknown>[]; tecnicos?: Record<string, unknown>[];
    };
    const tecnicoId = tecnicoNombre ? idPorNombreTecnico.get(tecnicoNombre) ?? null : null;
    await guardarOrdenCompleta(null, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      datos: { ...datosOrden, tecnicoId } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      materiales: (materiales ?? []) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      servicios: (servicios ?? []) as any,
      tecnicos: (tecnicos ?? []).map((t) => ({
        ...t,
        tecnicoId: t.nombre ? idPorNombreTecnico.get(String(t.nombre)) ?? null : null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })) as any,
    });
    importadas++;
  }

  if (!mantenerNumeracion) {
    await renumerarOrdenesPorFecha();
  }

  return { importadas, omitidas: detalleOmitidas.length, detalleOmitidas };
}
