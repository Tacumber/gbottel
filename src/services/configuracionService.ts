import { getDatabase } from '../database/db';

/**
 * Acceso genérico a la tabla `configuracion` (clave/valor), ya en el
 * esquema desde "Fase 5" (ver schema.ts) pero sin usar hasta ahora salvo
 * por dos claves internas de ordenesService.ts (siguienteFolio) y db.ts
 * (schemaVersion), cada una con su propio INSERT/UPDATE repetido. Esto
 * generaliza ese mismo patrón de upsert para cualquier preferencia nueva
 * de la app (ej. qué secciones del formulario deja colapsadas el
 * técnico) sin tener que escribir el SQL de nuevo cada vez.
 *
 * Solo texto plano: quien necesite guardar un número o un booleano lo
 * convierte a string antes de guardar y lo vuelve a convertir al leer
 * (mismo criterio que ya usa siguienteFolio). Para guardar una lista o un
 * objeto, JSON.stringify/JSON.parse del lado de quien llama.
 */

export async function obtenerConfiguracion(clave: string): Promise<string | null> {
  const db = await getDatabase();
  const fila = await db.getFirstAsync<{ valor: string | null }>(
    `SELECT valor FROM configuracion WHERE clave = ?`,
    clave
  );
  return fila?.valor ?? null;
}

export async function guardarConfiguracion(clave: string, valor: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO configuracion (clave, valor) VALUES (?, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`,
    clave,
    valor
  );
}
