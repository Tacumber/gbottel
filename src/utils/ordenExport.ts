/**
 * Exportación de órdenes completas (hoja de cálculo XLSX real, HTML para PDF). Sin dependencias
 * externas ni acceso a la base: recibe la orden ya leída de SQLite y sus totales calculados con
 * `calcularTotales`, de modo que el importe exportado es EXACTAMENTE el guardado.
 * Siempre incluye todas las secciones: ocultar secciones en pantalla no afecta a la exportación.
 *
 * AVISO: la plantilla oficial de la Orden de Servicio no está en el repositorio. La disposición
 * sigue las 9 secciones del formulario; no está verificada contra el formato oficial.
 */
import type { OrdenCompleta, TotalesOrden } from '../types/ordenes.types';
import { formatearFecha } from './fechas';
import { formatearImporte, normalizarImporte } from './moneda';

export interface CeldaImporte {
  importe: number;
  moneda: 'CUP' | 'USD';
}
export type Celda = string | number | null | CeldaImporte;
export interface Hoja {
  nombre: string;
  filas: Celda[][];
}

const ETIQUETA_ESTADO: Record<string, string> = { pendiente: 'Pendiente', finalizada: 'Finalizada', facturada: 'Facturada' };

function modalidades(valor: string | null): string {
  if (!valor) return '';
  try {
    const d: unknown = JSON.parse(valor);
    return Array.isArray(d) ? d.filter((x) => typeof x === 'string').join(', ') : '';
  } catch {
    return '';
  }
}

/** Misma regla que calcularTotales: una cantidad no válida (≤ 0) no suma. */
const cv = (c: number) => (Number.isFinite(c) && c > 0 ? c : 0);
const si = (n: number) => (n ? 'Sí' : 'No');
const cup = (n: number): CeldaImporte => ({ importe: normalizarImporte(n), moneda: 'CUP' });
const usd = (n: number): CeldaImporte => ({ importe: normalizarImporte(n), moneda: 'USD' });

/** Filas de la hoja de una orden: todas las secciones, importes como NÚMEROS exactos. */
export function filasOrden(o: OrdenCompleta, t: TotalesOrden): Celda[][] {
  const f: Celda[][] = [];
  const sec = (titulo: string) => f.push([], [titulo]);
  f.push([`COPEXTEL — Orden de Servicio ${o.numeroOrden}`]);
  f.push(['Estado', ETIQUETA_ESTADO[o.estado] ?? o.estado]);

  sec('1. Encabezado y Control del Documento');
  f.push(['Folio', o.numeroOrden], ['Compañía', o.compania], ['Código de reporte', o.codigoReporte], ['Reportado por', o.reportadoPor]);
  f.push(['Fecha de reporte', formatearFecha(o.fechaReporte)], ['Código de orden', o.codigoOrden], ['Código de factura', o.codigoFactura]);
  f.push(['Revisor', o.revisorNombre], ['Cargo del revisor', o.revisorCargo], ['Fecha de revisión', formatearFecha(o.revisorFecha)], ['Revisor firmó', si(o.revisorFirmado)]);

  sec('2. Clasificación del Servicio');
  f.push(['Tipo de cobertura', o.tipoCobertura], ['Modalidad múltiple', si(o.modalidadMultiple)], ['Modalidades de servicio', modalidades(o.modalidadesServicio)]);

  sec('3. Información del Cliente');
  f.push(['Código', o.clienteCodigo], ['Tipo', o.clienteTipo], ['Nombre', o.clienteNombre], ['Dirección', o.clienteDireccion], ['Municipio', o.clienteMunicipio], ['Provincia', o.clienteProvincia]);

  sec('4. Información del Servicio y Equipo');
  f.push(['Tipo de equipo', o.equipoTipo], ['Fecha de inicio', formatearFecha(o.fechaInicio)], ['Fecha de fin', formatearFecha(o.fechaFin)], ['Tiempo de trabajo (minutos)', o.tiempoTrabajoMinutos]);
  if (o.equipos.length) {
    f.push(['Equipo', 'Marca', 'Modelo', 'N.º de serie']);
    o.equipos.forEach((e, i) => f.push([i + 1, e.marca, e.modelo, e.nroSerie]));
  } else {
    f.push(['Marca', o.equipoMarca], ['Modelo', o.equipoModelo], ['N.º de serie', o.equipoNroSerie]);
  }

  sec('5. Detalles del Trabajo');
  f.push(['Observaciones', o.observaciones]);

  sec('6. Materiales Utilizados');
  f.push(['Vale', 'Código', 'Descripción', 'U/M', 'Cantidad', 'N.º de serie', 'Precio unit. CUP', 'Precio unit. USD', 'Importe CUP', 'Importe USD']);
  for (const m of o.materiales) {
    f.push([m.vale, m.codigo, m.descripcion, m.unidadMedida, m.cantidad, m.nroSerie, cup(m.importeCUP), usd(m.importeUSD), cup(m.importeCUP * cv(m.cantidad)), usd(m.importeUSD * cv(m.cantidad))]);
  }
  f.push(['Total materiales', null, null, null, null, null, null, null, cup(t.materialesCUP), usd(t.materialesUSD)]);

  sec('7. Servicios Prestados');
  f.push(['Código', 'Descripción', 'Cantidad', 'Precio unit. CUP', 'Precio unit. USD', 'Importe CUP', 'Importe USD']);
  for (const s of o.servicios) {
    f.push([s.codigo, s.descripcion, s.cantidad, cup(s.importeCUP), usd(s.importeUSD), cup(s.importeCUP * cv(s.cantidad)), usd(s.importeUSD * cv(s.cantidad))]);
  }
  f.push(['Total servicios', null, null, null, null, cup(t.serviciosCUP), usd(t.serviciosUSD)]);

  sec('8. Totales Generales');
  f.push(['Total a pagar CUP', cup(t.totalCUP)], ['Total a pagar USD', usd(t.totalUSD)]);

  sec('9. Firmas y Conformidad');
  f.push(['Técnico', 'Cargo', 'CI', 'Firmó']);
  for (const x of o.tecnicos) f.push([x.nombre, x.cargo, x.ci, si(x.firmado)]);
  f.push(['Cliente', o.clienteFirmaNombre], ['Cargo del cliente', o.clienteFirmaCargo], ['CI del cliente', o.clienteFirmaCI], ['Fecha de conformidad', formatearFecha(o.clienteFirmaFecha)], ['Cliente firmó', si(o.clienteFirmado)]);
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

function xmlHoja(filas: Celda[][]): string {
  const esTitulo = (fila: Celda[]) => fila.length === 1 && typeof fila[0] === 'string';
  const filasXml = filas
    .map((fila, r) => {
      const celdas = fila
        .map((v, c) => {
          if (v === null || v === undefined || v === '') return '';
          const ref = `${letraColumna(c)}${r + 1}`;
          if (typeof v === 'object') {
            return Number.isFinite(v.importe) ? `<c r="${ref}" s="2"><v>${v.importe}</v></c>` : '';
          }
          if (typeof v === 'number') {
            return Number.isFinite(v) ? `<c r="${ref}"><v>${v}</v></c>` : '';
          }
          return `<c r="${ref}" t="inlineStr"${esTitulo(fila) ? ' s="1"' : ''}><is><t xml:space="preserve">${escaparXML(v)}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${celdas}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><cols><col min="1" max="1" width="26" customWidth="1"/><col min="2" max="3" width="30" customWidth="1"/><col min="4" max="10" width="16" customWidth="1"/></cols><sheetData>${filasXml}</sheetData><pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00##########"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

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
  const filas = filasOrden(o, t);
  const cuerpo = filas
    .map((fila) => {
      if (!fila.length) return '';
      if (fila.length === 1) return `<tr><th colspan="10" class="sec">${h(fila[0])}</th></tr>`;
      const celdas = fila
        .map((v) =>
          v !== null && typeof v === 'object'
            ? `<td class="n">${h(formatearImporte(v.importe, v.moneda))}</td>`
            : typeof v === 'number'
              ? `<td class="n">${h(v)}</td>`
              : `<td>${h(v)}</td>`,
        )
        .join('');
      return `<tr>${celdas}</tr>`;
    })
    .join('');
  return `<section class="orden"><table>${cuerpo}</table></section>`;
}

export function htmlDocumento(ordenes: { orden: OrdenCompleta; totales: TotalesOrden }[]): string {
  return `<html><head><meta charset="utf-8" /><style>
    body{font-family:Helvetica,Arial,sans-serif;color:#1a1a1a;padding:14px}
    .orden{page-break-after:always} .orden:last-child{page-break-after:auto}
    table{width:100%;border-collapse:collapse} td,th{border:1px solid #ddd;padding:3px 5px;font-size:9px;text-align:left}
    th.sec{background:#e8eef9;font-size:10px} td.n{text-align:right}
  </style></head><body>${ordenes.map((x) => htmlOrden(x.orden, x.totales)).join('')}</body></html>`;
}
