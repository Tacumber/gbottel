/**
 * services/procedimientosService.ts
 *
 * Procedimientos de referencia del Tarifario (solo lectura, 100 % offline). Vienen del archivo
 * `src/data/procedimientos_tarifario.json` (Gemini): un procedimiento por CATEGORÍA y, para 20
 * servicios concretos, herramientas y complejidad.
 *
 * Reglas:
 *  - Coincidencia EXACTA por código de servicio. Un servicio que no está en el archivo NO hereda
 *    el procedimiento de otro (devuelve null): no se aplica nada por suposición.
 *  - Del archivo solo se usan procedimiento, herramientas y complejidad. Tarifa, tiempo y cantidad
 *    de técnicos del archivo NO se usan: en el catálogo real difieren (2 tarifas y 14 tiempos), y
 *    el catálogo es la fuente de verdad de los importes.
 *  - No toca la base de datos ni el esquema.
 */
import datos from '../data/procedimientos_tarifario.json';

export interface ProcedimientoServicio {
  categoriaId: string;
  categoriaNombre: string;
  /** Texto original del archivo. */
  procedimiento: string;
  /** El mismo texto separado en pasos numerados. */
  pasos: string[];
  herramientas: string[];
  complejidad: string | null;
}

interface FichaServicio {
  codigo: string;
  herramientas_requeridas?: string[];
  complejidad?: string;
}
interface FichaCategoria {
  id_categoria: string;
  nombre_categoria: string;
  procedimiento: string;
  servicios: FichaServicio[];
}

/** «25-0100-TER» → «0100». Un código sin guiones se devuelve igual. */
export function claveCodigo(codigoServicio: string): string {
  const partes = codigoServicio.trim().split('-');
  return partes.length >= 3 ? partes[1] : codigoServicio.trim();
}

/** «1. Uno. 2. Dos.» → ['Uno.', 'Dos.']; si no hay numeración devuelve el texto entero. */
export function separarPasos(texto: string): string[] {
  const t = texto.trim();
  if (!t) return [];
  const partes = t.split(/\s*(?:^|\s)\d+\.\s+/).map((p) => p.trim()).filter(Boolean);
  return partes.length ? partes : [t];
}

const INDICE: Map<string, { cat: FichaCategoria; ficha: FichaServicio }> = (() => {
  const m = new Map<string, { cat: FichaCategoria; ficha: FichaServicio }>();
  const categorias = ((datos as { categorias?: FichaCategoria[] }).categorias ?? []) as FichaCategoria[];
  for (const cat of categorias) for (const ficha of cat.servicios ?? []) m.set(ficha.codigo.trim(), { cat, ficha });
  return m;
})();

/** Procedimiento del servicio o null si el archivo no lo trae (coincidencia exacta). */
export function obtenerProcedimiento(codigoServicio: string): ProcedimientoServicio | null {
  const hallado = INDICE.get(claveCodigo(codigoServicio));
  if (!hallado) return null;
  const { cat, ficha } = hallado;
  return {
    categoriaId: cat.id_categoria,
    categoriaNombre: cat.nombre_categoria,
    procedimiento: cat.procedimiento,
    pasos: separarPasos(cat.procedimiento),
    herramientas: Array.isArray(ficha.herramientas_requeridas) ? ficha.herramientas_requeridas.filter((x) => typeof x === 'string') : [],
    complejidad: typeof ficha.complejidad === 'string' ? ficha.complejidad : null,
  };
}

export function cantidadServiciosConProcedimiento(): number {
  return INDICE.size;
}
