import { getDatabase } from '../database/db';
import type { ActualizacionTecnico, NuevoTecnico, Tecnico } from '../types/tecnicos.types';

const COLUMNAS_TECNICO = new Set<string>([
  'nombre', 'cargo', 'ci', 'telefono', 'correo', 'salarioBasico', 'aportesONAT', 'planMensualCUP', 'estado',
]);

export async function listarTecnicos(opciones: { incluirInactivos?: boolean } = {}): Promise<Tecnico[]> {
  const db = await getDatabase();
  const where = opciones.incluirInactivos ? '' : `WHERE estado = 'activo'`;
  return db.getAllAsync<Tecnico>(
    `SELECT id, nombre, cargo, ci, telefono, correo, salarioBasico, aportesONAT, planMensualCUP, estado, creadoEn
     FROM tecnicos ${where} ORDER BY nombre COLLATE NOCASE ASC`
  );
}

export async function buscarTecnicos(termino: string): Promise<Tecnico[]> {
  const db = await getDatabase();
  const q = `%${termino.trim()}%`;
  return db.getAllAsync<Tecnico>(
    `SELECT id, nombre, cargo, ci, telefono, correo, salarioBasico, aportesONAT, planMensualCUP, estado, creadoEn
     FROM tecnicos
     WHERE estado='activo' AND (nombre LIKE ? OR ci LIKE ? OR cargo LIKE ? OR telefono LIKE ?)
     ORDER BY nombre COLLATE NOCASE ASC LIMIT 50`, q, q, q, q,
  );
}

export async function obtenerTecnico(id: number): Promise<Tecnico | null> {
  const db = await getDatabase();
  return db.getFirstAsync<Tecnico>(
    `SELECT id, nombre, cargo, ci, telefono, correo, salarioBasico, aportesONAT, planMensualCUP, estado, creadoEn
     FROM tecnicos WHERE id = ?`, id
  );
}

export async function crearTecnico(datos: NuevoTecnico): Promise<number> {
  const db = await getDatabase();
  const resultado = await db.runAsync(
    `INSERT INTO tecnicos (nombre, cargo, ci, telefono, correo, salarioBasico, aportesONAT, planMensualCUP, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    datos.nombre.trim(), datos.cargo.trim(), datos.ci.trim(), datos.telefono ?? null,
    datos.correo ?? null, Number(datos.salarioBasico) || 0, Number(datos.aportesONAT) || 0,
    Number(datos.planMensualCUP) || 0, datos.estado
  );
  return resultado.lastInsertRowId;
}

export async function actualizarTecnico(id: number, cambios: ActualizacionTecnico): Promise<void> {
  const entradas = Object.entries(cambios).filter(
    ([campo, valor]) => valor !== undefined && COLUMNAS_TECNICO.has(campo)
  ) as [string, string | number | null][];
  if (!entradas.length) return;
  const db = await getDatabase();
  const asignaciones = entradas.map(([campo]) => `${campo} = ?`).join(', ');
  const valores = entradas.map(([, valor]) => valor);
  await db.runAsync(`UPDATE tecnicos SET ${asignaciones} WHERE id = ?`, ...valores, id);
}

export async function eliminarTecnico(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE tecnicos SET estado = 'inactivo' WHERE id = ?`, id);
}

export async function reactivarTecnico(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`UPDATE tecnicos SET estado = 'activo' WHERE id = ?`, id);
}
