/**
 * database/db.ts
 *
 * Conexión única a la base de datos SQLite y aplicación del esquema.
 * Usa la API asíncrona de expo-sqlite (openDatabaseAsync / execAsync /
 * runAsync / getAllAsync / getFirstAsync), que es la actual desde el
 * SDK 51 en adelante.
 *
 * Requisito: `npx expo install expo-sqlite` en el proyecto (ver README).
 */
import * as SQLite from 'expo-sqlite';
import { MIGRACIONES_COLUMNAS, SCHEMA_SQL_CORE, SCHEMA_SQL_FTS, SCHEMA_VERSION } from './schema';

const DATABASE_NAME = 'gbottel.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Devuelve la conexión activa, abriéndola una sola vez. Todo el módulo
 * de servicios (tarifarioService, y los que vengan en fases futuras)
 * pasa por aquí para no abrir conexiones duplicadas.
 *
 * Memoiza la PROMESA en vuelo, no el resultado ya resuelto: si dos
 * pantallas llaman getDatabase() casi al mismo tiempo al montar (el caso
 * normal en React, no una rareza), ambas deben esperar la misma apertura
 * en vez de disparar openDatabaseAsync() dos veces en paralelo.
 */
export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DATABASE_NAME).catch((error) => {
      // Si falla la apertura, no dejamos la promesa fallida memoizada:
      // el próximo llamado debe poder reintentar en vez de quedar
      // encadenado a un rechazo permanente.
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

/**
 * Aplica el esquema completo (CREATE TABLE IF NOT EXISTS, índices,
 * triggers de búsqueda). Llamar una vez al arrancar la app, antes de
 * usar cualquier función de services/*.
 */

async function migrarTecnicosAEsquemaActual(db: SQLite.SQLiteDatabase): Promise<void> {
  const columnas = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(tecnicos)`);
  const nombres = new Set(columnas.map((c) => c.name));
  const columnasAntiguas = ['tipoPago', 'salarioFijo', 'porcentajeComision', 'deducciones', 'aportesLegales'];
  if (!nombres.size || !columnasAntiguas.some((columna) => nombres.has(columna))) return;

  // Reconstrucción compatible con bases antiguas. Nunca asumimos que una
  // columna histórica exista: se inspecciona primero y se usa un fallback.
  // Además, foreign_keys siempre se restaura aunque una sentencia falle.
  const expresion = (columna: string, fallback: string) =>
    nombres.has(columna) ? `"${columna}"` : fallback;
  const salario = nombres.has('salarioBasico')
    ? `COALESCE("salarioBasico", ${nombres.has('salarioFijo') ? '"salarioFijo"' : '0'}, 0)`
    : (nombres.has('salarioFijo') ? `COALESCE("salarioFijo", 0)` : '0');
  const estado = nombres.has('estado')
    ? `CASE WHEN "estado" IN ('activo','inactivo') THEN "estado" ELSE 'activo' END`
    : nombres.has('activo')
      ? `CASE WHEN COALESCE("activo",1) = 1 THEN 'activo' ELSE 'inactivo' END`
      : "'activo'";

  await db.execAsync(`PRAGMA foreign_keys = OFF`);
  try {
    await db.execAsync(`BEGIN`);
    await db.execAsync(`
      DROP TABLE IF EXISTS tecnicos_nuevo;
      CREATE TABLE tecnicos_nuevo (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        cargo TEXT NOT NULL DEFAULT '',
        ci TEXT NOT NULL DEFAULT '',
        telefono TEXT,
        correo TEXT,
        salarioBasico REAL NOT NULL DEFAULT 0,
        aportesONAT REAL NOT NULL DEFAULT 0,
        planMensualCUP REAL NOT NULL DEFAULT 0,
        estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','inactivo')),
        creadoEn TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    await db.execAsync(`
      INSERT INTO tecnicos_nuevo
        (id,nombre,cargo,ci,telefono,correo,salarioBasico,aportesONAT,planMensualCUP,estado,creadoEn)
      SELECT
        ${expresion('id','NULL')},
        COALESCE(${expresion('nombre',"''")}, ''),
        COALESCE(${expresion('cargo',"''")}, ''),
        COALESCE(${expresion('ci',"''")}, ''),
        ${expresion('telefono','NULL')},
        ${expresion('correo','NULL')},
        ${salario},
        COALESCE(${expresion('aportesONAT','0')}, 0),
        COALESCE(${expresion('planMensualCUP','0')}, 0),
        ${estado},
        COALESCE(${expresion('creadoEn',"datetime('now')")}, datetime('now'))
      FROM tecnicos;
    `);
    await db.execAsync(`
      DROP TABLE tecnicos;
      ALTER TABLE tecnicos_nuevo RENAME TO tecnicos;
      CREATE INDEX IF NOT EXISTS idx_ordenes_tecnico ON ordenes(tecnicoId);
      COMMIT;
    `);
  } catch (error) {
    try { await db.execAsync(`ROLLBACK`); } catch { /* la transacción puede no existir */ }
    throw error;
  } finally {
    // Nunca dejamos la conexión con foreign_keys desactivado si una
    // migración falla a mitad de camino.
    await db.execAsync(`PRAGMA foreign_keys = ON`);
  }
}

export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await getDatabase();
  console.warn('[GBOTtel] db: schema:start');
  await db.execAsync(SCHEMA_SQL_CORE);
  console.warn('[GBOTtel] db: schema:core:ok');

  await migrarTecnicosAEsquemaActual(db);
  console.warn('[GBOTtel] db: tecnicos:migrated');

  for (const sentencia of MIGRACIONES_COLUMNAS) {
    try {
      await db.execAsync(sentencia);
    } catch (error) {
      // "duplicate column name" es esperable si la columna ya existe de
      // una versión anterior de la app — cualquier otro error sí se
      // reporta, no se traga en silencio.
      if (!/duplicate column name/i.test(String(error))) {
        console.warn('Migración de columna falló:', sentencia, error);
      }
    }
  }

  try {
    await db.execAsync(SCHEMA_SQL_FTS);
    // Un índice FTS5 externo creado después de que ya existan servicios no
    // se rellena automáticamente. REBUILD deja la búsqueda consistente
    // también al migrar una base antigua.
    await db.execAsync(`INSERT INTO servicios_fts(servicios_fts) VALUES ('rebuild')`);
  } catch (error) {
    // La build de SQLite-en-WebAssembly que usa expo-sqlite en la
    // plataforma web no trae compilado el módulo fts5 (el nativo de
    // Android/iOS sí). Sin este try/catch, ese único CREATE fallido
    // tumbaba TODO el esquema — incluida `configuracion`, sin ninguna
    // relación con la búsqueda — porque execAsync corta el script
    // completo en el primer error. buscarServicios() cae a LIKE cuando
    // esto no está disponible.
    console.warn('FTS5 no disponible en esta plataforma, se sigue sin búsqueda de texto completo:', error);
  }
  console.warn('[GBOTtel] db: fts:done');
  await db.runAsync(
    `INSERT INTO configuracion (clave, valor) VALUES ('schemaVersion', ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`,
    String(SCHEMA_VERSION)
  );
  console.warn(`[GBOTtel] db: ready version=${SCHEMA_VERSION}`);
  return db;
}

/**
 * Cierra la conexión. Solo se usa en scripts de verificación/pruebas;
 * la app en uso normal mantiene la conexión abierta todo el tiempo de
 * vida de la sesión.
 */
export async function cerrarDatabase(): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise;
  await db.closeAsync();
  dbPromise = null;
}
