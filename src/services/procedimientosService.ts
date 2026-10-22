/**
 * services/procedimientosService.ts
 *
 * Fichas del Tarifario Estatal / Interno (procedimiento, herramientas, complejidad): solo lectura y
 * 100 % offline. Datos: `src/data/tarifario_estatal.json`, el tarifario de 1858 servicios en el
 * modelo de categorías con servicios (generado por `scripts/generar_tarifario_estatal.py` desde el
 * catálogo real y el archivo de Gemini). Cada servicio tiene su propio campo `procedimiento`:
 * para agregar un procedimiento a un servicio basta completar ese campo en el archivo.
 *
 * Reglas:
 *  - El procedimiento es POR SERVICIO (coincidencia exacta por código). Un servicio sin
 *    procedimiento devuelve null: nunca hereda el de otro ni el de su categoría.
 *  - Los importes NO salen de este archivo para las órdenes: manda el catálogo de la base. Una
 *    prueba comprueba que `tarifa` del archivo coincide con el catálogo en los 1858 servicios.
 *  - No toca la base de datos ni el esquema. Población tiene su propio archivo y servicio.
 */
import datos from '../data/tarifario_estatal.json';

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
  complejidad?: string | null;
  procedimiento?: string | null;
}
interface FichaCategoria {
  id_categoria: string;
  nombre_categoria: string | null;
  procedimiento: string | null;
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
  for (const cat of categorias) for (const ficha of cat.servicios ?? []) m.set(String(ficha.codigo).trim(), { cat, ficha });
  return m;
})();

/** Procedimiento del servicio o null si el archivo no lo trae (coincidencia exacta). */
export function obtenerProcedimiento(codigoServicio: string): ProcedimientoServicio | null {
  const hallado = INDICE.get(claveCodigo(codigoServicio));
  if (!hallado) return null;
  const { cat, ficha } = hallado;
  const texto = typeof ficha.procedimiento === 'string' ? ficha.procedimiento.trim() : '';
  if (!texto) return null;
  return {
    categoriaId: cat.id_categoria,
    categoriaNombre: cat.nombre_categoria ?? `Familia ${cat.id_categoria}`,
    procedimiento: texto,
    pasos: separarPasos(texto),
    herramientas: Array.isArray(ficha.herramientas_requeridas) ? ficha.herramientas_requeridas.filter((x) => typeof x === 'string') : [],
    complejidad: typeof ficha.complejidad === 'string' ? ficha.complejidad : null,
  };
}

export function cantidadServiciosConProcedimiento(): number {
  let n = 0;
  for (const { ficha } of INDICE.values()) if (typeof ficha.procedimiento === 'string' && ficha.procedimiento.trim()) n++;
  return n;
}

export function cantidadServiciosTarifarioEstatal(): number {
  return INDICE.size;
}
