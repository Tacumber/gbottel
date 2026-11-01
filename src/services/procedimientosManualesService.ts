/**
 * services/procedimientosManualesService.ts
 *
 * Procedimiento escrito a mano (texto libre) para un servicio que no tiene procedimiento oficial.
 * 100 % local. La clave es «estatal:<código corto>» o «poblacion:<código corto>»: el mismo código
 * puede tener un procedimiento distinto según la tarifa, y no depende del id de la tabla `servicios`
 * (sobrevive a Reemplazar el tarifario).
 */
import { getDatabase } from '../database/db';
import { claveCodigo } from './tarifarioModelo';

export const MAX_PROCEDIMIENTO_MANUAL = 20000;

export interface ProcedimientoManual {
  clave: string;
  texto: string;
  creadoEn: string;
  actualizadoEn: string;
}

export function claveProcedimiento(tarifa: 'estatal' | 'poblacion', codigoServicio: string): string {
  return `${tarifa}:${claveCodigo(codigoServicio)}`;
}

export async function obtenerProcedimientoManual(clave: string): Promise<ProcedimientoManual | null> {
  const db = await getDatabase();
  return (await db.getFirstAsync<ProcedimientoManual>(`SELECT * FROM procedimientos_manuales WHERE clave = ?`, clave)) ?? null;
}

export async function guardarProcedimientoManual(clave: string, texto: string): Promise<void> {
  const limpio = texto.replace(/\r\n/g, '\n').trim();
  if (!clave.trim()) throw new Error('Falta la clave del servicio.');
  if (!limpio) throw new Error('Escribe o pega el procedimiento antes de guardar.');
  if (limpio.length > MAX_PROCEDIMIENTO_MANUAL) {
    throw new Error(`El procedimiento es demasiado largo (máximo ${MAX_PROCEDIMIENTO_MANUAL} caracteres).`);
  }
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO procedimientos_manuales (clave, texto) VALUES (?, ?)
     ON CONFLICT(clave) DO UPDATE SET texto = excluded.texto, actualizadoEn = datetime('now')`,
    clave,
    limpio
  );
}

export async function eliminarProcedimientoManual(clave: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM procedimientos_manuales WHERE clave = ?`, clave);
}

export async function contarProcedimientosManuales(): Promise<number> {
  const db = await getDatabase();
  return (await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM procedimientos_manuales`))?.n ?? 0;
}
