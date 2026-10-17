/**
 * utils/fecha.ts
 *
 * Toda fecha se guarda en la base y se usa en SQL como "AAAA-MM-DD" o
 * "AAAA-MM-DD HH:mm" (eso es lo que ordena y filtra bien con
 * strftime()/date() en analyticsService.ts) — ese formato de
 * almacenamiento NO cambia. Esto es solo para lo que el técnico LEE en
 * pantalla: en toda la app las fechas se muestran como dd/mm/aaaa, a
 * pedido explícito ("En general ordenar todas las fechas en dd/mm/aaaa").
 *
 * No se usa para texto que se exporta para volver a importarse en otro
 * software (la columna de fecha del CSV, por ejemplo, se deja en
 * AAAA-MM-DD a propósito — ver respaldoService.ts) ni para nombres de
 * archivo.
 */
export function formatoFechaVisible(iso: string | null | undefined): string {
  if (!iso) return '';
  const [fecha, hora] = iso.split(' ');
  const [anio, mes, dia] = fecha.split('-');
  if (!anio || !mes || !dia) return iso;
  return hora ? `${dia}/${mes}/${anio} ${hora}` : `${dia}/${mes}/${anio}`;
}
