/**
 * Formato único de importes. Todas las pantallas, el PDF y las exportaciones
 * deben pasar por aquí para que un mismo importe se vea idéntico en todas partes.
 *
 * Regla: nunca se abrevia ni se redondea a enteros. Se muestran siempre al menos
 * 2 decimales y todos los decimales significativos (hasta 10). El único ajuste es
 * eliminar el ruido binario del punto flotante (p. ej. 0.1 * 3 = 0.30000000000000004
 * se muestra como 0,30), que no es un redondeo de presentación.
 */
export type CodigoMoneda = 'CUP' | 'USD';

const DECIMALES_MAXIMOS = 10;

/** Quita el ruido de coma flotante sin perder decimales reales. */
export function normalizarImporte(valor: number | null | undefined): number {
  const n = typeof valor === 'number' && Number.isFinite(valor) ? valor : 0;
  return Number(n.toFixed(DECIMALES_MAXIMOS));
}

const formateadores: Partial<Record<CodigoMoneda, Intl.NumberFormat>> = {};

export function formatearImporte(valor: number | null | undefined, moneda: CodigoMoneda): string {
  let f = formateadores[moneda];
  if (!f) {
    f = new Intl.NumberFormat('es-CU', {
      style: 'currency',
      currency: moneda,
      minimumFractionDigits: 2,
      maximumFractionDigits: DECIMALES_MAXIMOS,
    });
    formateadores[moneda] = f;
  }
  return f.format(normalizarImporte(valor));
}

/** Número plano con punto decimal (para CSV/XLSX/JSON), sin separadores ni símbolo. */
export function importeComoTexto(valor: number | null | undefined): string {
  const n = normalizarImporte(valor);
  const texto = String(n);
  // Evita la notación científica en importes muy pequeños o enormes.
  return /e/i.test(texto) ? n.toFixed(DECIMALES_MAXIMOS).replace(/0+$/, '').replace(/\.$/, '') : texto;
}
