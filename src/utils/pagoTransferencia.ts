/**
 * Pago por transferencia (Transfermóvil) — solo informativo. El cliente escribe en su teléfono
 * el importe, su número a confirmar y la descripción (concepto); el técnico anota a mano el
 * teléfono y el Nro de transacción del SMS de confirmación y marca el check.
 */

export interface DatosPago {
  pagoTelefono: string | null;
  pagoNroTransaccion: string | null;
  pagoRealizado: number | boolean | null;
  pagoFecha: string | null;
}

/** Concepto que el cliente debe escribir: «O.S 000123 T.CLIMA». null si aún no hay folio. */
export function conceptoPago(folio: string | number | null | undefined): string | null {
  if (folio === null || folio === undefined) return null;
  let f = String(folio).trim();
  if (!f) return null;
  if (/^[0-9]+$/.test(f)) f = f.padStart(6, '0');
  return `O.S ${f} T.CLIMA`;
}

/** Valores listos para guardar: texto recortado o null; el check se guarda como 0/1. */
export function normalizarPago(p: {
  pagoTelefono: string;
  pagoNroTransaccion: string;
  pagoRealizado: boolean;
  pagoFecha: string;
}): { pagoTelefono: string | null; pagoNroTransaccion: string | null; pagoRealizado: number; pagoFecha: string | null } {
  const realizado = p.pagoRealizado ? 1 : 0;
  return {
    pagoTelefono: p.pagoTelefono.trim() || null,
    pagoNroTransaccion: p.pagoNroTransaccion.trim() || null,
    pagoRealizado: realizado,
    // La fecha solo tiene sentido con el check puesto.
    pagoFecha: realizado ? p.pagoFecha.trim() || null : null,
  };
}

export function hayDatosDePago(o: Partial<DatosPago>): boolean {
  return Boolean(Number(o.pagoRealizado) || o.pagoTelefono || o.pagoNroTransaccion);
}

/** Línea de texto para PDF/XLSX/listas. Vacía si no hay nada anotado. */
export function resumenPago(o: Partial<DatosPago>): string {
  if (!hayDatosDePago(o)) return '';
  const partes = [Number(o.pagoRealizado) ? 'Pago por transferencia realizado' : 'Pago por transferencia pendiente'];
  if (o.pagoNroTransaccion) partes.push(`Nro de transacción: ${o.pagoNroTransaccion}`);
  if (o.pagoTelefono) partes.push(`Teléfono del cliente: ${o.pagoTelefono}`);
  if (Number(o.pagoRealizado) && o.pagoFecha) partes.push(`Fecha: ${o.pagoFecha.slice(0, 10)}`);
  return partes.join(' · ');
}
