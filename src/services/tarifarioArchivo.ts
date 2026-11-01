/**
 * services/tarifarioArchivo.ts
 *
 * Lee y VALIDA un archivo de tarifario antes de tocar la base. Acepta dos formatos:
 *  - «lista»: array plano de filas de la tabla `servicios` (formato de Exportar / antiguo).
 *  - «modelo»: el modelo unificado `{ categorias: [{ id_categoria, tarifa?, servicios: [...] }] }`
 *    (tarifario_copextel.json y tarifario_taller_clima.json): cada servicio trae `tarifas`.
 * La tarifa de Población NO se carga en la tabla `servicios` (la pestaña Población tiene su propio
 * tarifario, independiente del de Estatal / Interno): esas filas se omiten y se cuentan.
 * Función pura: no usa la base de datos. Lanza ErrorTarifario con un mensaje claro si el archivo no sirve.
 */
import type { NuevoServicio } from '../types/tarifario.types';

export type FormatoTarifario = 'lista' | 'modelo';

export interface ArchivoTarifario {
  formato: FormatoTarifario;
  servicios: NuevoServicio[];
  /** Filas de Población que no se cargan en la tabla `servicios`. */
  poblacionOmitidos: number;
  /** Subcategorías (categoria de cada servicio) distintas, en el orden del archivo. */
  subcategorias: string[];
  /** true si trae pocas filas: reemplazar dejaría el catálogo casi vacío. */
  pocasFilas: boolean;
}

/** Por debajo de este número de servicios, Reemplazar pide una confirmación extra. */
export const MINIMO_FILAS_AVISO = 500;
export const CATEGORIA_POBLACION = 'Población';
const MAX_ERRORES_MOSTRADOS = 8;

export class ErrorTarifario extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorTarifario';
  }
}

/** «Estatal - Split» → «Split» (el prefijo era solo el tipo de tarifa). */
export function normalizarSubcategoria(categoria: string): string {
  return categoria.replace(/^\s*Estatal\s*-\s*/i, '').trim();
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
const textoONull = (v: unknown): string | null | undefined =>
  v === undefined || v === null ? null : typeof v === 'string' ? (v.trim() === '' ? null : v) : undefined;
const numeroOK = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Convierte una fila candidata en NuevoServicio o devuelve el motivo del rechazo. */
function validarFila(x: Record<string, unknown>): NuevoServicio | string {
  const codigo = typeof x.codigoServicio === 'string' ? x.codigoServicio.trim() : '';
  if (!codigo) return 'falta el código del servicio';
  if (codigo.length > 60) return 'código demasiado largo';
  const nombre = typeof x.nombreServicio === 'string' ? x.nombreServicio.trim() : '';
  if (!nombre) return 'falta el nombre';
  const categoria = typeof x.categoria === 'string' ? normalizarSubcategoria(x.categoria) : '';
  if (!categoria) return 'falta la categoría';
  if (!numeroOK(x.precioBase)) return 'el precio no es un número';
  if (x.precioBase < 0) return 'el precio es negativo';
  const t = x.tiempoEstimado;
  if (t !== undefined && t !== null && (!numeroOK(t) || t < 0)) return 'el tiempo estimado no es válido';
  const n = x.cantidadTecnicos;
  if (n !== undefined && n !== null && (!numeroOK(n) || !Number.isInteger(n) || n < 1 || n > 99)) return 'la cantidad de técnicos no es válida';
  const prop = x.idPropietario;
  if (prop !== undefined && prop !== null && !numeroOK(prop)) return 'el id de propietario no es válido';
  const ins = x.insumosCUP;
  if (ins !== undefined && ins !== null && (!numeroOK(ins) || ins < 0)) return 'los insumos no son válidos';
  const unidad = textoONull(x.unidad);
  const detalle = textoONull(x.detalleFactura);
  const desc = textoONull(x.descripcionTecnica);
  if (unidad === undefined || detalle === undefined || desc === undefined) return 'hay un campo de texto con tipo incorrecto';
  return {
    codigoServicio: codigo,
    nombreServicio: nombre,
    categoria,
    descripcionTecnica: desc,
    detalleFactura: detalle,
    unidad,
    precioBase: x.precioBase,
    precioTecnico: numeroOK(x.precioTecnico) ? x.precioTecnico : 0,
    tiempoEstimado: t === undefined || t === null ? null : (t as number),
    cantidadTecnicos: n === undefined || n === null ? 1 : (n as number),
    idPropietario: prop === undefined || prop === null ? null : (prop as number),
    insumosCUP: ins === undefined || ins === null ? null : (ins as number),
  };
}

interface Candidata {
  fila: Record<string, unknown>;
  etiqueta: string;
}

export function interpretarArchivoTarifario(texto: string): ArchivoTarifario {
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new ErrorTarifario('El archivo no es un JSON válido.');
  }

  const candidatas: Candidata[] = [];
  let poblacionOmitidos = 0;
  let formato: FormatoTarifario;
  const errores: string[] = [];

  if (Array.isArray(datos)) {
    formato = 'lista';
    datos.forEach((x, i) => {
      if (!esObjeto(x)) errores.push(`fila ${i + 1}: no es un objeto`);
      else candidatas.push({ fila: x, etiqueta: `fila ${i + 1}` });
    });
  } else if (esObjeto(datos) && Array.isArray(datos.categorias)) {
    formato = 'modelo';
    datos.categorias.forEach((cat, ic) => {
      if (!esObjeto(cat) || !Array.isArray(cat.servicios)) {
        errores.push(`categoría ${ic + 1}: no tiene lista de servicios`);
        return;
      }
      const nombreCat = typeof cat.nombre_categoria === 'string' ? cat.nombre_categoria : '';
      const esPoblacion = cat.tarifa === 'poblacion' || cat.id_categoria === 'poblacion';
      cat.servicios.forEach((s, is) => {
        const et = `${nombreCat || `categoría ${ic + 1}`}, servicio ${is + 1}`;
        if (!esObjeto(s)) {
          errores.push(`${et}: no es un objeto`);
          return;
        }
        if (esPoblacion) {
          poblacionOmitidos++;
          return;
        }
        const tarifas = esObjeto(s.tarifas) ? s.tarifas : null;
        if (!tarifas) {
          errores.push(`${et}: no trae tarifas`);
          return;
        }
        const est = tarifas.estatal_interno;
        if (est === null || est === undefined) {
          if (tarifas.poblacion !== null && tarifas.poblacion !== undefined) poblacionOmitidos++;
          else errores.push(`${et} (${String(s.codigo ?? '?')}): sin tarifa`);
          return;
        }
        const modalidad = typeof s.modalidad === 'string' && s.modalidad.trim() ? s.modalidad : nombreCat;
        candidatas.push({
          etiqueta: `${et} (${String(s.codigo ?? '?')})`,
          fila: {
            codigoServicio: s.codigo_completo ?? s.codigo,
            nombreServicio: s.descripcion,
            categoria: modalidad,
            descripcionTecnica: null,
            detalleFactura: s.detalle_factura ?? null,
            unidad: s.unidad_medida ?? null,
            precioBase: est,
            precioTecnico: 0,
            tiempoEstimado: s.tiempo_estimado_minutos ?? null,
            cantidadTecnicos: s.cantidad_tecnicos ?? null,
            idPropietario: s.id_propietario ?? null,
            insumosCUP: s.insumos_cup ?? null,
          },
        });
      });
    });
  } else {
    throw new ErrorTarifario(
      'El archivo no tiene un formato de tarifario reconocido: debe ser una lista de servicios o un modelo con "categorias".'
    );
  }

  const servicios: NuevoServicio[] = [];
  const codigos = new Set<string>();
  for (const c of candidatas) {
    const r = validarFila(c.fila);
    if (typeof r === 'string') {
      errores.push(`${c.etiqueta}: ${r}`);
      continue;
    }
    if (r.categoria === CATEGORIA_POBLACION) {
      poblacionOmitidos++;
      continue;
    }
    if (codigos.has(r.codigoServicio)) {
      errores.push(`${c.etiqueta}: código repetido (${r.codigoServicio})`);
      continue;
    }
    codigos.add(r.codigoServicio);
    servicios.push(r);
  }

  if (errores.length) {
    const vistos = errores.slice(0, MAX_ERRORES_MOSTRADOS).join('\n');
    const resto = errores.length > MAX_ERRORES_MOSTRADOS ? `\n… y ${errores.length - MAX_ERRORES_MOSTRADOS} problema(s) más.` : '';
    throw new ErrorTarifario(`El archivo tiene ${errores.length} problema(s); no se cargó nada:\n${vistos}${resto}`);
  }
  if (servicios.length === 0) {
    throw new ErrorTarifario(
      poblacionOmitidos > 0
        ? 'El archivo solo trae servicios de Población, que no se cargan en la tabla de servicios (Población tiene su propio tarifario).'
        : 'El archivo no contiene ningún servicio.'
    );
  }

  return {
    formato,
    servicios,
    poblacionOmitidos,
    subcategorias: [...new Set(servicios.map((s) => s.categoria))],
    pocasFilas: servicios.length < MINIMO_FILAS_AVISO,
  };
}
