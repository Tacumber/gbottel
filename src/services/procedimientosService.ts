/**
 * services/procedimientosService.ts
 *
 * Procedimientos técnicos y nombres oficiales del tarifario unificado (ver tarifarioModelo.ts).
 *
 * Reglas:
 *  - El procedimiento es POR SERVICIO y se busca por código exacto. Un servicio sin procedimiento
 *    devuelve null: nunca hereda el de otro servicio ni el de su familia.
 *  - Un servicio de Población comparte fila (y procedimiento) con el servicio de igual código cuando
 *    el nombre es equivalente; ver `scripts/generar_tarifario.py`.
 *  - Los importes de las órdenes NO salen de aquí: Estatal / Interno manda el catálogo de la base y
 *    Población su propio campo. Una prueba comprueba las tarifas del archivo contra el catálogo.
 */
import { INDICE_MODELO, claveCodigo } from './tarifarioModelo';
import type { ActividadProcedimiento, InsumoProcedimiento } from './tarifarioModelo';

export { claveCodigo };
export type { ActividadProcedimiento, InsumoProcedimiento };

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

/** Procedimiento del servicio o null si no tiene (coincidencia exacta por código). */
export function obtenerProcedimiento(codigoServicio: string): ProcedimientoServicio | null {
  const hallado = INDICE_MODELO.get(claveCodigo(codigoServicio));
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

/** Nombre oficial (Anexo 1) de un servicio del catálogo, o null si no está. */
export function nombreOficial(codigoServicio: string): string | null {
  const s = INDICE_MODELO.get(claveCodigo(codigoServicio))?.serv;
  return s && s.codigo_completo ? s.descripcion : null;
}

export function cantidadServiciosConProcedimiento(): number {
  let n = 0;
  for (const { serv } of INDICE_MODELO.values()) if (serv.procedimiento) n++;
  return n;
}

/** Servicios con tarifa Estatal / Interno (el catálogo de la app: 1858). */
export function cantidadServiciosTarifarioEstatal(): number {
  let n = 0;
  for (const { serv } of INDICE_MODELO.values()) if (serv.tarifas.estatal_interno != null) n++;
  return n;
}

/** «90» → «90 min (1 h 30 min)»; «45» → «45 min»; admite decimales sin ruido. */
export function formatearMinutos(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return '—';
  const limpio = Number(min.toFixed(2));
  if (limpio < 60) return `${limpio} min`;
  const h = Math.floor(limpio / 60);
  const r = Number((limpio - h * 60).toFixed(2));
  return r ? `${limpio} min (${h} h ${r} min)` : `${limpio} min (${h} h)`;
}
