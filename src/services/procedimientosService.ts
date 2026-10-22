/**
 * services/procedimientosService.ts
 *
 * Procedimientos técnicos del tarifario Estatal / Interno: solo lectura y 100 % offline.
 * Datos: `src/data/tarifario_estatal.json` — los 1858 servicios del catálogo agrupados por familia
 * (categoría → servicios), generado por `scripts/generar_tarifario_estatal.py` a partir del catálogo
 * y de los libros oficiales «NN Nombre 22.xlsx». Cada servicio trae su propio `procedimiento`
 * (actividades con minutos, tiempo de solución técnica, técnicos e insumos) o null.
 *
 * Reglas:
 *  - El procedimiento es POR SERVICIO y se busca por código exacto. Un servicio sin procedimiento
 *    devuelve null: nunca hereda el de otro servicio ni el de su familia.
 *  - Los importes NO se leen de aquí para las órdenes: manda el catálogo de la base. Una prueba
 *    comprueba que `tarifa` coincide con el catálogo en los 1858 servicios.
 *  - No toca la base de datos ni el esquema. Población tiene su propio archivo y NO usa estos
 *    procedimientos (tarifarios independientes).
 */
import datos from '../data/tarifario_estatal.json';

export interface ActividadProcedimiento {
  n: number;
  actividad: string;
  minutos: number | null;
}
export interface InsumoProcedimiento {
  codigo: string;
  producto: string;
  um: string;
  norma_consumo: number | null;
}
export interface ProcedimientoServicio {
  categoriaId: string;
  categoriaNombre: string;
  /** Instalación y Montaje / Mantenimiento / Reparación / Revisión y Diagnóstico (según el libro). */
  tipoServicio: string | null;
  tiempoMinutos: number | null;
  tecnicos: number | null;
  actividades: ActividadProcedimiento[];
  insumos: InsumoProcedimiento[];
  fuente: { libro: string; hoja: string; fila: number };
}

interface ServicioModelo {
  codigo: string;
  tarifa: number;
  tipo_servicio: string | null;
  procedimiento: {
    fuente: { libro: string; hoja: string; fila: number };
    tecnicos: number | null;
    tiempo_minutos: number | null;
    actividades: ActividadProcedimiento[];
    insumos: InsumoProcedimiento[];
  } | null;
}
interface CategoriaModelo {
  id_categoria: string;
  nombre_categoria: string;
  servicios: ServicioModelo[];
}

/** «25-0100-TER» → «0100». Un código sin guiones se devuelve igual. */
export function claveCodigo(codigoServicio: string): string {
  const partes = codigoServicio.trim().split('-');
  return partes.length >= 3 ? partes[1] : codigoServicio.trim();
}

const INDICE: Map<string, { cat: CategoriaModelo; serv: ServicioModelo }> = (() => {
  const m = new Map<string, { cat: CategoriaModelo; serv: ServicioModelo }>();
  const categorias = ((datos as { categorias?: CategoriaModelo[] }).categorias ?? []) as CategoriaModelo[];
  for (const cat of categorias) for (const serv of cat.servicios ?? []) m.set(String(serv.codigo).trim(), { cat, serv });
  return m;
})();

/** Procedimiento del servicio o null si no tiene (coincidencia exacta por código). */
export function obtenerProcedimiento(codigoServicio: string): ProcedimientoServicio | null {
  const hallado = INDICE.get(claveCodigo(codigoServicio));
  const p = hallado?.serv.procedimiento;
  if (!hallado || !p) return null;
  const { cat, serv } = hallado;
  return {
    categoriaId: cat.id_categoria,
    categoriaNombre: cat.nombre_categoria,
    tipoServicio: serv.tipo_servicio ?? null,
    tiempoMinutos: p.tiempo_minutos,
    tecnicos: p.tecnicos,
    actividades: p.actividades,
    insumos: p.insumos,
    fuente: p.fuente,
  };
}

export function cantidadServiciosConProcedimiento(): number {
  let n = 0;
  for (const { serv } of INDICE.values()) if (serv.procedimiento) n++;
  return n;
}

export function cantidadServiciosTarifarioEstatal(): number {
  return INDICE.size;
}

/** «90» → «90 min»; «150» → «150 min (2 h 30 min)»; admite decimales sin ruido. */
export function formatearMinutos(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return '—';
  const limpio = Number(min.toFixed(2));
  if (limpio < 60) return `${limpio} min`;
  const h = Math.floor(limpio / 60);
  const r = Number((limpio - h * 60).toFixed(2));
  return r ? `${limpio} min (${h} h ${r} min)` : `${limpio} min (${h} h)`;
}
