import type { Servicio } from '@/types/tarifario.types';

let seleccion: Servicio[] = [];

export function agregarSeleccionTarifario(servicios: Servicio[]) {
  const mapa = new Map(seleccion.map((s) => [s.id, s]));
  servicios.forEach((s) => mapa.set(s.id, s));
  seleccion = Array.from(mapa.values());
}

export function quitarSeleccionTarifario(id: number) {
  seleccion = seleccion.filter((s) => s.id !== id);
}

export function obtenerSeleccionTarifario() { return [...seleccion]; }
export function limpiarSeleccionTarifario() { seleccion = []; }
