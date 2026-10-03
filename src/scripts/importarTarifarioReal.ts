/**
 * scripts/importarTarifarioReal.ts
 *
 * Fase 1.2 — importa el tarifario real (1,858 servicios, convertidos desde
 * Tecnostar_CM_030325.xlsx) a la base local. Se corre una sola vez, igual
 * que verificarInstalacion.ts.
 *
 * IMPORTANTE — antes de correr esto: el esquema subió de v1 a v2 (se
 * agregaron 4 columnas a `servicios`). Si ya habías corrido la Fase 1.1 en
 * un dispositivo/emulador, borra la app o el archivo de base de datos
 * (`tecnostar.db`) antes de continuar — CREATE TABLE IF NOT EXISTS no
 * agrega columnas a una tabla que ya existe con el esquema viejo. No hay
 * datos reales que perder todavía (solo los 2 servicios de prueba).
 */
import serviciosSeed from '../data/servicios_seed.json';
import { initDatabase } from '../database/db';
import { importarServiciosDesdeJSON, contarServicios } from '../services/tarifarioService';
import type { NuevoServicio } from '../types/tarifario.types';

export async function importarTarifarioReal(): Promise<void> {
  console.log('\n=== Fase 1.2 — Importación del Tarifario real ===');

  await initDatabase();

  const datos = serviciosSeed as unknown as NuevoServicio[];
  console.log(`Leídos ${datos.length} servicios del JSON (se esperaban 1858).`);

  const resultado = await importarServiciosDesdeJSON(datos);
  console.log(`Importados: ${resultado.importados}`);
  console.log(`Duplicados/omitidos: ${resultado.duplicados}`);
  if (resultado.errores.length > 0) {
    console.log('Primeros errores:', resultado.errores);
  }

  const totalEnBase = await contarServicios();
  console.log(`Total de servicios activos en la base ahora: ${totalEnBase}`);

  // Distribución por categoría (todavía con los placeholders "Modalidad N")
  const porCategoria: Record<string, number> = {};
  for (const s of datos) {
    porCategoria[s.categoria] = (porCategoria[s.categoria] ?? 0) + 1;
  }
  console.log('Distribución por categoría (placeholder):', porCategoria);

  console.log(
    resultado.importados === 1858
      ? 'PASA — se importaron los 1858 servicios esperados.'
      : `REVISAR — se esperaban 1858 y se importaron ${resultado.importados}.`
  );
  console.log('===================================================\n');
}
