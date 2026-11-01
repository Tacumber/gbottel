/**
 * Reglas puras del formulario de orden de servicio (sin React ni SQLite) para que
 * puedan probarse de forma automática.
 */

/** Lee un número escrito por el técnico ("1.234,5", "2,5", "10"). Devuelve `respaldo` si no es válido. */
export function numeroLocal(valor: string, respaldo = 0): number {
  const n = numeroLocalEstricto(valor);
  return Number.isFinite(n) ? n : respaldo;
}

/** Igual que `numeroLocal`, pero devuelve NaN si el texto está vacío o no es un número. */
export function numeroLocalEstricto(valor: string): number {
  const limpio = valor.trim().replace(/\s/g, '');
  if (!limpio) return NaN;
  const normalizado =
    limpio.includes(',') && limpio.includes('.')
      ? limpio.lastIndexOf(',') > limpio.lastIndexOf('.')
        ? limpio.replace(/\./g, '').replace(',', '.')
        : limpio.replace(/,/g, '')
      : limpio.includes(',')
        ? limpio.replace(',', '.')
        : limpio;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : NaN;
}

// ------------------------------------------------------------------
// Cantidades en modalidad múltiple
// ------------------------------------------------------------------

export interface LineaConCantidad {
  cantidad: string;
  /** true cuando el técnico escribió la cantidad: el autollenado ya no la toca. */
  cantidadManual?: boolean;
}

/** Cantidad con la que nace una línea de servicio: nº de equipos en modalidad múltiple, 1 en otro caso. */
export function cantidadInicial(modalidadMultiple: boolean, numeroEquipos: number): string {
  return modalidadMultiple && numeroEquipos > 0 ? String(numeroEquipos) : '1';
}

/**
 * Al cambiar el nº de equipos, solo se reajustan las líneas cuya cantidad NO fue escrita
 * por el técnico. La cantidad nunca se limita al nº de equipos (p. ej. 4 cargas para 2
 * equipos, 16 perforaciones). Fuera de modalidad múltiple no cambia nada.
 */
export function sincronizarCantidades<T extends LineaConCantidad>(
  lineas: T[],
  numeroEquipos: number,
  modalidadMultiple: boolean,
): T[] {
  if (!modalidadMultiple) return lineas;
  return lineas.map((l) => (l.cantidadManual ? l : { ...l, cantidad: cantidadInicial(true, numeroEquipos) }));
}

// ------------------------------------------------------------------
// Tiempo de trabajo
// ------------------------------------------------------------------

export interface LineaConTiempo {
  cantidad: string;
  /** Minutos por unidad definidos en el catálogo; null/undefined/≤0 = sin duración definida. */
  tiempoEstimado?: number | null;
}

/**
 * Suma de duraciones de los servicios seleccionados que tienen una duración definida:
 * minutos por unidad × cantidad. Las líneas sin duración se ignoran (no suman 0 ni 1).
 * DECISIÓN A CONFIRMAR: se multiplica por la cantidad porque `tiempoEstimado` es por unidad.
 */
export function calcularTiempoAutomatico(lineas: LineaConTiempo[]): number {
  let total = 0;
  for (const l of lineas) {
    const t = l.tiempoEstimado;
    if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0) continue;
    const cantidad = numeroLocal(l.cantidad, 1);
    total += t * (cantidad > 0 ? cantidad : 1);
  }
  return Math.round(total * 100) / 100;
}

export interface EstadoTiempo {
  /** Texto del campo «Tiempo de trabajo (minutos)». */
  texto: string;
  /** true si el técnico lo escribió: el valor automático solo se muestra como referencia. */
  manual: boolean;
}

/** Tiempo a mostrar en el campo: el manual se conserva siempre; si no, el automático (vacío si es 0). */
export function resolverTiempo(estado: EstadoTiempo, automatico: number): EstadoTiempo {
  if (estado.manual) return estado;
  return { texto: automatico > 0 ? String(automatico) : '', manual: false };
}

// ------------------------------------------------------------------
// Secciones plegables (solo presentación)
// ------------------------------------------------------------------

export const SECCIONES_ORDEN = [
  'encabezado',
  'clasificacion',
  'cliente',
  'servicio-equipo',
  'detalles',
  'materiales',
  'servicios',
  'totales',
  'firmas',
] as const;
export type SeccionOrden = (typeof SECCIONES_ORDEN)[number];

/** Lee la preferencia guardada; ignora cualquier valor que no sea una sección conocida. */
export function parsearSeccionesOcultas(texto: string | null | undefined): SeccionOrden[] {
  if (!texto) return [];
  try {
    const datos: unknown = JSON.parse(texto);
    if (!Array.isArray(datos)) return [];
    return SECCIONES_ORDEN.filter((s) => datos.includes(s));
  } catch {
    return [];
  }
}

export function serializarSeccionesOcultas(ocultas: readonly SeccionOrden[]): string {
  return JSON.stringify(SECCIONES_ORDEN.filter((s) => ocultas.includes(s)));
}

/** Clave en `configuracion`: una preferencia por técnico (0 = órdenes sin técnico principal). */
export function clavePreferenciaSecciones(tecnicoId: number | null | undefined): string {
  return `seccionesOcultas:${tecnicoId ?? 0}`;
}

/** Instantánea comparable del formulario (ignora claves internas de React y marcas derivadas). */
export function instantaneaFormulario(valor: unknown): string {
  return JSON.stringify(valor, (k, v) => (k === 'clave' || k === 'cantidadManual' || k === 'tiempoEstimado' ? undefined : v));
}
