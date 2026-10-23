/**
 * services/tarifarioModelo.ts
 *
 * Tarifario UNIFICADO de COPEXTEL (solo lectura, 100 % offline): `src/data/tarifario_copextel.json`,
 * generado por `scripts/generar_tarifario.py` a partir del Anexo 1 (1858 servicios oficiales), los libros
 * de procedimientos técnicos y el tarifario de Población. Estructura: categorías (familias) → servicios;
 * cada servicio trae sus tarifas (`estatal_interno`, `poblacion`) y su procedimiento (o null).
 *
 * Las tarifas Estatal / Interno y Población son DISTINTAS y no se mezclan ni se comparan: cada una se
 * lee de su propio campo. La tabla `servicios` de la base sigue siendo la fuente de las órdenes
 * (vínculo, búsqueda, importar / exportar); este archivo aporta nombres oficiales, procedimientos y la
 * tarifa de Población.
 */
import datos from '../data/tarifario_copextel.json';

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
export interface ProcedimientoModelo {
  fuente: { libro: string; hoja: string; fila: number };
  modalidad: string | null;
  tecnicos: number | null;
  tiempo_minutos: number | null;
  actividades: ActividadProcedimiento[];
  insumos: InsumoProcedimiento[];
}
export type CoincidenciaPoblacion = 'nombre_igual' | 'nombre_similar' | 'confirmado';
export interface ServicioModelo {
  /** Código corto (p. ej. «0100»). */
  codigo: string;
  /** Código del catálogo de la app (p. ej. «25-0100-TER»); null si el servicio es solo de Población. */
  codigo_completo: string | null;
  /** Nombre oficial (Anexo 1). */
  descripcion: string;
  unidad_medida: string | null;
  tarifas: { estatal_interno: number | null; poblacion: number | null };
  /** Nombre en el tarifario de Población cuando difiere del oficial. */
  nombre_poblacion: string | null;
  poblacion_coincidencia: CoincidenciaPoblacion | null;
  orden_poblacion: number | null;
  modalidad: string | null;
  tipo_servicio: string | null;
  tiempo_estimado_minutos: number | null;
  cantidad_tecnicos: number | null;
  id_propietario: number | null;
  procedimiento: ProcedimientoModelo | null;
}
export interface CategoriaModelo {
  id_categoria: string;
  nombre_categoria: string;
  servicios: ServicioModelo[];
}

export const CATEGORIAS_MODELO: CategoriaModelo[] = ((datos as { categorias?: CategoriaModelo[] }).categorias ?? []) as CategoriaModelo[];

export interface ServicioConCategoria {
  cat: CategoriaModelo;
  serv: ServicioModelo;
}

/** Índice por código corto. */
export const INDICE_MODELO: Map<string, ServicioConCategoria> = (() => {
  const m = new Map<string, ServicioConCategoria>();
  for (const cat of CATEGORIAS_MODELO) for (const serv of cat.servicios ?? []) m.set(String(serv.codigo).trim(), { cat, serv });
  return m;
})();

/** «25-0100-TER» → «0100». Un código sin guiones se devuelve igual. */
export function claveCodigo(codigoServicio: string): string {
  const partes = codigoServicio.trim().split('-');
  return partes.length >= 3 ? partes[1] : codigoServicio.trim();
}
