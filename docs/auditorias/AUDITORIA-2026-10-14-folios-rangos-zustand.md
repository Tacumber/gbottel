# GBOTtel — Auditoría del issue #3: folios por rangos y Zustand

- **Fecha:** 2026-10-14
- **Autor:** Claude (auditoría de solo lectura)
- **Commit auditado:** `main` @ `8da4e7f20e24835ad07a5fc17f952d6d0680ec62` (misma punta que `integracion/termux-pc-20261011`)
- **Issue:** #3

## 1. Alcance y límites

Solo se auditó el commit publicado de `main`. No se modificó código, no se instaló nada, no se tocaron ramas.

**Leído en ese commit:** `schema.ts`, `db.ts`, `ordenesService.ts`, `respaldoService.ts`, `tecnicosService.ts`, `analyticsService.ts`, `ordenes.types.ts`, `orden-nueva.tsx`, `ordenes.tsx`, `tecnicos.tsx`, `package.json`.

**No verificable desde GitHub:**
- La rama local `gemini/qa-20261009` y sus cambios sin commit. No se auditó nada de ellos.
- `SCHEMA_VERSION = 6`, `siguienteNumeroOrden()` y la clave `siguienteFolio` de la incidencia **no existen en `main`**: ahí hay `SCHEMA_VERSION = 5` y el folio sale del `id`.
- Las ramas `chatgpt/reparacion-integral-2026-10-07` y su variante `-fixed` (`de66a15`) no son el objeto de esta auditoría; `-fixed` no se ha revisado.

Las pruebas citadas se ejecutaron en SQLite en memoria con el SQL de `main` o con el diseño propuesto. No se ejecutó la app en un dispositivo.

## 2. Resumen ejecutivo

`main` no cumple los requisitos de folio: el folio es el `id` interno, el técnico principal se infiere del primer firmante y el traspaso de órdenes puede renumerar el histórico. La solución más pequeña es una tabla de rangos con un libro de folios emitidos y triggers que los protejan en la propia BD. Zustand es opcional y de bajo valor para esto.

| # | Hallazgo en `main` | Severidad |
| --- | --- | --- |
| 1 | `renumerarOrdenesPorFecha()` reasigna folios históricos y falla con `UNIQUE` al renumerar sin fase temporal | P0 |
| 2 | Tras renumerar, el folio basado en `id` colisiona al crear órdenes y bloquea la creación | P0 |
| 3 | Folio = `id` interno: no hay rangos ni propietario del folio | P0 (requisito) |
| 4 | Técnico principal = primer firmante con `tecnicoId` | P0 (requisito) |
| 5 | Importación de órdenes no atómica: una falla deja el traspaso a medias | P1 |
| 6 | Restaurar un respaldo antiguo en un dispositivo limpio reutiliza folios | P1 |
| 7 | Respaldo acepta solo la versión 2 y valida poco antes de borrar | P1 |
| 8 | La migración de `db.ts` apaga `foreign_keys` sin `ROLLBACK`: no es patrón para la v6 | P1 |
| 9 | `withTransactionAsync` no es exclusivo: la reserva de folio puede intercalarse | P1 |
| 10 | `prebuild` apunta a `expo prebuild --clean` | P2 |

## 3. Hallazgos con evidencia (commit 8da4e7f)

### Dónde se crea o cambia `numeroOrden` y `tecnicoId`

- `ordenesService.ts:75-83` (`crearOrden`, sin uso en la UI) y `:176-183` (`guardarOrdenCompleta`): insertan `numeroOrden = ''` y lo actualizan a `String(id).padStart(6,'0')`.
- `ordenesService.ts:185-195`: al editar, `numeroOrden` no está en la lista blanca, así que el folio se conserva (correcto).
- `respaldoService.ts:433-443` (`renumerarOrdenesPorFecha`) y `:511-513`: reescriben todos los folios si el usuario elige «Renumerar todo» (`ordenes.tsx:76-85`).
- `respaldoService.ts:103-120`: la restauración inserta `ordenes` con su `numeroOrden` original.
- `orden-nueva.tsx:505-506`: `tecnicoId = form.tecnicos.find(t => t.tecnicoId != null)?.tecnicoId` (primer firmante).
- `analyticsService.ts:173-177, 208-213`: los reportes por técnico mezclan `ordenes.tecnicoId` con `orden_tecnicos`; cambiar el significado de `tecnicoId` altera esos reportes.

### Pruebas reproducidas (SQLite en memoria)

1. Renumerar con el código de `main` (UPDATE directo en orden de fecha) falla con `UNIQUE constraint failed: ordenes.numeroOrden` cuando el orden por fecha no coincide con el de `id`.
2. Tras renumerar, un folio ya ocupado coincide con el `id` de una orden nueva y la creación falla con el mismo `UNIQUE`.
3. Restauración en el mismo dispositivo: `AUTOINCREMENT` conserva su contador, no se reutilizan ids. En dispositivo limpio o reinstalado, con un respaldo hasta el id 3, la siguiente orden recibe el folio 000004; si el equipo original ya había emitido del 000004 al 000009, esos folios se reciclan.

### Otros puntos

- **Importación no atómica.** `respaldoService.ts:488-509` llama a `guardarOrdenCompleta` por orden, cada una en su transacción.
- **Duplicados por clave débil.** `:471-486` descarta como duplicada cualquier orden con mismo cliente y fecha de reporte.
- **Respaldo.** `respaldoService.ts:11, 94`: `version !== 2` rechaza todo lo demás. Antes de borrar solo se comprueba que las tablas sean arreglos (`:98-111`); las filas se validan al insertar, dentro de la transacción (un error hace rollback).
- **Migraciones.** `db.ts:57-82`: `PRAGMA foreign_keys = OFF; BEGIN; …; PRAGMA foreign_keys = ON;` sin `ROLLBACK` ante error.
- **Transacciones.** `withTransactionAsync` de expo-sqlite no aísla otras consultas de la misma conexión; para reservar folios usar `withExclusiveTransactionAsync` y actualización condicional.
- **Totales.** `calcularTotales` (`ordenesService.ts:332`) multiplica precio unitario × cantidad una sola vez; reutilizable sin cambios.
- **`package.json:49`:** `prebuild` usa `--clean`. No se ejecutó.

## 4. Diseño recomendado de rangos (esquema v6)

Probado en un prototipo SQLite en memoria: solape bloqueado por trigger, rango contiguo permitido, consumo hasta agotar y bloqueo con `SIN_FOLIOS`, folio borrado que sigue emitido, renumeración bloqueada y rollback que no consume folio. Falta portarlo a expo-sqlite y probarlo en dispositivo.

```sql
CREATE TABLE folio_rangos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tecnicoId  INTEGER REFERENCES tecnicos(id),      -- NULL solo en el rango histórico
  desde      INTEGER NOT NULL,
  hasta      INTEGER NOT NULL,
  siguiente  INTEGER NOT NULL,
  nota       TEXT,
  creadoEn   TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (desde >= 1 AND hasta >= desde AND siguiente BETWEEN desde AND hasta + 1)
);
CREATE TRIGGER rangos_sin_solape BEFORE INSERT ON folio_rangos
WHEN EXISTS (SELECT 1 FROM folio_rangos r WHERE r.desde <= NEW.hasta AND r.hasta >= NEW.desde)
BEGIN SELECT RAISE(ABORT, 'RANGO_SOLAPADO'); END;

CREATE TABLE folios_emitidos (
  numero    TEXT PRIMARY KEY,
  ordenId   INTEGER,            -- sin FK: sobrevive al borrado de la orden
  rangoId   INTEGER,
  emitidoEn TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER folio_inmutable BEFORE UPDATE OF numeroOrden ON ordenes
WHEN OLD.numeroOrden <> '' AND NEW.numeroOrden <> OLD.numeroOrden
BEGIN SELECT RAISE(ABORT, 'FOLIO_INMUTABLE'); END;

ALTER TABLE ordenes ADD COLUMN tecnicoPrincipalId INTEGER REFERENCES tecnicos(id);
ALTER TABLE ordenes ADD COLUMN folioRangoId INTEGER REFERENCES folio_rangos(id);
```

**Alerta de agotamiento:** claves en `configuracion` (`folioAlertaRestantes`, por defecto 10; opcionalmente porcentaje), visible al elegir el principal y en la pantalla de rangos.

### Algoritmo de creación (una transacción exclusiva)

1. Validar que `tecnicoPrincipalId` esté elegido, exista y esté activo.
2. Buscar su rango con `siguiente <= hasta` (menor `desde`). Si no hay: abortar con `SIN_FOLIOS` y mostrar el mensaje de asignar otro rango.
3. `UPDATE folio_rangos SET siguiente = siguiente + 1 WHERE id = ? AND siguiente = ?` y comprobar `changes == 1`; si otra operación se adelantó, reintentar.
4. `INSERT INTO ordenes (numeroOrden = padStart(6), tecnicoPrincipalId, folioRangoId, …)` y `INSERT INTO folios_emitidos`.
5. Insertar equipos, materiales, servicios y firmantes. Cualquier fallo hace rollback y **no consume el folio**.

Editar una orden no toca folio ni rango. Los firmantes siguen en `orden_tecnicos`.

### Decisiones de diseño

- **Columna nueva `tecnicoPrincipalId`**, sin reutilizar `ordenes.tecnicoId`: el histórico no cambia y los reportes siguen igual. En órdenes antiguas queda `NULL` («sin principal»).
- **Técnico inactivo:** conserva su rango pero no puede elegirse como principal en órdenes nuevas; los folios sin usar quedan reservados (hay huecos). *(Pendiente de confirmar.)*
- **Rangos a mano**, tamaño variable, enteros validados, máximo razonable (p. ej. 999999) y rechazo si algún `numeroOrden` existente cae dentro del rango.
- **Límite a explicar en la app:** la BD local solo detecta solapes con rangos que conoce. Dos teléfonos desconectados pueden recibir rangos que se pisan si la administración los asigna mal; un traspaso o respaldo posterior lo detecta pero no lo evita. La asignación necesita un registro central.

### Migración del histórico

Una sola migración transaccional con `ROLLBACK` explícito y sin tocar `foreign_keys`:
1. Crear tablas, triggers y columnas.
2. Registrar todos los `numeroOrden` existentes en `folios_emitidos` (los no numéricos solo en el libro).
3. Si hay folios numéricos, crear un **rango histórico** (`tecnicoId` NULL, `desde`=mínimo, `hasta`=máximo, `siguiente`=`hasta+1`).
4. No cambiar ningún folio ni `tecnicoId` existente. Subir `SCHEMA_VERSION` a 6 solo tras el commit.

## 5. Respaldo e importación de órdenes

### Respaldo completo (nueva versión del formato)

- Exportar `folio_rangos` y `folios_emitidos`; subir `VERSION_RESPALDO`. Aceptar versiones anteriores (1 y 2) con migración en memoria.
- **Validar antes de borrar nada**, sobre el JSON ya parseado: tablas, tipos, `numeroOrden` único, rangos sin solape, `siguiente` dentro de cada rango, referencias válidas de `tecnicoPrincipalId` y `folioRangoId`.
- **El libro de folios no se reemplaza, se fusiona:** se conservan los `folios_emitidos` locales y cada rango toma el máximo entre su `siguiente` local y el del respaldo. Una orden local ausente del respaldo desaparece, pero su folio queda emitido.
- Respaldos sin rangos: crear el rango histórico a partir de sus `numeroOrden`.
- Todo en una transacción exclusiva con `ROLLBACK`.
- Coordinar la numeración de versiones con la copia local (la incidencia dice que allí ya se aceptan 1–3).

### Importación de órdenes (traspaso JSON)

- **Eliminar `renumerarOrdenesPorFecha()` y la opción «Renumerar todo»** (`ordenes.tsx:76-85`).
- **El folio viaja** (traspaso versión 2, con `numeroOrden` y datos de rango).
- **Conflictos explícitos, sin reasignar ni reciclar:** folio ya en el libro local → no se importa y se informa; folio dentro de un rango local de otro técnico → no se importa, posible error de asignación; folio libre y fuera de rangos locales → se importa y se registra.
- **Atomicidad:** una transacción para todas las órdenes aceptables; las rechazadas se listan en el resultado.
- **Duplicado por folio**, no por `cliente|fechaReporte`.
- Principal por nombre como hoy; si no se encuentra, `NULL` con aviso.

**Decisión pendiente:** ante un folio en conflicto, ¿omitir y listar, o exportar un archivo con las órdenes rechazadas?

## 6. Zustand

- **Compatibilidad:** Zustand 5.0.15 pide React ≥ 18 (el proyecto usa 19.2.3); JavaScript puro, sin módulos nativos, sin red.
- **Valor real:** el folio por rangos no depende de Zustand. Aporta sobre todo un único dueño del borrador del formulario y recargas solo cuando hay cambios.
- **Estado mínimo:** `borradorOrden` (formulario en edición, clave de ruta, `setBorrador`, `reiniciarBorrador`) y `datos` (contador `revision` + `invalidar()`).
- **No va en la tienda:** órdenes, técnicos, rangos ni totales (se leen de SQLite; totales por `calcularTotales()`).
- **Invalidar `revision` tras:** guardar/editar/eliminar orden; crear/editar/baja/reactivar técnico; asignar/retirar rango; importar órdenes; restaurar respaldo; restablecer de fábrica; importar/reemplazar tarifario.
- **Riesgo:** duplicar el formulario en tienda y componente; debe haber un solo dueño.
- **Pruebas:** el proyecto no tiene ejecutor de pruebas; las tiendas se pueden probar con un script de Node. Jest sería una dependencia de desarrollo nueva que requiere autorización.

## 7. Plan incremental (una rama y un PR por paso, sin tocar `main`)

1. Quitar «Renumerar todo» y `renumerarOrdenesPorFecha()`; renombrar `prebuild`.
2. Esquema v6: tablas, triggers, columnas y migración histórica con `ROLLBACK`.
3. Servicio de folios con reserva atómica en `ordenesService.ts`.
4. Pantalla de rangos con alerta de agotamiento y selector de técnico principal independiente.
5. Respaldo y traspaso: versiones, validación previa, fusión del libro, importación atómica.
6. Zustand (opcional).

## 8. Pruebas de aceptación

| Caso | Resultado esperado |
| --- | --- |
| Fallo a mitad de guardado | Rollback completo; el folio no se consume |
| Dos creaciones seguidas / doble toque | Folios consecutivos distintos; sin duplicados |
| Rango superpuesto / contiguo | Superpuesto rechazado; contiguo aceptado |
| Rango agotado | Se bloquea ese técnico; los demás siguen |
| Pocos folios restantes | Alerta visible al elegir el principal |
| Editar una orden | Folio y rango sin cambios |
| Varios firmantes | Un solo principal; el resto en `orden_tecnicos` |
| Borrar la última orden y crear otra | El folio borrado no se reutiliza |
| Restaurar respaldo v1/v2 | Se acepta; el libro local no retrocede |
| Restaurar respaldo con rangos solapados | Se rechaza antes de borrar |
| Importar con folio conflictivo | Omitidas y listadas; ningún folio cambia |
| Orden histórica sin principal ni folio numérico | Se abre y edita sin errores |
| Migrar una BD v5 real | Folios y órdenes intactos; `foreign_key_check` vacío |

## 9. Datos que faltan del usuario

1. Los cambios de `gemini/qa-20261009` (subir la rama o un parche) para auditar el código local.
2. Una copia real de la BD, o las columnas de `tecnicos`, para validar la migración.
3. Decisión sobre folios en conflicto en el traspaso.
4. Decisión sobre reportes: con principal explícito, ¿el ingreso se atribuye al principal o se reparte entre todos los participantes?
5. Valor de la alerta de agotamiento (cantidad o porcentaje) y tamaño máximo de un rango.
