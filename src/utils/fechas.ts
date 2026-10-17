export function formatearFecha(valor: string | null | undefined, incluirHora = false): string {
  if (!valor) return '—';
  const limpio = valor.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(limpio);
  if (!match) return limpio;

  const [, anio, mes, dia, hora, minuto] = match;
  const fecha = `${dia}/${mes}/${anio}`;
  if (incluirHora && hora && minuto) return `${fecha} ${hora}:${minuto}`;
  return fecha;
}

export function fechaHoyISO(): string {
  const ahora = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}`;
}
