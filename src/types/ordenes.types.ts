export type TipoCobertura = "garantia" | "postgarantia" | "garantia_servicio";
export type EstadoOrden =
  | "pendiente"
  | "en_progreso"
  | "finalizada"
  | "facturada";

export type ModalidadServicio =
  | "revision_diagnostico"
  | "instalacion_montaje"
  | "servicio_taller"
  | "reparacion"
  | "mantenimiento"
  | "visita_tecnica";

export const MODALIDADES_SERVICIO: {
  valor: ModalidadServicio;
  etiqueta: string;
}[] = [
  { valor: "revision_diagnostico", etiqueta: "Revisión y Diagnóstico" },
  { valor: "instalacion_montaje", etiqueta: "Instalación y Montaje" },
  { valor: "servicio_taller", etiqueta: "Servicio en Taller" },
  { valor: "reparacion", etiqueta: "Reparación" },
  { valor: "mantenimiento", etiqueta: "Mantenimiento" },
  { valor: "visita_tecnica", etiqueta: "Visita Técnica" },
];

export const TIPOS_COBERTURA: { valor: TipoCobertura; etiqueta: string }[] = [
  { valor: "garantia", etiqueta: "Garantía" },
  { valor: "postgarantia", etiqueta: "Postgarantía" },
  { valor: "garantia_servicio", etiqueta: "Garantía de Servicio" },
];

export interface Orden {
  id: number;
  numeroOrden: string;
  compania: string;
  codigoReporte: string | null;
  reportadoPor: string | null;
  fechaReporte: string | null;
  codigoOrden: string | null;
  codigoFactura: string | null;
  tipoCobertura: TipoCobertura | null;
  modalidadMultiple: number;
  clienteCodigo: string | null;
  clienteTipo: string | null;
  clienteNombre: string | null;
  clienteDireccion: string | null;
  clienteMunicipio: string | null;
  clienteProvincia: string | null;
  /** JSON.stringify de ModalidadServicio[] */
  modalidadesServicio: string | null;
  equipoTipo: string | null;
  equipoMarca: string | null;
  equipoModelo: string | null;
  equipoNroSerie: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  tiempoTrabajoMinutos: number | null;
  observaciones: string | null;
  tecnicoId: number | null;
  estado: EstadoOrden;
  revisorNombre: string | null;
  revisorCargo: string | null;
  revisorFecha: string | null;
  revisorFirmado: number;
  tecnicoFirmaNombre: string | null;
  tecnicoFirmaCI: string | null;
  tecnicoFirmado: number;
  clienteFirmaNombre: string | null;
  clienteFirmaCargo: string | null;
  clienteFirmaCI: string | null;
  clienteFirmaFecha: string | null;
  clienteFirmado: number;
  creadoEn: string;
  actualizadoEn: string;
}

export type NuevaOrden = Partial<
  Omit<Orden, "id" | "numeroOrden" | "compania" | "creadoEn" | "actualizadoEn">
>;

export type ActualizacionOrden = Partial<Omit<Orden, "id" | "creadoEn">>;

export interface OrdenMaterial {
  id: number;
  ordenId: number;
  vale: string | null;
  codigo: string | null;
  descripcion: string | null;
  unidadMedida: string | null;
  cantidad: number;
  nroSerie: string | null;
  importeCUP: number;
  importeUSD: number;
}

export type NuevoOrdenMaterial = Partial<Omit<OrdenMaterial, "id" | "ordenId">>;

export interface OrdenServicio {
  id: number;
  ordenId: number;
  servicioId: number | null;
  codigo: string | null;
  descripcion: string | null;
  cantidad: number;
  importeCUP: number;
  importeUSD: number;
}

export type NuevoOrdenServicio = Partial<Omit<OrdenServicio, "id" | "ordenId">>;

export interface OrdenEquipo {
  id: number;
  ordenId: number;
  marca: string | null;
  modelo: string | null;
  nroSerie: string | null;
}

export type NuevoOrdenEquipo = Partial<Omit<OrdenEquipo, "id" | "ordenId">>;

export interface OrdenTecnico {
  id: number;
  ordenId: number;
  tecnicoId: number | null;
  nombre: string | null;
  cargo: string | null;
  ci: string | null;
  firmado: number;
}

export type NuevoOrdenTecnico = Partial<Omit<OrdenTecnico, "id" | "ordenId">>;

export interface OrdenCompleta extends Orden {
  equipos: OrdenEquipo[];
  materiales: OrdenMaterial[];
  servicios: OrdenServicio[];
  tecnicos: OrdenTecnico[];
}

export interface TotalesOrden {
  materialesCUP: number;
  materialesUSD: number;
  serviciosCUP: number;
  serviciosUSD: number;
  totalCUP: number;
  totalUSD: number;
}
