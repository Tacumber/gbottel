/**
 * database/schema.ts
 *
 * Fuente única del esquema de la base de datos SQLite de Tecnostar.
 * Define TODAS las tablas del sistema, aunque en la Fase 1 solo se
 * construye la capa de acceso a datos del Tarifario (tabla `servicios`).
 *
 * Se define completo desde ahora para que Órdenes (Fase 2), Técnicos
 * (Fase 3) y Reportes/Configuración (Fase 5) no necesiten romper claves
 * foráneas ya existentes ni migrar datos reales más adelante.
 *
 * Si editas este esquema después de tener datos reales cargados, esto
 * NO corre migraciones automáticas — son sentencias CREATE TABLE IF NOT
 * EXISTS, así que un cambio de columna en una tabla ya creada no se
 * aplica solo. Eso se resuelve con un sistema de migraciones real en
 * una fase posterior, no lo necesitas todavía con datos de prueba.
 */

export const SCHEMA_VERSION = 5;

// Migración de columnas nuevas para bases que ya tenían `ordenes` creada
// antes de que existiera la sección 9 del formulario (Firmas y
// Conformidad). CREATE TABLE IF NOT EXISTS no agrega columnas a una tabla
// que ya existe — hace falta ALTER TABLE aparte. Cada sentencia se
// intenta suelta y se ignora el error si la columna ya existe (mismo
// patrón que el fallback de FTS5 en db.ts).
export const MIGRACIONES_COLUMNAS: string[] = [
  `ALTER TABLE orden_tecnicos ADD COLUMN cargo TEXT`,
  `ALTER TABLE orden_tecnicos ADD COLUMN tecnicoId INTEGER REFERENCES tecnicos(id) ON DELETE SET NULL`,
  `ALTER TABLE ordenes ADD COLUMN revisorNombre TEXT`,
  `ALTER TABLE ordenes ADD COLUMN revisorCargo TEXT`,
  `ALTER TABLE ordenes ADD COLUMN revisorFecha TEXT`,
  `ALTER TABLE ordenes ADD COLUMN revisorFirmado INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE ordenes ADD COLUMN tecnicoFirmaNombre TEXT`,
  `ALTER TABLE ordenes ADD COLUMN tecnicoFirmaCI TEXT`,
  `ALTER TABLE ordenes ADD COLUMN tecnicoFirmado INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE ordenes ADD COLUMN clienteFirmaNombre TEXT`,
  `ALTER TABLE ordenes ADD COLUMN clienteFirmaCargo TEXT`,
  `ALTER TABLE ordenes ADD COLUMN clienteFirmaCI TEXT`,
  `ALTER TABLE ordenes ADD COLUMN clienteFirmaFecha TEXT`,
  `ALTER TABLE ordenes ADD COLUMN clienteFirmado INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE tecnicos ADD COLUMN planMensualCUP REAL NOT NULL DEFAULT 0`,
];
// v2: se agregan 4 columnas a `servicios` que aparecieron en el xlsx real
// (Tecnostar_CM_030325.xlsx) y no estaban en el esquema original de la Fase 1.1:
// cantidadTecnicos, idPropietario, insumosCUP, detalleFactura. Ver notas en el
// README sobre el significado todavía sin confirmar de idPropietario e insumosCUP.

export const SCHEMA_SQL_CORE = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ============================================================
-- TARIFARIO (catálogo de servicios) — Fase 1
-- ============================================================
CREATE TABLE IF NOT EXISTS servicios (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  codigoServicio      TEXT NOT NULL UNIQUE,
  nombreServicio      TEXT NOT NULL,
  categoria           TEXT NOT NULL,
  descripcionTecnica  TEXT,
  -- Nombre corto usado para el detalle de factura en el sistema anterior de
  -- Yoel (columna "Detalle_Fact" del xlsx real, tope de ~50 caracteres).
  -- Se conserva aparte porque en 548 de 1858 filas corta la palabra a la
  -- mitad — no sirve como nombre principal, pero puede ser el formato que
  -- se necesita para cumplir con la factura física existente.
  detalleFactura      TEXT,
  unidad              TEXT,
  precioBase          REAL NOT NULL DEFAULT 0,
  -- Sin dato de origen en el xlsx real y sin uso en la fórmula de comisión
  -- (que corre sobre el precio real de la orden, no sobre este catálogo).
  -- Queda en 0 hasta que se confirme si sirve para algo o se elimina.
  precioTecnico       REAL NOT NULL DEFAULT 0,
  tiempoEstimado      INTEGER,
  -- Técnicos que requiere el servicio (columna "Cant_tec": 1 a 10 en los
  -- datos reales). No estaba en el esquema original de la Fase 1.1.
  cantidadTecnicos    INTEGER NOT NULL DEFAULT 1,
  -- Columna "ID_Propietario" del xlsx real: 10 valores distintos, NO con
  -- distribución pareja (verificado sobre las 1858 filas reales: va de 5
  -- a 453 filas por valor). Significado sin confirmar — se preserva por
  -- si corresponde a un área/departamento interno de COPEXTEL.
  idPropietario       INTEGER,
  -- Columna "Insumos_CUP" del xlsx real. Escala muy por debajo de
  -- precioBase (promedio 3.72 vs 7347) — no parece ser un costo en pesos
  -- comparable. Significado sin confirmar, se preserva sin usar en ningún
  -- cálculo todavía.
  insumosCUP          REAL DEFAULT 0,
  activo              INTEGER NOT NULL DEFAULT 1,
  creadoEn            TEXT NOT NULL DEFAULT (datetime('now')),
  actualizadoEn       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_servicios_categoria ON servicios(categoria);
CREATE INDEX IF NOT EXISTS idx_servicios_activo ON servicios(activo);

-- ============================================================
-- TÉCNICOS — Fase 3 (esquema listo desde ahora)
-- ============================================================
CREATE TABLE IF NOT EXISTS tecnicos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre         TEXT NOT NULL,
  cargo          TEXT NOT NULL DEFAULT '',
  ci             TEXT NOT NULL DEFAULT '',
  telefono       TEXT,
  correo         TEXT,
  salarioBasico  REAL NOT NULL DEFAULT 0,
  aportesONAT    REAL NOT NULL DEFAULT 0,
  planMensualCUP REAL NOT NULL DEFAULT 0,
  estado         TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','inactivo')),
  creadoEn       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- ÓRDENES DE TRABAJO — Fase 2 (esquema listo desde ahora)
-- La comisión del técnico se calcula sobre orden_servicios.importeCUP
-- (el precio real cobrado en esa orden), no sobre el precio de catálogo.
-- ============================================================
CREATE TABLE IF NOT EXISTS ordenes (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  numeroOrden           TEXT NOT NULL UNIQUE,
  compania              TEXT NOT NULL DEFAULT 'COPEXTEL',
  codigoReporte         TEXT,
  reportadoPor          TEXT,
  fechaReporte          TEXT,
  codigoOrden           TEXT,
  codigoFactura         TEXT,
  tipoCobertura         TEXT CHECK (tipoCobertura IN ('garantia','postgarantia','garantia_servicio')),
  -- Booleano simple: ¿la orden cubre varios equipos o servicios? (decidido así por defecto)
  modalidadMultiple     INTEGER NOT NULL DEFAULT 0,
  clienteCodigo         TEXT,
  clienteTipo           TEXT,
  clienteNombre         TEXT,
  clienteDireccion      TEXT,
  clienteMunicipio      TEXT,
  clienteProvincia      TEXT,
  modalidadesServicio   TEXT, -- JSON: ["revision_diagnostico","instalacion_montaje",...]
  equipoTipo            TEXT,
  equipoMarca           TEXT,
  equipoModelo          TEXT,
  equipoNroSerie        TEXT,
  fechaInicio           TEXT,
  fechaFin              TEXT,
  tiempoTrabajoMinutos  INTEGER,
  observaciones         TEXT,
  tecnicoId             INTEGER REFERENCES tecnicos(id) ON DELETE SET NULL,
  estado                TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','en_progreso','finalizada','facturada')),
  -- Sección 9 del formulario: Firmas y Conformidad. La firma como trazo/imagen
  -- queda para una fase posterior — por ahora se guardan los datos de cada
  -- bloque más un check de "firmado".
  revisorNombre         TEXT,
  revisorCargo          TEXT,
  revisorFecha          TEXT,
  revisorFirmado        INTEGER NOT NULL DEFAULT 0,
  tecnicoFirmaNombre    TEXT,
  tecnicoFirmaCI        TEXT,
  tecnicoFirmado        INTEGER NOT NULL DEFAULT 0,
  clienteFirmaNombre    TEXT,
  clienteFirmaCargo     TEXT,
  clienteFirmaCI        TEXT,
  clienteFirmaFecha     TEXT,
  clienteFirmado        INTEGER NOT NULL DEFAULT 0,
  creadoEn              TEXT NOT NULL DEFAULT (datetime('now')),
  actualizadoEn         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ordenes_estado ON ordenes(estado);
CREATE INDEX IF NOT EXISTS idx_ordenes_tecnico ON ordenes(tecnicoId);
CREATE INDEX IF NOT EXISTS idx_ordenes_fecha ON ordenes(fechaReporte);

-- Tabla 1 del formulario: Materiales Utilizados.
-- importeUSD se guarda pero NO se agrega a Tablero/Reportes en v1
-- (decisión: mostrar solo CUP por ahora).
CREATE TABLE IF NOT EXISTS orden_materiales (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ordenId        INTEGER NOT NULL REFERENCES ordenes(id) ON DELETE CASCADE,
  vale           TEXT,
  codigo         TEXT,
  descripcion    TEXT,
  unidadMedida   TEXT,
  cantidad       REAL NOT NULL DEFAULT 0,
  nroSerie       TEXT,
  importeCUP     REAL NOT NULL DEFAULT 0,
  importeUSD     REAL NOT NULL DEFAULT 0
);

-- Tabla 2 del formulario: Servicios Prestados.
-- codigo/descripcion/importeCUP quedan copiados en la línea (no solo
-- referenciados por servicioId) para que si el precio del catálogo
-- cambia después, la orden vieja no cambie de valor retroactivamente.
CREATE TABLE IF NOT EXISTS orden_servicios (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ordenId        INTEGER NOT NULL REFERENCES ordenes(id) ON DELETE CASCADE,
  servicioId     INTEGER REFERENCES servicios(id) ON DELETE SET NULL,
  codigo         TEXT,
  descripcion    TEXT,
  cantidad       REAL NOT NULL DEFAULT 1,
  importeCUP     REAL NOT NULL DEFAULT 0,
  importeUSD     REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_orden_materiales_orden ON orden_materiales(ordenId);
CREATE INDEX IF NOT EXISTS idx_orden_servicios_orden ON orden_servicios(ordenId);

-- Firmas de técnicos cuando el trabajo lo hace una brigada (varios
-- técnicos en una misma orden, cada uno firma). Las columnas
-- tecnicoFirma* en ordenes quedan sin usar desde la UI pero no se
-- borran — evita otra migración de columnas y no rompen nada estando ahí.
CREATE TABLE IF NOT EXISTS orden_tecnicos (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ordenId   INTEGER NOT NULL REFERENCES ordenes(id) ON DELETE CASCADE,
  tecnicoId INTEGER REFERENCES tecnicos(id) ON DELETE SET NULL,
  nombre    TEXT,
  cargo     TEXT,
  ci        TEXT,
  firmado   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_orden_tecnicos_orden ON orden_tecnicos(ordenId);

-- ============================================================
-- CONFIGURACIÓN — Fase 5 (esquema listo desde ahora)
-- ============================================================
CREATE TABLE IF NOT EXISTS configuracion (
  clave  TEXT PRIMARY KEY,
  valor  TEXT
);
`;

// Búsqueda de texto completo — necesaria para que la búsqueda en tiempo
// real no se ponga lenta cuando el catálogo crezca a miles de filas.
//
// Separado de SCHEMA_SQL_CORE a propósito: el SQLite compilado a
// WebAssembly que usa expo-sqlite en la plataforma web no trae el módulo
// fts5 compilado (el nativo de Android/iOS sí lo tiene). db.execAsync()
// corta la ejecución del script completo en el primer error — si esto
// viviera en el mismo bloque que las demás tablas, un solo fallo de fts5
// tumbaba TODO el esquema, incluidas tablas sin relación como
// `configuracion`. db.ts intenta este bloque aparte y tolera que falle;
// tarifarioService.ts cae a una búsqueda con LIKE si esto no existe.
export const SCHEMA_SQL_FTS = `
CREATE VIRTUAL TABLE IF NOT EXISTS servicios_fts USING fts5(
  nombreServicio,
  descripcionTecnica,
  codigoServicio,
  content='servicios',
  content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS servicios_ai AFTER INSERT ON servicios BEGIN
  INSERT INTO servicios_fts(rowid, nombreServicio, descripcionTecnica, codigoServicio)
  VALUES (new.id, new.nombreServicio, new.descripcionTecnica, new.codigoServicio);
END;

CREATE TRIGGER IF NOT EXISTS servicios_ad AFTER DELETE ON servicios BEGIN
  INSERT INTO servicios_fts(servicios_fts, rowid, nombreServicio, descripcionTecnica, codigoServicio)
  VALUES('delete', old.id, old.nombreServicio, old.descripcionTecnica, old.codigoServicio);
END;

CREATE TRIGGER IF NOT EXISTS servicios_au AFTER UPDATE ON servicios BEGIN
  INSERT INTO servicios_fts(servicios_fts, rowid, nombreServicio, descripcionTecnica, codigoServicio)
  VALUES('delete', old.id, old.nombreServicio, old.descripcionTecnica, old.codigoServicio);
  INSERT INTO servicios_fts(rowid, nombreServicio, descripcionTecnica, codigoServicio)
  VALUES (new.id, new.nombreServicio, new.descripcionTecnica, new.codigoServicio);
END;
`;
