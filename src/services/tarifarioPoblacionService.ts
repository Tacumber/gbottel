/**
 * services/tarifarioPoblacionService.ts
 *
 * Tarifario de POBLACIÓN (82 prestaciones: código, nombre, UM y precio en CUP) — solo lectura y
 * 100 % offline. Datos: `src/data/tarifario_poblacion.json`, convertido tal cual de
 * «Tarifario Copextel (población).xlsx»; los importes son los enteros del archivo, sin ningún
 * cálculo ni redondeo. Estatal e Interno usan el catálogo de la tabla `servicios`; Población usa
 * esta otra lista de precios. No modifica la base ni el esquema.
 *
 * Es un tarifario INDEPENDIENTE: no se compara ni se mezcla con el de Estatal / Interno. La única
 * relación es `procedimiento_de` (generado por scripts/vincular_poblacion.py): código del servicio
 * equivalente, solo para mostrar su procedimiento técnico. Sus filas
 * no se enlazan con la tabla `servicios` (id negativo; en la orden `servicioId` = null) y no
 * heredan tiempo ni técnicos de ningún otro tarifario.
 */
import datos from '../data/tarifario_poblacion.json';
import type { Servicio } from '../types/tarifario.types';

export interface PrestacionPoblacion {
  codigo: string;
  nombre: string;
  unidad: string;
  precioCUP: number;
  /** Código del servicio equivalente de Estatal / Interno cuyo procedimiento técnico se muestra (solo procedimiento, nunca precios). */
  procedimiento_de?: string | null;
  coincidencia?: 'nombre_igual' | 'nombre_similar' | 'confirmado' | null;
}

/** Tarifa a la que pertenece una fila mostrada en el Tarifario. */
export type TarifaServicio = 'estatal' | 'poblacion';
export type ItemTarifario = Servicio & { tarifa: TarifaServicio; clave: string; procedimientoDe?: string | null; coincidencia?: PrestacionPoblacion['coincidencia'] };

export const PRESTACIONES_POBLACION: PrestacionPoblacion[] = (datos as PrestacionPoblacion[]).map((p) => ({
  codigo: String(p.codigo).trim(),
  nombre: String(p.nombre).trim(),
  unidad: String(p.unidad).trim(),
  precioCUP: p.precioCUP,
  procedimiento_de: p.procedimiento_de ?? null,
  coincidencia: p.coincidencia ?? null,
}));

/** Problemas de integridad de los datos (vacío = todo bien). */
export function validarTarifaPoblacion(items: PrestacionPoblacion[] = PRESTACIONES_POBLACION): string[] {
  const errores: string[] = [];
  const vistos = new Set<string>();
  for (const p of items) {
    if (!p.codigo) errores.push('Código vacío');
    if (vistos.has(p.codigo)) errores.push(`Código repetido: ${p.codigo}`);
    vistos.add(p.codigo);
    if (!p.nombre) errores.push(`Sin nombre: ${p.codigo}`);
    if (typeof p.precioCUP !== 'number' || !Number.isFinite(p.precioCUP) || p.precioCUP < 0) errores.push(`Precio inválido: ${p.codigo}`);
  }
  return errores;
}

/** Minúsculas y sin acentos, para buscar «revision» y encontrar «Revisión». */
export function normalizarTexto(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Ids negativos y estables: no chocan con los del catálogo (autoincrement positivo). */
export function aItemPoblacion(p: PrestacionPoblacion, indice: number): ItemTarifario {
  const id = -(indice + 1);
  return {
    id,
    codigoServicio: p.codigo,
    nombreServicio: p.nombre,
    categoria: 'Población',
    descripcionTecnica: null,
    detalleFactura: null,
    unidad: p.unidad,
    precioBase: p.precioCUP,
    precioTecnico: 0,
    tiempoEstimado: null,
    cantidadTecnicos: 1,
    idPropietario: null,
    insumosCUP: null,
    activo: 1,
    creadoEn: '',
    actualizadoEn: '',
    tarifa: 'poblacion',
    clave: `poblacion:${id}`,
    procedimientoDe: p.procedimiento_de ?? null,
    coincidencia: p.coincidencia ?? null,
  };
}

/** Todas las prestaciones de Población como filas del Tarifario. */
export function listarTarifaPoblacion(texto = ''): ItemTarifario[] {
  const items = PRESTACIONES_POBLACION.map(aItemPoblacion);
  const palabras = normalizarTexto(texto).split(/\s+/).filter(Boolean);
  if (!palabras.length) return items;
  return items.filter((i) => {
    const pajar = normalizarTexto(`${i.codigoServicio} ${i.nombreServicio}`);
    return palabras.every((w) => pajar.includes(w));
  });
}

/** Una fila del catálogo (Estatal / Interno) con su etiqueta de tarifa. */
export function aItemCatalogo(s: Servicio): ItemTarifario {
  return { ...s, tarifa: 'estatal', clave: `estatal:${s.id}` };
}
