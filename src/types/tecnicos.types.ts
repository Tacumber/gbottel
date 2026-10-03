export type EstadoTecnico = 'activo' | 'inactivo';

/** Estructura maestra única del técnico. */
export interface Tecnico {
  id: number;
  nombre: string;
  cargo: string;
  ci: string;
  telefono: string | null;
  correo: string | null;
  salarioBasico: number;
  aportesONAT: number;
  planMensualCUP: number;
  estado: EstadoTecnico;
  creadoEn: string;
}

export type NuevoTecnico = Omit<Tecnico, 'id' | 'creadoEn'>;
export type ActualizacionTecnico = Partial<Omit<Tecnico, 'id' | 'creadoEn'>>;
