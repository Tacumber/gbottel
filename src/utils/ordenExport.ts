/**
 * Exportación de órdenes completas con la disposición del MODELO OFICIAL de la Orden de Servicio
 * COPEXTEL (cabecera con folio, cobertura, cliente / servicio / equipo, materiales, servicios,
 * totales y conformidad). Genera un libro XLSX real (una hoja por orden) y el HTML para el PDF
 * a partir de UNA misma descripción del formulario (`formularioOrden`), de modo que ambos
 * formatos son idénticos. Sin dependencias externas ni acceso a la base: recibe la orden ya leída
 * de SQLite y sus totales de `calcularTotales`, así el importe exportado es EXACTAMENTE el guardado.
 * Siempre incluye todo el formulario: ocultar secciones en pantalla no afecta a la exportación.
 *
 * Importe de cada línea = precio unitario × cantidad, calculado UNA vez (cantidad ≤ 0 aporta 0,
 * igual que calcularTotales). Nota: el modelo impreso rotula la segunda moneda «CUC»; la app
 * guarda USD, por eso las columnas se rotulan «CUP» y «USD».
 */
import type { OrdenCompleta, TotalesOrden } from '../types/ordenes.types';
import { formatearFecha } from './fechas';
import { formatearImporte, normalizarImporte } from './moneda';

export interface CeldaImporte {
  importe: number;
  moneda: 'CUP' | 'USD';
}

export type EstiloCelda =
  | 'logo'
  | 'titulo'
  | 'seccion'
  | 'etiqueta'
  | 'valor'
  | 'encabezado'
  | 'numero'
  | 'importe'
  | 'total'
  | 'totalImporte'
  | 'folio'
  | 'libre';

export interface CeldaForm {
  /** Columnas que ocupa (la fila completa suma COLUMNAS). */
  span: number;
  texto?: string | null;
  numero?: number | null;
  importe?: CeldaImporte;
  estilo: EstiloCelda;
}
export interface FilaForm {
  celdas: CeldaForm[];
  /** Alto en puntos (filas altas como Observaciones). */
  alto?: number;
}
export interface Hoja {
  nombre: string;
  filas: FilaForm[];
}

/** Columnas de la rejilla del formulario. */
export const COLUMNAS = 12;
/** Anchos relativos de las 12 columnas (caracteres en XLSX, proporción en PDF). */
const ANCHOS = [8, 11, 11, 13, 13, 13, 6, 6, 10, 10, 14, 14];
const MIN_FILAS_MATERIALES = 8;
const MIN_FILAS_SERVICIOS = 6;

function modalidadesSet(valor: string | null): Set<string> {
  if (!valor) return new Set();
  try {
    const d: unknown = JSON.parse(valor);
    return new Set(Array.isArray(d) ? d.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Misma regla que calcularTotales: una cantidad no válida (≤ 0) no suma. */
const cv = (c: number) => (Number.isFinite(c) && c > 0 ? c : 0);
const cup = (n: number): CeldaImporte => ({ importe: normalizarImporte(n), moneda: 'CUP' });
const usd = (n: number): CeldaImporte => ({ importe: normalizarImporte(n), moneda: 'USD' });
const marca = (activo: boolean, texto: string) => `${activo ? '[X]' : '[  ]'} ${texto}`;

const E = (texto: string, span: number): CeldaForm => ({ span, texto, estilo: 'etiqueta' });
const V = (texto: string | null | undefined, span: number): CeldaForm => ({ span, texto: texto ?? '', estilo: 'valor' });
const N = (numero: number | null | undefined, span: number): CeldaForm => ({ span, numero: numero ?? null, estilo: 'numero' });
const I = (importe: CeldaImporte | undefined, span: number): CeldaForm => ({ span, importe, estilo: 'importe' });
const H = (texto: string, span: number): CeldaForm => ({ span, texto, estilo: 'encabezado' });
const S = (texto: string, span: number): CeldaForm => ({ span, texto, estilo: 'seccion' });
const L = (texto: string, span: number): CeldaForm => ({ span, texto, estilo: 'libre' });
const fila = (celdas: CeldaForm[], alto?: number): FilaForm => ({ celdas, alto });

/**
 * Formulario de UNA orden con la disposición del modelo oficial. Cada fila suma exactamente
 * COLUMNAS columnas (se comprueba al construirlo).
 */
export function formularioOrden(o: OrdenCompleta, t: TotalesOrden): FilaForm[] {
  const f: FilaForm[] = [];
  const tipo = (o.clienteTipo ?? '').trim();
  const sufijoCliente = tipo ? ` Cliente ${tipo}` : ' Cliente';
  const mods = modalidadesSet(o.modalidadesServicio);
  const cob = o.tipoCobertura;

  f.push(fila([{ span: COLUMNAS, texto: 'ORDEN DE SERVICIO', estilo: 'titulo' }], 24));
  f.push(fila([{ span: 6, texto: 'COPEXTEL', estilo: 'logo' }, { span: 6, texto: '', estilo: 'libre' }], 22));

  // Cabecera: reporte (izquierda) y folio / códigos (derecha)
  f.push(fila([E('Código del Reporte', 2), V(o.codigoReporte, 3), E('Folio de la Orden', 3), { span: 4, texto: o.numeroOrden, estilo: 'folio' }], 20));
  f.push(fila([E('Reportado por', 2), V(o.reportadoPor, 3), E('Código de la Orden', 3), V(o.codigoOrden, 4)]));
  f.push(fila([E('Fecha del Reporte', 2), V(formatearFecha(o.fechaReporte), 3), E('Código de la Factura', 3), V(o.codigoFactura, 4)]));

  // Cobertura y múltiple
  f.push(
    fila([
      V(marca(cob === 'garantia', 'Garantía'), 3),
      V(marca(cob === 'postgarantia', 'Postgarantía'), 3),
      V(marca(cob === 'garantia_servicio', 'Garantía de Servicio'), 3),
      E('MÚLTIPLE', 2),
      V(o.modalidadMultiple ? '[X]' : '[  ]', 1),
    ])
  );

  // Cliente (izquierda) y Servicio / Equipo (derecha)
  const eq0 = o.equipos[0];
  const marcaEq = eq0 ? eq0.marca : o.equipoMarca;
  const modeloEq = eq0 ? eq0.modelo : o.equipoModelo;
  const serieEq = eq0 ? eq0.nroSerie : o.equipoNroSerie;
  const cli = (etiqueta: string, valor: string | null | undefined) => [E(etiqueta, 2), V(valor, 4)];
  const eqp = (etiqueta: string, valor: string | null | undefined) => [E(etiqueta, 2), V(valor, 4)];
  f.push(fila([S('Información del Cliente', 6), S('Información del Servicio', 6)]));
  f.push(fila([...cli('Código', o.clienteCodigo), V(marca(mods.has('revision_diagnostico'), 'Revis. y Diagnóstico'), 3), V(marca(mods.has('reparacion'), 'Reparación'), 3)]));
  f.push(fila([...cli('Tipo', o.clienteTipo), V(marca(mods.has('instalacion_montaje'), 'Instalación y Montaje'), 3), V(marca(mods.has('mantenimiento'), 'Mantenimiento'), 3)]));
  f.push(fila([...cli('Nombre', o.clienteNombre), V(marca(mods.has('servicio_taller'), 'Servicio en Taller'), 3), V(marca(mods.has('visita_tecnica'), 'Visita Técnica'), 3)]));
  f.push(fila([...cli('Dirección', o.clienteDireccion), S('Información del Equipo', 6)]));
  f.push(fila([...cli('Municipio', o.clienteMunicipio), ...eqp('Tipo', o.equipoTipo)]));
  f.push(fila([...cli('Provincia', o.clienteProvincia), ...eqp('Marca', marcaEq)]));
  f.push(fila([...cli('Fecha Inicio', formatearFecha(o.fechaInicio)), ...eqp('Modelo', modeloEq)]));
  f.push(fila([...cli('Fecha Fin', formatearFecha(o.fechaFin)), ...eqp('N° Serie/ Inv.', serieEq)]));
  if (o.equipos.length > 1) {
    f.push(fila([S(`Equipos adicionales (${o.equipos.length - 1})`, COLUMNAS)]));
    f.push(fila([H('N.º', 1), H('Marca', 4), H('Modelo', 4), H('N° Serie/ Inv.', 3)]));
    o.equipos.slice(1).forEach((e, i) => f.push(fila([N(i + 2, 1), V(e.marca, 4), V(e.modelo, 4), V(e.nroSerie, 3)])));
  }
  f.push(fila([E('Tiempo de Trabajo (Minutos)', 4), N(o.tiempoTrabajoMinutos, 8)]));
  f.push(fila([E('Observaciones del Trabajo Realizado', 4), V(o.observaciones, 8)], 54));

  // Materiales utilizados
  f.push(fila([S('Listado de los Materiales Utilizados', COLUMNAS)]));
  f.push(fila([L('', 10), H(`${tipo.toUpperCase() || 'CLIENTE'} · Importe`, 2)]));
  f.push(fila([H('Vale', 1), H('Código', 2), H('Descripción', 3), H('UM', 1), H('Cant', 1), H('Nro Serie', 2), H('CUP', 1), H('USD', 1)]));
  for (const m of o.materiales) {
    const c = cv(m.cantidad);
    f.push(fila([V(m.vale, 1), V(m.codigo, 2), V(m.descripcion, 3), V(m.unidadMedida, 1), N(m.cantidad, 1), V(m.nroSerie, 2), I(cup(m.importeCUP * c), 1), I(usd(m.importeUSD * c), 1)]));
  }
  for (let i = o.materiales.length; i < MIN_FILAS_MATERIALES; i++) f.push(fila([V('', 1), V('', 2), V('', 3), V('', 1), V('', 1), V('', 2), V('', 1), V('', 1)]));
  f.push(fila([{ span: 10, texto: `Valores Totales Materiales Utilizados${sufijoCliente}`, estilo: 'total' }, { span: 1, importe: cup(t.materialesCUP), estilo: 'totalImporte' }, { span: 1, importe: usd(t.materialesUSD), estilo: 'totalImporte' }]));

  // Servicios prestados
  f.push(fila([S('Listado de los Servicios Prestados', COLUMNAS)]));
  f.push(fila([L('', 9), H(`${tipo.toUpperCase() || 'CLIENTE'} · Importe`, 3)]));
  f.push(fila([H('Código', 3), H('Descripción', 6), H('Cant', 1), H('CUP', 1), H('USD', 1)]));
  for (const s of o.servicios) {
    const c = cv(s.cantidad);
    f.push(fila([V(s.codigo, 3), V(s.descripcion, 6), N(s.cantidad, 1), I(cup(s.importeCUP * c), 1), I(usd(s.importeUSD * c), 1)]));
  }
  for (let i = o.servicios.length; i < MIN_FILAS_SERVICIOS; i++) f.push(fila([V('', 3), V('', 6), V('', 1), V('', 1), V('', 1)]));
  f.push(fila([{ span: 10, texto: `Valores Totales de los Servicios Prestados${sufijoCliente}`, estilo: 'total' }, { span: 1, importe: cup(t.serviciosCUP), estilo: 'totalImporte' }, { span: 1, importe: usd(t.serviciosUSD), estilo: 'totalImporte' }]));
  f.push(fila([{ span: 10, texto: `Totales Generales a Pagar${sufijoCliente}`, estilo: 'total' }, { span: 1, importe: cup(t.totalCUP), estilo: 'totalImporte' }, { span: 1, importe: usd(t.totalUSD), estilo: 'totalImporte' }]));

  // Conformidad del trabajo
  const principal = o.tecnicos.find((x) => x.tecnicoId != null && x.tecnicoId === o.tecnicoPrincipalId) ?? o.tecnicos[0];
  const otros = o.tecnicos.filter((x) => x !== principal);
  const firma = (firmado: number | boolean | undefined) => (firmado ? 'Firmado' : '');
  f.push(fila([S('Conformidad del Trabajo', COLUMNAS)]));
  f.push(fila([S('Control del Folio', 4), S('Técnico Responsable', 4), S('Cliente', 4)]));
  const bloque = (a: [string, string | null | undefined], b: [string, string | null | undefined], c: [string, string | null | undefined], alto?: number) =>
    f.push(fila([E(a[0], 1), V(a[1], 3), E(b[0], 1), V(b[1], 3), E(c[0], 1), V(c[1], 3)], alto));
  bloque(['Nombre', o.revisorNombre], ['Nombre', principal?.nombre], ['Nombre', o.clienteFirmaNombre]);
  bloque(['Cargo', o.revisorCargo], ['Cargo', principal?.cargo], ['Cargo', o.clienteFirmaCargo]);
  bloque(['', ''], ['CI', principal?.ci], ['CI', o.clienteFirmaCI]);
  bloque(['Firma', firma(o.revisorFirmado)], ['Firma', firma(principal?.firmado)], ['Firma', firma(o.clienteFirmado)], 30);
  bloque(['Fecha', formatearFecha(o.revisorFecha)], ['Fecha', ''], ['Fecha', formatearFecha(o.clienteFirmaFecha)]);
  for (const x of otros) {
    f.push(fila([L(`Otro técnico: ${x.nombre ?? ''}${x.cargo ? ` — ${x.cargo}` : ''}${x.ci ? ` — CI ${x.ci}` : ''}${x.firmado ? ' — Firmado' : ''}`, COLUMNAS)]));
  }

  for (const r of f) {
    const suma = r.celdas.reduce((a, c) => a + c.span, 0);
    if (suma !== COLUMNAS) throw new Error(`Fila del formulario con ${suma} columnas (se esperaban ${COLUMNAS}).`);
  }
  return f;
}

/** Nombre de hoja válido para Excel (≤31, sin []:*?/\), único dentro del libro. */
export function nombreHoja(base: string, usados: Set<string>): string {
  let n = base.replace(/[\[\]:*?/\\]/g, '-').trim().slice(0, 31) || 'Orden';
  let i = 2;
  const original = n;
  while (usados.has(n.toLowerCase())) n = `${original.slice(0, 31 - String(i).length - 1)}-${i++}`;
  usados.add(n.toLowerCase());
  return n;
}

// ------------------------------------------------------------------
// XLSX (OOXML dentro de un ZIP sin compresión)
// ------------------------------------------------------------------
const encoder = new TextEncoder();

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i++) c = TABLA_CRC[(c ^ datos[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function escaparXML(v: string): string {
  // Se eliminan los caracteres de control no válidos en XML 1.0.
  return v
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function letraColumna(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// Índices de estilo (cellXfs) de ESTILOS
const ESTILO_XF: Record<EstiloCelda, number> = {
  libre: 0,
  logo: 1,
  titulo: 2,
  seccion: 3,
  etiqueta: 4,
  valor: 5,
  encabezado: 6,
  numero: 7,
  importe: 8,
  total: 9,
  totalImporte: 10,
  folio: 11,
};

function xmlHoja(filas: FilaForm[]): string {
  const merges: string[] = [];
  const filasXml = filas
    .map((fila, r) => {
      let col = 0;
      const celdas: string[] = [];
      for (const c of fila.celdas) {
        const ref = `${letraColumna(col)}${r + 1}`;
        const s = ESTILO_XF[c.estilo];
        if (c.importe !== undefined) {
          celdas.push(Number.isFinite(c.importe.importe) ? `<c r="${ref}" s="${s}"><v>${c.importe.importe}</v></c>` : `<c r="${ref}" s="${s}"/>`);
        } else if (c.numero !== undefined && c.numero !== null) {
          celdas.push(Number.isFinite(c.numero) ? `<c r="${ref}" s="${s}"><v>${c.numero}</v></c>` : `<c r="${ref}" s="${s}"/>`);
        } else if (c.texto) {
          celdas.push(`<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${escaparXML(c.texto)}</t></is></c>`);
        } else {
          celdas.push(`<c r="${ref}" s="${s}"/>`);
        }
        // celdas cubiertas por la combinación: mismo estilo para que el borde se vea completo
        for (let k = 1; k < c.span; k++) celdas.push(`<c r="${letraColumna(col + k)}${r + 1}" s="${s}"/>`);
        if (c.span > 1) merges.push(`<mergeCell ref="${ref}:${letraColumna(col + c.span - 1)}${r + 1}"/>`);
        col += c.span;
      }
      const alto = fila.alto ? ` ht="${fila.alto}" customHeight="1"` : '';
      return `<row r="${r + 1}"${alto}>${celdas.join('')}</row>`;
    })
    .join('');
  const cols = ANCHOS.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews><cols>${cols}</cols><sheetData>${filasXml}</sheetData><mergeCells count="${merges.length}">${merges.join('')}</mergeCells><pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00##########"/></numFmts><fonts count="5"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><b/><sz val="12"/><color rgb="FFC00000"/><name val="Calibri"/></font><font><b/><sz val="16"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE3E3E3"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="12"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

interface Entrada {
  nombre: string;
  datos: Uint8Array;
}

function zipSinCompresion(entradas: Entrada[]): Uint8Array {
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let desplazamiento = 0;
  const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
  const u32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  const hora = 0; // 00:00:00
  const fecha = ((2026 - 1980) << 9) | (1 << 5) | 1; // 1-ene-2026 (valor fijo: salida reproducible)
  for (const e of entradas) {
    const nombre = encoder.encode(e.nombre);
    const crc = crc32(e.datos);
    const cab = Uint8Array.from([
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(hora), ...u16(fecha),
      ...u32(crc), ...u32(e.datos.length), ...u32(e.datos.length), ...u16(nombre.length), ...u16(0),
    ]);
    partes.push(cab, nombre, e.datos);
    central.push(
      Uint8Array.from([
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(hora), ...u16(fecha),
        ...u32(crc), ...u32(e.datos.length), ...u32(e.datos.length), ...u16(nombre.length), ...u16(0), ...u16(0),
        ...u16(0), ...u16(0), ...u32(0), ...u32(desplazamiento),
      ]),
      nombre
    );
    desplazamiento += cab.length + nombre.length + e.datos.length;
  }
  const tamCentral = central.reduce((a, p) => a + p.length, 0);
  const fin = Uint8Array.from([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entradas.length), ...u16(entradas.length),
    ...u32(tamCentral), ...u32(desplazamiento), ...u16(0),
  ]);
  const todo = [...partes, ...central, fin];
  const salida = new Uint8Array(todo.reduce((a, p) => a + p.length, 0));
  let pos = 0;
  for (const p of todo) {
    salida.set(p, pos);
    pos += p.length;
  }
  return salida;
}

/** Libro XLSX real (OOXML): una hoja por elemento de `hojas`. */
export function generarXLSX(hojas: Hoja[]): Uint8Array {
  if (!hojas.length) throw new Error('No hay órdenes para exportar.');
  const txt = (s: string) => encoder.encode(s);
  const entradas: Entrada[] = [
    {
      nombre: '[Content_Types].xml',
      datos: txt(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas
          .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
          .join('')}</Types>`
      ),
    },
    {
      nombre: '_rels/.rels',
      datos: txt(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
      ),
    },
    {
      nombre: 'xl/workbook.xml',
      datos: txt(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas
          .map((h, i) => `<sheet name="${escaparXML(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
          .join('')}</sheets></workbook>`
      ),
    },
    {
      nombre: 'xl/_rels/workbook.xml.rels',
      datos: txt(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas
          .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
          .join('')}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
      ),
    },
    { nombre: 'xl/styles.xml', datos: txt(ESTILOS) },
    ...hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, datos: txt(xmlHoja(h.filas)) })),
  ];
  return zipSinCompresion(entradas);
}

// ------------------------------------------------------------------
// HTML para PDF (una página por orden, siempre completa)
// ------------------------------------------------------------------
function h(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function htmlOrden(o: OrdenCompleta, t: TotalesOrden): string {
  const cuerpo = formularioOrden(o, t)
    .map((fila) => {
      const celdas = fila.celdas
        .map((c) => {
          const contenido = c.importe ? h(formatearImporte(c.importe.importe, c.importe.moneda)) : c.numero != null ? h(c.numero) : h(c.texto);
          return `<td colspan="${c.span}" class="${c.estilo}">${contenido || '&nbsp;'}</td>`;
        })
        .join('');
      return `<tr${fila.alto ? ` style="height:${Math.round(fila.alto * 0.9)}px"` : ''}>${celdas}</tr>`;
    })
    .join('');
  const total = ANCHOS.reduce((a, b) => a + b, 0);
  const cols = ANCHOS.map((w) => `<col style="width:${((w / total) * 100).toFixed(3)}%" />`).join('');
  return `<section class="orden"><table><colgroup>${cols}</colgroup>${cuerpo}</table></section>`;
}

export function htmlDocumento(ordenes: { orden: OrdenCompleta; totales: TotalesOrden }[]): string {
  return `<html><head><meta charset="utf-8" /><style>
    @page{size:A4 portrait;margin:8mm}
    body{font-family:Helvetica,Arial,sans-serif;color:#111;margin:0;padding:0}
    .orden{page-break-after:always} .orden:last-child{page-break-after:auto}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    td{border:1px solid #333;padding:2px 4px;font-size:8.5px;text-align:left;vertical-align:middle;word-wrap:break-word;overflow-wrap:anywhere}
    td.libre{border:none} td.logo{border:none;font-size:18px;font-weight:bold;letter-spacing:2px}
    td.titulo{border:none;text-align:center;font-size:15px;font-weight:bold}
    td.seccion,td.encabezado{background:#e3e3e3;font-weight:bold;text-align:center}
    td.etiqueta,td.total{font-weight:bold} td.total,td.numero,td.importe,td.totalImporte{text-align:right}
    td.totalImporte{font-weight:bold}
    td.folio{color:#c00000;font-weight:bold;font-size:13px;text-align:center}
  </style></head><body>${ordenes.map((x) => htmlOrden(x.orden, x.totales)).join('')}</body></html>`;
}
