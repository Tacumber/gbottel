/**
 * scripts/verificarInstalacion.ts
 *
 * Prueba de humo de la Fase 1.1. No es parte de la app final: llámala
 * una vez desde App.tsx (ver README) para confirmar que el esquema y
 * el CRUD del Tarifario funcionan antes de seguir a la Fase 1.2.
 */
import { getDatabase, initDatabase } from '../database/db';
import {
  crearServicio,
  listarServicios,
  actualizarServicio,
  eliminarServicio,
  contarServicios,
} from '../services/tarifarioService';

/**
 * Borra físicamente cualquier fila TEST-* de una corrida anterior. Este
 * script inserta datos de prueba en la MISMA base que va a tener el
 * catálogo real (tecnostar.db) — sin este borrado, correrlo más de una
 * vez (o correrlo por error contra una base con datos reales) deja
 * servicios falsos mezclados con el catálogo real de forma permanente.
 */
async function limpiarDatosDePrueba(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM servicios WHERE codigoServicio LIKE 'TEST-%'`);
}

export async function verificarInstalacionFase1(): Promise<void> {
  const resultados: string[] = [];
  const paso = (nombre: string, ok: boolean, detalle?: string) => {
    resultados.push(`${ok ? 'PASA' : 'FALLA'} — ${nombre}${detalle ? `: ${detalle}` : ''}`);
  };

  try {
    await initDatabase();
    paso('Inicializar esquema', true);
    await limpiarDatosDePrueba(); // por si quedó algo de una corrida anterior interrumpida

    const idA = await crearServicio({
      codigoServicio: 'TEST-001',
      nombreServicio: 'Servicio de prueba A',
      categoria: 'Pruebas',
      descripcionTecnica: 'Registro temporal de verificación',
      unidad: 'unidad',
      precioBase: 100,
      precioTecnico: 60,
      tiempoEstimado: 30,
    });
    paso('Crear servicio', idA > 0);

    await crearServicio({
      codigoServicio: 'TEST-002',
      nombreServicio: 'Servicio de prueba B',
      categoria: 'Pruebas',
      descripcionTecnica: null,
      unidad: 'unidad',
      precioBase: 200,
      precioTecnico: 120,
      tiempoEstimado: 45,
    });

    const antes = await contarServicios();
    paso('Listar solo activos', antes >= 2, `${antes} servicios activos`);

    await actualizarServicio(idA, { precioBase: 150 });
    paso('Actualizar servicio', true);

    await eliminarServicio(idA);
    const despues = await contarServicios();
    paso('Baja lógica (soft delete)', despues === antes - 1, `${despues} activos tras eliminar uno`);

    const listado = await listarServicios({ incluirInactivos: true });
    paso('Listar incluyendo inactivos', listado.length >= antes);
  } catch (error) {
    paso('Ejecución general', false, String(error));
  } finally {
    // Se limpia siempre, incluso si algún paso falló a mitad de camino —
    // este script no debe poder dejar TEST-001/TEST-002 en el catálogo
    // real bajo ninguna circunstancia.
    await limpiarDatosDePrueba().catch(() => {});
  }

  console.log('\n=== Verificación Fase 1.1 — Tecnostar ===');
  resultados.forEach((linea) => console.log(linea));
  console.log('==========================================\n');
}
