/**
 * types/tarifario.types.ts
 * Tipos del módulo Tarifario. Coinciden campo a campo con la tabla
 * `servicios` definida en database/schema.ts.
 */

export interface Servicio {
  id: number;
  codigoServicio: string;
  nombreServicio: string;
  categoria: string;
  descripcionTecnica: string | null;
  /** Nombre corto de factura heredado del sistema anterior. Ver schema.ts. */
  detalleFactura: string | null;
  unidad: string | null;
  precioBase: number;
  precioTecnico: number;
  tiempoEstimado: number | null;
  cantidadTecnicos: number;
  /** Significado sin confirmar todavía — ver schema.ts */
  idPropietario: number | null;
  /** Significado sin confirmar todavía — ver schema.ts */
  insumosCUP: number | null;
  /** SQLite no tiene boolean nativo: 1 = activo, 0 = dado de baja (soft delete) */
  activo: number;
  creadoEn: string;
  actualizadoEn: string;
}

export type NuevoServicio = Omit<
  Servicio,
  'id' | 'activo' | 'creadoEn' | 'actualizadoEn' | 'detalleFactura' | 'cantidadTecnicos' | 'idPropietario' | 'insumosCUP'
> & {
  /** Opcionales: no todo alta de servicio (ej. manual, desde la UI) los va a traer. */
  detalleFactura?: string | null;
  cantidadTecnicos?: number;
  idPropietario?: number | null;
  insumosCUP?: number | null;
};

export type ActualizacionServicio = Partial<NuevoServicio>;

export interface OpcionesListado {
  /** Por defecto false: no muestra servicios dados de baja. */
  incluirInactivos?: boolean;
  /** Filtra por categoría exacta (ej. "Modalidad 1"). Sin definir = todas. */
  categoria?: string;
  limite?: number;
  offset?: number;
}
