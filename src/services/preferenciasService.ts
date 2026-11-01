import { getDatabase } from '../database/db';
import {
  clavePreferenciaSecciones,
  parsearSeccionesOcultas,
  serializarSeccionesOcultas,
  type SeccionOrden,
} from '../utils/ordenForm';

/**
 * Preferencias de presentación del formulario de orden, por técnico. Se guardan en la tabla
 * `configuracion` de SQLite (sin dependencias nuevas). Solo afectan a la pantalla: nunca
 * borran ni modifican datos de órdenes, y exportaciones/impresión siempre salen completas.
 */
export async function obtenerSeccionesOcultas(tecnicoId: number | null | undefined): Promise<SeccionOrden[]> {
  const db = await getDatabase();
  const fila = await db.getFirstAsync<{ valor: string | null }>(
    `SELECT valor FROM configuracion WHERE clave = ?`,
    clavePreferenciaSecciones(tecnicoId)
  );
  return parsearSeccionesOcultas(fila?.valor);
}

export async function guardarSeccionesOcultas(tecnicoId: number | null | undefined, ocultas: readonly SeccionOrden[]): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO configuracion (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`,
    clavePreferenciaSecciones(tecnicoId),
    serializarSeccionesOcultas(ocultas)
  );
}
