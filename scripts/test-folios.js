/**
 * Pruebas de aceptación de folios por rangos (issue #3).
 *
 * Ejecuta los servicios REALES (src/services/*.ts, src/database/*.ts) sobre
 * SQLite de verdad (node:sqlite, Node >= 22.13) sin añadir dependencias:
 *  - TypeScript se transpila al vuelo con el `typescript` del proyecto.
 *  - `expo-sqlite` se sustituye por un adaptador mínimo sobre node:sqlite.
 *    withExclusiveTransactionAsync abre una SEGUNDA conexión al mismo
 *    archivo, igual que expo-sqlite, y con claves foráneas DESACTIVADAS
 *    (peor caso) para comprobar que no se depende de ellas.
 *  - expo-file-system / expo-print / expo-sharing se sustituyen por
 *    dobles en memoria.
 *
 * Uso:  node scripts/test-folios.js        (o: npm run test:folios)
 * Variable opcional: GBOTTEL_TEST_TMP = carpeta para los archivos .db
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const assert = require('assert');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

const SRC = path.resolve(__dirname, '..', 'src');
const TMP = fs.mkdtempSync(path.join(process.env.GBOTTEL_TEST_TMP || os.tmpdir(), 'gbottel-test-'));

// ------------------------------------------------------------------
// Cargador de TypeScript + dobles de módulos nativos
// ------------------------------------------------------------------
require.extensions['.ts'] = function (module, filename) {
  const out = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  module._compile(out, filename);
};

const estado = { archivoElegido: null, compartidos: {} };

class Adaptador {
  constructor(archivo, { fk }) {
    this.db = new DatabaseSync(archivo, { enableForeignKeyConstraints: fk });
    this.archivo = archivo;
    this.db.exec('PRAGMA busy_timeout = 3000');
  }
  async execAsync(sql) { this.db.exec(sql); }
  async runAsync(sql, ...p) {
    const params = (p.length === 1 && Array.isArray(p[0]) ? p[0] : p).map((v) => (v === undefined ? null : v));
    const r = this.db.prepare(sql).run(...params);
    return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
  }
  async getFirstAsync(sql, ...p) {
    const params = p.map((v) => (v === undefined ? null : v));
    return this.db.prepare(sql).get(...params) ?? null;
  }
  async getAllAsync(sql, ...p) {
    const params = p.map((v) => (v === undefined ? null : v));
    return this.db.prepare(sql).all(...params);
  }
  async withTransactionAsync(task) {
    try { this.db.exec('BEGIN'); await task(); this.db.exec('COMMIT'); }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  async withExclusiveTransactionAsync(task) {
    const txn = new Adaptador(this.archivo, { fk: false });
    let error;
    try { txn.db.exec('BEGIN'); await task(txn); txn.db.exec('COMMIT'); }
    catch (e) { try { txn.db.exec('ROLLBACK'); } catch {} error = e; }
    finally { txn.db.close(); }
    if (error) throw error;
  }
  async closeAsync() { this.db.close(); }
}

const dobles = {
  'expo-sqlite': { openDatabaseAsync: async (nombre) => new Adaptador(path.join(TMP, nombre), { fk: true }) },
  'expo-file-system': {
    Paths: { cache: 'cache' },
    File: class {
      constructor(_dir, nombre) { this.nombre = nombre; this.exists = false; this.uri = 'mem://' + nombre; }
      create() {}
      delete() {}
      write(c) { estado.compartidos[this.nombre] = c; }
      static async pickFileAsync() {
        if (estado.archivoElegido === null) return { canceled: true };
        const c = estado.archivoElegido;
        return { canceled: false, result: { text: async () => c } };
      }
    },
  },
  'expo-print': { printToFileAsync: async ({ html }) => { estado.ultimoHtml = html; return { uri: 'mem://orden.pdf' }; } },
  'expo-sharing': { isAvailableAsync: async () => true, shareAsync: async () => {} },
};

const resolverOriginal = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...resto) {
  if (dobles[request]) return request;
  if (request.startsWith('@/')) request = path.join(SRC, request.slice(2));
  return resolverOriginal.call(this, request, parent, ...resto);
};
const cargarOriginal = Module._load;
Module._load = function (request, ...resto) {
  if (dobles[request]) return dobles[request];
  return cargarOriginal.call(this, request, ...resto);
};

const dbMod = require(path.join(SRC, 'database/db.ts'));
const schema = require(path.join(SRC, 'database/schema.ts'));
const folios = require(path.join(SRC, 'services/foliosService.ts'));
const ordenes = require(path.join(SRC, 'services/ordenesService.ts'));
const respaldo = require(path.join(SRC, 'services/respaldoService.ts'));
const tecnicosSvc = require(path.join(SRC, 'services/tecnicosService.ts'));
const analitica = require(path.join(SRC, 'services/analyticsService.ts'));
const preferencias = require(path.join(SRC, 'services/preferenciasService.ts'));
const moneda = require(path.join(SRC, 'utils/moneda.ts'));
const formOrden = require(path.join(SRC, 'utils/ordenForm.ts'));
const exportador = require(path.join(SRC, 'utils/ordenExport.ts'));
const procedimientos = require(path.join(SRC, 'services/procedimientosService.ts'));

// ------------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------------
async function reiniciarBase() {
  await dbMod.cerrarDatabase();
  for (const f of fs.readdirSync(TMP)) if (f.startsWith('gbottel.db')) fs.rmSync(path.join(TMP, f));
  return dbMod.initDatabase();
}

async function tecnico(nombre, estadoT = 'activo') {
  return tecnicosSvc.crearTecnico({ nombre, cargo: 'Técnico', ci: '1', estado: estadoT, salarioBasico: 0, aportesONAT: 0, planMensualCUP: 0 });
}

function payload(extra = {}) {
  return {
    datos: { clienteNombre: 'Cliente X', fechaReporte: '2026-10-01', estado: 'pendiente' },
    materiales: [{ descripcion: 'm', cantidad: 2, importeCUP: 10, importeUSD: 0 }],
    servicios: [{ servicioId: null, codigo: 'S1', descripcion: 's', cantidad: 3, importeCUP: 100, importeUSD: 0 }],
    tecnicos: [{ tecnicoId: null, nombre: 'Firmante', cargo: 'c', ci: '2', firmado: 1 }],
    ...extra,
  };
}

async function q(sql, ...p) { return (await dbMod.getDatabase()).getAllAsync(sql, ...p); }
async function q1(sql, ...p) { return (await dbMod.getDatabase()).getFirstAsync(sql, ...p); }
async function rechaza(promesa, codigoOMensaje) {
  try { await promesa; } catch (e) {
    const ok = e && (e.codigo === codigoOMensaje || String(e.message).includes(codigoOMensaje));
    assert.ok(ok, `Se esperaba "${codigoOMensaje}" y llegó: ${e && (e.codigo || e.message)}`);
    return e;
  }
  assert.fail(`Se esperaba el error "${codigoOMensaje}" pero no falló`);
}

const pruebas = [];
const prueba = (nombre, fn) => pruebas.push({ nombre, fn });

// ------------------------------------------------------------------
// Pruebas
// ------------------------------------------------------------------
prueba('T01 base nueva: v7, sin rangos → no se puede crear orden y no queda nada a medias', async () => {
  await reiniciarBase();
  assert.equal((await q1(`SELECT valor FROM configuracion WHERE clave='schemaVersion'`)).valor, '7');
  const a = await tecnico('Ana');
  await rechaza(ordenes.guardarOrdenCompleta(null, payload()), 'SIN_PRINCIPAL');
  await rechaza(ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a })), 'SIN_FOLIOS');
  assert.equal((await q1('SELECT COUNT(*) n FROM ordenes')).n, 0);
  assert.equal((await q1('SELECT COUNT(*) n FROM orden_servicios')).n, 0);
  assert.equal((await q1('SELECT COUNT(*) n FROM folios_emitidos')).n, 0);
});

prueba('T02 folios salen del rango del principal (no del id) y quedan en el libro', async () => {
  await reiniciarBase();
  const a = await tecnico('Ana'); const b = await tecnico('Beto');
  await folios.asignarRango(a, 100, 102);
  await folios.asignarRango(b, 500, 501);
  const o1 = await ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a }));
  const o2 = await ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: b }));
  const o3 = await ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a }));
  const f = async (id) => (await q1('SELECT numeroOrden, tecnicoPrincipalId FROM ordenes WHERE id=?', id));
  assert.deepEqual(await f(o1), { numeroOrden: '000100', tecnicoPrincipalId: a });
  assert.deepEqual(await f(o2), { numeroOrden: '000500', tecnicoPrincipalId: b });
  assert.deepEqual(await f(o3), { numeroOrden: '000101', tecnicoPrincipalId: a });
  assert.deepEqual((await q('SELECT numero FROM folios_emitidos ORDER BY numero')).map((r) => r.numero), ['000100', '000101', '000500']);
  // principal ≠ firmantes: el firmante no es el principal y no cambia nada
  const hijos = await q('SELECT nombre FROM orden_tecnicos WHERE ordenId=?', o1);
  assert.deepEqual(hijos.map((h) => h.nombre), ['Firmante']);
});

prueba('T03 rangos: validaciones, sin solapes (servicio y trigger) y sin pisar folios emitidos', async () => {
  await reiniciarBase();
  const a = await tecnico('Ana');
  await folios.asignarRango(a, 10, 20);
  await rechaza(folios.asignarRango(a, 20, 30), 'RANGO_SOLAPADO');
  await rechaza(folios.asignarRango(a, 1, 10), 'RANGO_SOLAPADO');
  await rechaza(folios.asignarRango(a, 12, 14), 'RANGO_SOLAPADO');
  await rechaza(folios.asignarRango(a, 5, 40), 'RANGO_SOLAPADO');
  await rechaza(folios.asignarRango(a, 0, 5), 'RANGO_INVALIDO');
  await rechaza(folios.asignarRango(a, 9, 3), 'RANGO_INVALIDO');
  await rechaza(folios.asignarRango(a, 1.5, 3), 'RANGO_INVALIDO');
  await rechaza(folios.asignarRango(a, 1, 1000000), 'RANGO_INVALIDO');
  const db = await dbMod.getDatabase();
  await rechaza(db.runAsync(`INSERT INTO folio_rangos (tecnicoId,desde,hasta,siguiente) VALUES (?,15,25,15)`, a), 'RANGO_SOLAPADO');
  await rechaza(db.runAsync(`INSERT INTO folio_rangos (tecnicoId,desde,hasta,siguiente) VALUES (?,30,40,99)`, a), 'CHECK');
  await db.runAsync(`INSERT INTO folios_emitidos (numero) VALUES ('000055')`);
  await rechaza(folios.asignarRango(a, 50, 60), 'FOLIO_EMITIDO');
  await folios.asignarRango(a, 21, 30); // contiguo sí
  const inactivo = await tecnico('Inactivo', 'inactivo');
  await rechaza(folios.asignarRango(inactivo, 70, 80), 'PRINCIPAL_INVALIDO');
});

prueba('T04 agotamiento: bloquea sin crear nada; aviso con umbral; nuevo rango reanuda', async () => {
  await reiniciarBase();
  const a = await tecnico('Ana');
  await folios.asignarRango(a, 1, 2);
  await ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a }));
  assert.deepEqual((await folios.avisosDeFolios()).map((x) => [x.nombre, x.restantes]), [['Ana', 1]]); // umbral por defecto 10
  await folios.guardarUmbralAviso(0);
  assert.equal((await folios.avisosDeFolios()).length, 0);
  await ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a }));
  assert.deepEqual((await folios.avisosDeFolios()).map((x) => x.restantes), [0]);
  await rechaza(ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a })), 'SIN_FOLIOS');
  assert.equal((await q1('SELECT COUNT(*) n FROM ordenes')).n, 2);
  await folios.asignarRango(a, 3, 3);
  const o = await ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a }));
  assert.equal((await q1('SELECT numeroOrden FROM ordenes WHERE id=?', o)).numeroOrden, '000003');
});

prueba('T05 si el guardado falla, el folio NO se consume (rollback de reserva + orden + hijos)', async () => {
  await reiniciarBase();
  const a = await tecnico('Ana');
  await folios.asignarRango(a, 1, 5);
  await rechaza(ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a, datos: { estado: 'no_existe' } })), 'CHECK');
  assert.equal((await q1('SELECT siguiente FROM folio_rangos')).siguiente, 1);
  assert.equal((await q1('SELECT COUNT(*) n FROM folios_emitidos')).n, 0);
  assert.equal((await q1('SELECT COUNT(*) n FROM ordenes')).n, 0);
  // fallo en los hijos (después de reservar e insertar la orden)
  const dbx = await dbMod.getDatabase();
  await dbx.execAsync(`CREATE TRIGGER t_fallo_hijos BEFORE INSERT ON orden_servicios BEGIN SELECT RAISE(ABORT, 'FALLO_HIJOS'); END`);
  await rechaza(ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a })), 'FALLO_HIJOS');
  await dbx.execAsync(`DROP TRIGGER t_fallo_hijos`);
  // datos inválidos: se rechazan antes de reservar nada
  await rechaza(ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a, servicios: [{ servicioId: null, codigo: 'x', descripcion: 'x', cantidad: 0, importeCUP: 1, importeUSD: 0 }] })), 'mayor que cero');
  assert.equal((await q1('SELECT siguiente FROM folio_rangos')).siguiente, 1);
  assert.equal((await q1('SELECT COUNT(*) n FROM ordenes')).n, 0);
  const o = await ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a }));
  assert.equal((await q1('SELECT numeroOrden FROM ordenes WHERE id=?', o)).numeroOrden, '000001');
});

prueba('T06 doble guardado: misma clave → una sola orden y un solo folio; sin clave → dos folios distintos y sin "database is locked"', async () => {
  await reiniciarBase();
  const a = await tecnico('Ana');
  await folios.asignarRango(a, 1, 10);
  const [x, y] = await Promise.all([
    ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a, claveGuardado: 'k1' })),
    ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a, claveGuardado: 'k1' })),
  ]);
  assert.equal(x, y);
  assert.equal((await q1('SELECT COUNT(*) n FROM ordenes')).n, 1);
  assert.equal((await q1('SELECT siguiente FROM folio_rangos')).siguiente, 2);
  const [u, v, w] = await Promise.all([1, 2, 3].map(() => ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a }))));
  assert.equal(new Set([u, v, w]).size, 3);
  assert.deepEqual((await q('SELECT numeroOrden FROM ordenes ORDER BY id')).map((r) => r.numeroOrden), ['000001', '000002', '000003', '000004']);
  const db = await dbMod.getDatabase();
  await rechaza(db.runAsync(`UPDATE ordenes SET claveGuardado='k1' WHERE id=?`, u), 'UNIQUE');
});

prueba('T07 folio permanente: editar no lo cambia; UPDATE directo se bloquea; eliminar la orden no libera el folio', async () => {
  await reiniciarBase();
  const a = await tecnico('Ana'); const b = await tecnico('Beto');
  await folios.asignarRango(a, 1, 5);
  const id = await ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a }));
  await ordenes.guardarOrdenCompleta(id, payload({ tecnicoPrincipalId: b, datos: { clienteNombre: 'Otro', numeroOrden: '999999' } }));
  const o = await q1('SELECT numeroOrden, tecnicoPrincipalId, clienteNombre FROM ordenes WHERE id=?', id);
  assert.deepEqual(o, { numeroOrden: '000001', tecnicoPrincipalId: a, clienteNombre: 'Otro' });
  const db = await dbMod.getDatabase();
  await rechaza(db.runAsync(`UPDATE ordenes SET numeroOrden='000009' WHERE id=?`, id), 'FOLIO_INMUTABLE');
  await ordenes.eliminarOrden(id);
  const o2 = await ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a }));
  assert.equal((await q1('SELECT numeroOrden FROM ordenes WHERE id=?', o2)).numeroOrden, '000002'); // el 000001 no se reutiliza
  await rechaza(db.runAsync(`DELETE FROM folios_emitidos WHERE numero='000001'`), 'LIBRO_FOLIOS_INMUTABLE');
  await rechaza(db.runAsync(`UPDATE folios_emitidos SET numero='7' WHERE numero='000001'`), 'LIBRO_FOLIOS_INMUTABLE');
  await rechaza(db.runAsync(`UPDATE folio_rangos SET siguiente=1`), 'RANGO_RETROCEDE');
});

prueba('T08 principal inválido (inactivo / inexistente) y quitar bloques', async () => {
  await reiniciarBase();
  const a = await tecnico('Ana');
  await folios.asignarRango(a, 1, 5);
  await tecnicosSvc.eliminarTecnico(a); // baja lógica
  await rechaza(ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a })), 'PRINCIPAL_INVALIDO');
  await rechaza(ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: 9999 })), 'PRINCIPAL_INVALIDO');
  await tecnicosSvc.reactivarTecnico(a);
  await ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a }));
  const [r] = await folios.listarRangos();
  await rechaza(folios.eliminarRangoSinUsar(r.id), 'RANGO_USADO');
  await folios.asignarRango(a, 10, 12);
  const r2 = (await folios.listarRangos()).find((x) => x.desde === 10);
  await folios.eliminarRangoSinUsar(r2.id);
  assert.equal((await folios.listarRangos()).length, 1);
});

prueba('T09 migración desde una base v5 real: folios intactos, libro e histórico creados, sin solapes futuros; reintento idempotente', async () => {
  await dbMod.cerrarDatabase();
  for (const f of fs.readdirSync(TMP)) if (f.startsWith('gbottel.db')) fs.rmSync(path.join(TMP, f));
  // Esquema v5 real, sacado de git (commit 8da4e7f)
  const { execFileSync } = require('child_process');
  let v5;
  try { v5 = execFileSync('git', ['show', '8da4e7f:src/database/schema.ts'], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }); }
  catch { console.log('   (omitida: no hay historia git con 8da4e7f)'); return; }
  const archivoV5 = path.join(TMP, 'schema-v5.ts');
  fs.writeFileSync(archivoV5, v5);
  const s5 = require(archivoV5);
  const raw = new DatabaseSync(path.join(TMP, 'gbottel.db'));
  raw.exec(s5.SCHEMA_SQL_CORE);
  for (const sent of s5.MIGRACIONES_COLUMNAS) { try { raw.exec(sent); } catch {} }
  raw.exec(`INSERT INTO configuracion (clave, valor) VALUES ('schemaVersion','5')`);
  for (const f of ['000001', '000002', '000007']) raw.prepare(`INSERT INTO ordenes (numeroOrden, clienteNombre) VALUES (?, 'viejo')`).run(f);
  raw.close();

  await dbMod.initDatabase();
  assert.deepEqual((await q('SELECT numeroOrden FROM ordenes ORDER BY id')).map((r) => r.numeroOrden), ['000001', '000002', '000007']);
  assert.deepEqual((await q('SELECT numero, origen FROM folios_emitidos ORDER BY numero')).map((r) => r.numero), ['000001', '000002', '000007']);
  const h = await q('SELECT historico, desde, hasta, siguiente, tecnicoId FROM folio_rangos');
  assert.deepEqual(h, [{ historico: 1, desde: 1, hasta: 7, siguiente: 8, tecnicoId: null }]);
  assert.equal((await q1(`SELECT valor FROM configuracion WHERE clave='schemaVersion'`)).valor, '7');
  const a = await tecnico('Ana');
  await rechaza(folios.asignarRango(a, 5, 10), 'RANGO_SOLAPADO');
  await folios.asignarRango(a, 8, 10);
  const o = await ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a }));
  assert.equal((await q1('SELECT numeroOrden FROM ordenes WHERE id=?', o)).numeroOrden, '000008');
  // las órdenes viejas siguen sin principal (decisión documentada) y editables sin tocar el folio
  assert.equal((await q1(`SELECT tecnicoPrincipalId FROM ordenes WHERE numeroOrden='000002'`)).tecnicoPrincipalId, null);
  // reintento: forzar schemaVersion=5 y reiniciar → no duplica ni falla
  await (await dbMod.getDatabase()).runAsync(`UPDATE configuracion SET valor='5' WHERE clave='schemaVersion'`);
  await dbMod.cerrarDatabase();
  await dbMod.initDatabase();
  assert.equal((await q1('SELECT COUNT(*) n FROM folio_rangos')).n, 2);
  assert.equal((await q1('SELECT COUNT(*) n FROM folios_emitidos')).n, 4);
});

async function escenarioRespaldo() {
  // Dispositivo A: Ana con bloque 1-10, 3 órdenes; exporta respaldo v3
  await reiniciarBase();
  const a = await tecnico('Ana');
  await folios.asignarRango(a, 1, 10);
  for (let i = 0; i < 3; i++) await ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a, datos: { clienteNombre: 'C' + i, fechaReporte: '2026-10-0' + (i + 1) } }));
  estado.compartidos = {};
  await respaldo.exportarRespaldoCompleto();
  return Object.values(estado.compartidos)[0];
}

prueba('T10 respaldo v4: ida y vuelta conserva folios; fusiona bloques con el mayor siguiente; el libro local no se pierde', async () => {
  const contenido = await escenarioRespaldo();
  const j = JSON.parse(contenido);
  assert.equal(j.version, 4);
  assert.ok(Array.isArray(j.tablas.folio_rangos) && Array.isArray(j.tablas.folios_emitidos));
  // Después del respaldo, este dispositivo emite 2 folios más y un bloque nuevo
  const a = (await q1(`SELECT id FROM tecnicos WHERE nombre='Ana'`)).id;
  await ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a }));
  await ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a }));
  await folios.asignarRango(a, 50, 60);
  const antes = (await q('SELECT numeroOrden FROM ordenes ORDER BY id')).map((r) => r.numeroOrden);
  assert.deepEqual(antes, ['000001', '000002', '000003', '000004', '000005']);

  const prep = await respaldo.prepararRespaldoDesdeTexto(contenido);
  assert.equal(prep.resumen.ordenesEnArchivo, 3);
  assert.equal(prep.resumen.ordenesLocalesQueSeReemplazan, 5);
  assert.equal(prep.resumen.rangosCoincidentes, 1);
  assert.equal(prep.resumen.rangosSoloLocales, 1);
  // la previsualización no modificó nada
  assert.equal((await q1('SELECT COUNT(*) n FROM ordenes')).n, 5);
  await respaldo.aplicarRespaldo(prep);

  assert.deepEqual((await q('SELECT numeroOrden FROM ordenes ORDER BY id')).map((r) => r.numeroOrden), ['000001', '000002', '000003']);
  // 000004 y 000005 ya no tienen orden, pero siguen emitidos y NO se reutilizan
  assert.deepEqual((await q('SELECT numero FROM folios_emitidos ORDER BY numero')).map((r) => r.numero), ['000001', '000002', '000003', '000004', '000005']);
  const rangos = await q('SELECT desde, hasta, siguiente, tecnicoId FROM folio_rangos ORDER BY desde');
  assert.deepEqual(rangos.map((r) => [r.desde, r.hasta, r.siguiente]), [[1, 10, 6], [50, 60, 50]]);
  const ana = (await q1(`SELECT id FROM tecnicos WHERE nombre='Ana'`)).id;
  assert.ok(rangos.every((r) => r.tecnicoId === ana), 'los bloques quedan reconectados con Ana');
  const o = await ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: ana }));
  assert.equal((await q1('SELECT numeroOrden FROM ordenes WHERE id=?', o)).numeroOrden, '000006');
});

prueba('T11 respaldo VIEJO (v2, sin folios) en un dispositivo limpio: no renumera y no deja reutilizar folios', async () => {
  const contenido = await escenarioRespaldo();
  const j = JSON.parse(contenido);
  j.version = 2; delete j.tablas.folio_rangos; delete j.tablas.folios_emitidos;
  for (const o of j.tablas.ordenes) { delete o.tecnicoPrincipalId; delete o.claveGuardado; }
  await reiniciarBase(); // dispositivo limpio
  const prep = await respaldo.prepararRespaldoDesdeTexto(JSON.stringify(j));
  await respaldo.aplicarRespaldo(prep);
  assert.deepEqual((await q('SELECT numeroOrden FROM ordenes ORDER BY id')).map((r) => r.numeroOrden), ['000001', '000002', '000003']);
  assert.equal((await q1('SELECT COUNT(*) n FROM folios_emitidos')).n, 3);
  const a = (await q1(`SELECT id FROM tecnicos WHERE nombre='Ana'`)).id;
  await rechaza(folios.asignarRango(a, 1, 5), 'FOLIO_EMITIDO');
  await rechaza(ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a })), 'SIN_FOLIOS');
  await folios.asignarRango(a, 4, 9);
  const o = await ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a }));
  assert.equal((await q1('SELECT numeroOrden FROM ordenes WHERE id=?', o)).numeroOrden, '000004');
});

prueba('T12 respaldo inválido o conflictivo se rechaza ANTES de borrar nada', async () => {
  const contenido = await escenarioRespaldo();
  const base = JSON.parse(contenido);
  const clon = () => JSON.parse(JSON.stringify(base));
  const casos = [
    ['no es JSON', '{{{'],
    ['versión', JSON.stringify({ ...clon(), version: 9 })],
    ['falta tabla', (() => { const j = clon(); delete j.tablas.ordenes; return JSON.stringify(j); })()],
    ['folio repetido', (() => { const j = clon(); j.tablas.ordenes[1].numeroOrden = j.tablas.ordenes[0].numeroOrden; return JSON.stringify(j); })()],
    ['orden sin folio', (() => { const j = clon(); j.tablas.ordenes[0].numeroOrden = ''; return JSON.stringify(j); })()],
    ['hijo huérfano', (() => { const j = clon(); j.tablas.orden_servicios[0].ordenId = 999; return JSON.stringify(j); })()],
    ['siguiente fuera', (() => { const j = clon(); j.tablas.folio_rangos[0].siguiente = 99; return JSON.stringify(j); })()],
    ['bloques solapados', (() => { const j = clon(); j.tablas.folio_rangos.push({ ...j.tablas.folio_rangos[0], desde: 5, hasta: 12, siguiente: 5 }); return JSON.stringify(j); })()],
    ['principal inexistente', (() => { const j = clon(); j.tablas.ordenes[0].tecnicoPrincipalId = 4242; return JSON.stringify(j); })()],
  ];
  const a = (await q1(`SELECT id FROM tecnicos WHERE nombre='Ana'`)).id;
  const foto = JSON.stringify(await q('SELECT numeroOrden FROM ordenes ORDER BY id'));
  for (const [nombre, texto] of casos) {
    let falló = false;
    try { await respaldo.prepararRespaldoDesdeTexto(texto); } catch { falló = true; }
    assert.ok(falló, `debía rechazar: ${nombre}`);
  }
  assert.equal(JSON.stringify(await q('SELECT numeroOrden FROM ordenes ORDER BY id')), foto);
  // conflicto con un bloque local de límites distintos
  const db = await dbMod.getDatabase();
  await db.runAsync(`DELETE FROM folio_rangos`);
  await folios.asignarRango(a, 5, 20);
  await rechaza(respaldo.prepararRespaldoDesdeTexto(contenido), 'RANGO_SOLAPADO');
  // y un fallo a mitad de la aplicación revierte todo
  const j = clon(); await db.runAsync(`DELETE FROM folio_rangos`);
  await db.runAsync(`INSERT INTO folio_rangos (tecnicoId,tecnicoNombre,desde,hasta,siguiente) VALUES (?, 'Ana', 1, 10, 4)`, a);
  const prep = await respaldo.prepararRespaldoDesdeTexto(JSON.stringify(j));
  prep.validado.tablas.orden_servicios.push({ ordenId: j.tablas.ordenes[0].id, codigo: 'x', descripcion: 'x', cantidad: null }); // NOT NULL → falla tarde
  await rechaza(respaldo.aplicarRespaldo(prep), 'NOT NULL');
  assert.equal(JSON.stringify(await q('SELECT numeroOrden FROM ordenes ORDER BY id')), foto);
  assert.equal((await q1('SELECT COUNT(*) n FROM tecnicos')).n, 1);
});

async function exportarTraspaso() {
  // Dispositivo de Beto: bloque 200-210, 2 órdenes; exporta traspaso v2
  await reiniciarBase();
  const b = await tecnico('Beto');
  await folios.asignarRango(b, 200, 210);
  await ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: b, datos: { clienteNombre: 'Cli1', fechaReporte: '2026-10-02', estado: 'finalizada' } }));
  await ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: b, datos: { clienteNombre: 'Cli2', fechaReporte: '2026-10-01' } }));
  estado.compartidos = {};
  const resumen = await q('SELECT id FROM ordenes ORDER BY id');
  await respaldo.exportarOrdenesJSON(resumen);
  return Object.values(estado.compartidos)[0];
}

prueba('T13 traspaso v2: el folio viaja, no se renumera nada, previsualiza y conflictos se omiten y listan', async () => {
  const archivo = await exportarTraspaso();
  const j = JSON.parse(archivo);
  assert.equal(j.version, 2);
  assert.deepEqual(j.ordenes.map((o) => o.folio), ['000200', '000201']);
  assert.ok(j.ordenes.every((o) => o.principalNombre === 'Beto'));
  assert.ok(j.ordenes.every((o) => !('claveGuardado' in o) && !('tecnicoPrincipalId' in o)));

  // Dispositivo de Ana (jefa): bloque 1-10, con 2 órdenes propias
  await reiniciarBase();
  const a = await tecnico('Ana'); await tecnico('Beto');
  await folios.asignarRango(a, 1, 10);
  await ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a }));
  await ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a }));
  const antes = JSON.stringify(await q('SELECT id, numeroOrden FROM ordenes ORDER BY id'));

  const prep = await respaldo.prepararTraspasoDesdeTexto(archivo);
  assert.equal(prep.aImportar.length, 2);
  assert.equal(prep.omitidas.length, 0);
  assert.equal(JSON.stringify(await q('SELECT id, numeroOrden FROM ordenes ORDER BY id')), antes); // preview no toca
  const res = await respaldo.aplicarTraspaso(prep);
  assert.equal(res.importadas, 2);
  assert.deepEqual((await q('SELECT numeroOrden FROM ordenes ORDER BY id')).map((r) => r.numeroOrden), ['000001', '000002', '000201', '000200']);
  const beto = (await q1(`SELECT id FROM tecnicos WHERE nombre='Beto'`)).id;
  assert.equal((await q1(`SELECT tecnicoPrincipalId p FROM ordenes WHERE numeroOrden='000200'`)).p, beto);

  // Reimportar el mismo archivo: nada nuevo, todo omitido y listado, nada renumerado
  const prep2 = await respaldo.prepararTraspasoDesdeTexto(archivo);
  assert.equal(prep2.aImportar.length, 0);
  assert.equal(prep2.omitidas.length, 2);
  const res2 = await respaldo.aplicarTraspaso(prep2);
  assert.equal(res2.importadas, 0);
  assert.equal((await q1('SELECT COUNT(*) n FROM ordenes')).n, 4);
  assert.deepEqual((await q('SELECT numero FROM folios_emitidos ORDER BY numero')).map((r) => r.numero), ['000001', '000002', '000200', '000201']);

  // El folio de una orden eliminada no vuelve a entrar
  const id201 = (await q1(`SELECT id FROM ordenes WHERE numeroOrden='000201'`)).id;
  await ordenes.eliminarOrden(id201);
  const prep3 = await respaldo.prepararTraspasoDesdeTexto(archivo);
  assert.ok(prep3.omitidas.some((o) => o.folio === '000201' && /no se reutiliza/.test(o.motivo)));
});

prueba('T14 traspaso: choque con bloque ajeno / histórico, archivo viejo sin folio y archivo corrupto', async () => {
  const archivo = await exportarTraspaso();
  await reiniciarBase();
  const a = await tecnico('Ana'); await tecnico('Beto');
  await folios.asignarRango(a, 195, 205); // bloque de Ana contiene folios que Beto emitió
  const prep = await respaldo.prepararTraspasoDesdeTexto(archivo);
  assert.equal(prep.aImportar.length, 0);
  assert.equal(prep.omitidas.length, 2);
  assert.ok(prep.omitidas.every((o) => /no pertenece a Beto/.test(o.motivo)));
  assert.equal((await respaldo.aplicarTraspaso(prep)).importadas, 0);
  assert.equal((await q1('SELECT COUNT(*) n FROM ordenes')).n, 0);

  const viejo = JSON.parse(archivo); viejo.version = 1;
  for (const o of viejo.ordenes) delete o.folio;
  const p2 = await respaldo.prepararTraspasoDesdeTexto(JSON.stringify(viejo));
  assert.equal(p2.aImportar.length, 0);
  assert.ok(p2.omitidas.every((o) => /sin folio permanente/.test(o.motivo)));

  await rechaza(respaldo.prepararTraspasoDesdeTexto('nope'), 'TRASPASO_INVALIDO');
  await rechaza(respaldo.prepararTraspasoDesdeTexto('{"ordenes":3}'), 'TRASPASO_INVALIDO');

  // atomicidad: una orden con datos que rompen a mitad → no entra ninguna
  const malo = JSON.parse(archivo);
  malo.ordenes[1].clienteNombre = 'FALLA';
  await reiniciarBase(); await tecnico('Beto');
  await (await dbMod.getDatabase()).execAsync(`CREATE TRIGGER t_falla BEFORE INSERT ON ordenes WHEN NEW.clienteNombre = 'FALLA' BEGIN SELECT RAISE(ABORT, 'FALLA_A_MITAD'); END`);
  const p3 = await respaldo.prepararTraspasoDesdeTexto(JSON.stringify(malo));
  await rechaza(respaldo.aplicarTraspaso(p3), 'FALLA_A_MITAD');
  assert.equal((await q1('SELECT COUNT(*) n FROM ordenes')).n, 0);
  assert.equal((await q1('SELECT COUNT(*) n FROM folios_emitidos')).n, 0);
});

prueba('T15 restablecer de fábrica conserva libro y bloques; vincular bloque huérfano reanuda emisión', async () => {
  await reiniciarBase();
  const a = await tecnico('Ana');
  await folios.asignarRango(a, 1, 5);
  await ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a }));
  await respaldo.resetearBaseDeDatos();
  assert.equal((await q1('SELECT COUNT(*) n FROM ordenes')).n, 0);
  assert.equal((await q1('SELECT COUNT(*) n FROM folios_emitidos')).n, 1);
  const [r] = await folios.listarRangos();
  assert.equal(r.tecnicoId, null);
  assert.equal(r.tecnicoNombre, 'Ana');
  const a2 = await tecnico('Ana');
  await folios.vincularRango(r.id, a2);
  const o = await ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a2 }));
  assert.equal((await q1('SELECT numeroOrden FROM ordenes WHERE id=?', o)).numeroOrden, '000002');
});

prueba('T19 equipos de la orden viajan en respaldo v4 y traspaso; respaldo v3 del PC (sin folios) se acepta', async () => {
  await reiniciarBase();
  const a = await tecnico('Ana');
  await folios.asignarRango(a, 1, 10);
  const eq = [{ marca: 'M1', modelo: 'X', nroSerie: 'S1' }, { marca: 'M2', modelo: 'Y', nroSerie: 'S2' }];
  const id = await ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a, equipos: eq, datos: { clienteNombre: 'C', fechaReporte: '2026-10-01', estado: 'pendiente', modalidadMultiple: 1 } }));
  assert.equal((await q('SELECT * FROM orden_equipos WHERE ordenId=?', id)).length, 2);
  await respaldo.exportarRespaldoCompleto();
  const j = JSON.parse(Object.values(estado.compartidos).pop());
  assert.equal(j.version, 4);
  assert.equal(j.tablas.orden_equipos.length, 2);
  // ida y vuelta
  const prep = await respaldo.prepararRespaldoDesdeTexto(JSON.stringify(j));
  await respaldo.aplicarRespaldo(prep);
  assert.equal((await q('SELECT * FROM orden_equipos')).length, 2);
  // respaldo v3 del PC: sin folios ni principal; los equipos se restauran y los folios pasan al libro
  const v3 = JSON.parse(JSON.stringify(j));
  v3.version = 3; delete v3.tablas.folio_rangos; delete v3.tablas.folios_emitidos;
  for (const o of v3.tablas.ordenes) { delete o.tecnicoPrincipalId; delete o.claveGuardado; }
  await reiniciarBase();
  await respaldo.aplicarRespaldo(await respaldo.prepararRespaldoDesdeTexto(JSON.stringify(v3)));
  assert.equal((await q('SELECT * FROM orden_equipos')).length, 2);
  assert.equal((await q1('SELECT COUNT(*) n FROM folios_emitidos')).n, 1);
  // v1 muy antiguo: sin orden_equipos ni orden_tecnicos
  const v1 = JSON.parse(JSON.stringify(v3));
  v1.version = 1; delete v1.tablas.orden_equipos; delete v1.tablas.orden_tecnicos;
  await reiniciarBase();
  await respaldo.aplicarRespaldo(await respaldo.prepararRespaldoDesdeTexto(JSON.stringify(v1)));
  assert.equal((await q('SELECT * FROM orden_equipos')).length, 0);
  assert.equal((await q('SELECT * FROM ordenes')).length, 1);
});

prueba('T16 totales: calcularTotales sigue multiplicando precio × cantidad una sola vez (sin cambios de reglas)', async () => {
  await reiniciarBase();
  const a = await tecnico('Ana');
  await folios.asignarRango(a, 1, 5);
  const id = await ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a }));
  const o = await ordenes.obtenerOrden(id);
  const t = ordenes.calcularTotales(o.materiales, o.servicios);
  // payload: material 2 × 10 CUP y servicio 3 × 100 CUP
  assert.equal(t.materialesCUP, 20);
  assert.equal(t.serviciosCUP, 300);
  assert.equal(t.totalCUP, 320);
});

prueba('T17 «En progreso» eliminado: las órdenes viejas pasan a Pendiente (al abrir la base y al restaurar/importar)', async () => {
  await reiniciarBase();
  const a = await tecnico('Ana');
  await folios.asignarRango(a, 1, 9);
  const id = await ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a }));
  const db = await dbMod.getDatabase();
  await db.runAsync(`UPDATE ordenes SET estado='en_progreso' WHERE id=?`, id);
  await dbMod.cerrarDatabase(); await dbMod.initDatabase();
  assert.equal((await q1('SELECT estado FROM ordenes WHERE id=?', id)).estado, 'pendiente');
  assert.equal((await analitica.obtenerResumenDashboard()).enProgreso, undefined);
  // respaldo viejo con en_progreso
  estado.compartidos = {};
  await respaldo.exportarRespaldoCompleto();
  const j = JSON.parse(Object.values(estado.compartidos)[0]);
  j.tablas.ordenes[0].estado = 'en_progreso';
  await respaldo.aplicarRespaldo(await respaldo.prepararRespaldoDesdeTexto(JSON.stringify(j)));
  assert.equal((await q1('SELECT estado FROM ordenes')).estado, 'pendiente');
});

prueba('T18 la fecha de INICIO define el trabajo en filtros y reportes (con respaldo en fecha de reporte)', async () => {
  await reiniciarBase();
  const a = await tecnico('Ana');
  await folios.asignarRango(a, 1, 9);
  await ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a, datos: { clienteNombre: 'ConInicio', fechaReporte: '2026-01-05', fechaInicio: '2026-03-10', estado: 'finalizada' } }));
  await ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a, datos: { clienteNombre: 'SoloReporte', fechaReporte: '2026-03-12', estado: 'finalizada' } }));
  const marzo = await analitica.obtenerOrdenesFiltradas({ desde: '2026-03-01', hasta: '2026-03-31', limite: 50 });
  assert.deepEqual(marzo.map((o) => o.cliente).sort(), ['ConInicio', 'SoloReporte']);
  const enero = await analitica.obtenerOrdenesFiltradas({ desde: '2026-01-01', hasta: '2026-01-31', limite: 50 });
  assert.equal(enero.length, 0);
});


prueba('T20 importes exactos: SQLite = calcularTotales = contador/últimas 10 = texto mostrado; sin redondeo ni «mil»', async () => {
  await reiniciarBase();
  const a = await tecnico('Ana');
  await folios.asignarRango(a, 1, 50);
  const id = await ordenes.guardarOrdenCompleta(null, payload({
    tecnicoPrincipalId: a,
    datos: { clienteNombre: 'Grande', fechaReporte: '2026-10-05', fechaInicio: '2026-10-05', estado: 'finalizada' },
    materiales: [{ descripcion: 'm', cantidad: 2.5, importeCUP: 10.1, importeUSD: 0 }],
    servicios: [{ servicioId: null, codigo: 'S', descripcion: 's', cantidad: 3, importeCUP: 1234567.89, importeUSD: 0.125 }],
  }));
  const o = await ordenes.obtenerOrden(id);
  const t = ordenes.calcularTotales(o.materiales, o.servicios);
  const sql = await q1(`SELECT (SELECT COALESCE(SUM(importeCUP*cantidad),0) FROM orden_servicios WHERE ordenId=?) + (SELECT COALESCE(SUM(importeCUP*cantidad),0) FROM orden_materiales WHERE ordenId=?) AS cup`, id, id);
  const ultimas = await analitica.obtenerUltimasOrdenes(10);
  const lista = await analitica.obtenerOrdenesFiltradas({ limite: 50 });
  const esperado = 1234567.89 * 3 + 10.1 * 2.5; // 3 703 728,92
  for (const valor of [t.totalCUP, sql.cup, ultimas[0].totalCUP, lista[0].totalCUP]) {
    assert.equal(moneda.normalizarImporte(valor), moneda.normalizarImporte(esperado));
  }
  // el mismo texto en todas las pantallas (todas usan formatearImporte)
  const textos = new Set([t.totalCUP, ultimas[0].totalCUP, lista[0].totalCUP].map((v) => moneda.formatearImporte(v, 'CUP')));
  assert.equal(textos.size, 1);
  const texto = [...textos][0];
  assert.ok(!/mil/i.test(texto), texto);
  assert.ok(/3[\s .,]?703[\s .,]?728[.,]92/.test(texto), `texto inesperado: ${texto}`);
  // sin pérdida de decimales ni redondeo a enteros
  assert.ok(/12345\.67/.test(moneda.importeComoTexto(12345.67)));
  assert.equal(moneda.importeComoTexto(0.1 * 3), '0.3');
  assert.ok(/12[\s .,]?345[.,]67/.test(moneda.formatearImporte(12345.67, 'CUP')));
  assert.ok(/0[.,]125/.test(moneda.formatearImporte(0.125, 'USD')));
  assert.ok(/1[.,]00/.test(moneda.formatearImporte(1, 'CUP')));
});

prueba('T21 cantidad en modalidad múltiple: autollenado inicial, edición libre (mayor o menor que equipos) y no se pisa', async () => {
  const f = formOrden;
  assert.equal(f.cantidadInicial(true, 2), '2');
  assert.equal(f.cantidadInicial(false, 2), '1');
  let lineas = [{ cantidad: '2' }, { cantidad: '2' }];
  lineas[0] = { cantidad: '4', cantidadManual: true };   // 4 cargas para 2 equipos
  lineas[1] = { cantidad: '16', cantidadManual: true };  // 16 perforaciones
  const sync = f.sincronizarCantidades([...lineas, { cantidad: '2' }], 3, true);
  assert.deepEqual(sync.map((l) => l.cantidad), ['4', '16', '3']);   // solo la no editada sigue a los equipos
  assert.deepEqual(f.sincronizarCantidades([{ cantidad: '5' }], 3, false).map((l) => l.cantidad), ['5']);
  // importe una sola vez: precio unitario × cantidad final
  const total = ordenes.calcularTotales([], [{ cantidad: 16, importeCUP: 12.5, importeUSD: 0 }]);
  assert.equal(total.serviciosCUP, 200);
});

prueba('T22 tiempo: suma de servicios con duración, ignora los sin duración y respeta la edición manual', async () => {
  const f = formOrden;
  const lineas = [
    { cantidad: '2', tiempoEstimado: 30 },
    { cantidad: '1', tiempoEstimado: null },
    { cantidad: '3', tiempoEstimado: 0 },
    { cantidad: '1,5', tiempoEstimado: 20 },
  ];
  assert.equal(f.calcularTiempoAutomatico(lineas), 90);
  assert.equal(f.calcularTiempoAutomatico([]), 0);
  assert.equal(f.calcularTiempoAutomatico([{ cantidad: '4' }]), 0);
  assert.deepEqual(f.resolverTiempo({ texto: '', manual: false }, 90), { texto: '90', manual: false });
  assert.deepEqual(f.resolverTiempo({ texto: '', manual: false }, 0), { texto: '', manual: false });
  // el técnico escribe 45: el automático (que cambia después) NO lo sobrescribe
  assert.deepEqual(f.resolverTiempo({ texto: '45', manual: true }, 90), { texto: '45', manual: true });
  assert.deepEqual(f.resolverTiempo({ texto: '45', manual: true }, 200), { texto: '45', manual: true });
});

prueba('T23 secciones: preferencia independiente por técnico, entrada inválida ignorada, no toca órdenes', async () => {
  await reiniciarBase();
  const a = await tecnico('Ana'); const b = await tecnico('Beto');
  await folios.asignarRango(a, 1, 5);
  const id = await ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a }));
  const antes = JSON.stringify(await ordenes.obtenerOrden(id));
  await preferencias.guardarSeccionesOcultas(a, ['materiales', 'firmas']);
  await preferencias.guardarSeccionesOcultas(b, ['cliente']);
  assert.deepEqual(await preferencias.obtenerSeccionesOcultas(a), ['materiales', 'firmas']);
  assert.deepEqual(await preferencias.obtenerSeccionesOcultas(b), ['cliente']);
  assert.deepEqual(await preferencias.obtenerSeccionesOcultas(null), []);
  assert.deepEqual(formOrden.parsearSeccionesOcultas('["totales","inventada",3]'), ['totales']);
  assert.deepEqual(formOrden.parsearSeccionesOcultas('no es json'), []);
  assert.equal(JSON.stringify(await ordenes.obtenerOrden(id)), antes); // ocultar no modifica la orden
  // las preferencias viajan en el respaldo (tabla configuracion)
  await respaldo.exportarRespaldoCompleto();
  const j = JSON.parse(Object.values(estado.compartidos).pop());
  assert.ok(j.tablas.configuracion.some((c) => c.clave === `seccionesOcultas:${a}`));
});

prueba('T24 folio editable: propuesto, manual dentro del bloque, continuar o conservar secuencia, rechazos', async () => {
  await reiniciarBase();
  const a = await tecnico('Ana'); const b = await tecnico('Beto');
  await folios.asignarRango(a, 1, 10);
  await folios.asignarRango(b, 11, 20);
  assert.equal(await folios.proximoFolioDisponible(a), 1);
  const g = (extra) => ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a, ...extra }));
  // fuera del bloque de Ana (es de Beto) y fuera de todo rango
  await rechaza(g({ folioManual: 12 }), 'RANGO_INVALIDO');
  await rechaza(g({ folioManual: 99 }), 'RANGO_INVALIDO');
  await rechaza(g({ folioManual: 0 }), 'RANGO_INVALIDO');
  assert.equal((await q1('SELECT COUNT(*) n FROM ordenes')).n, 0);
  assert.equal((await q1('SELECT COUNT(*) n FROM folios_emitidos')).n, 0);
  // igual al propuesto = emisión normal
  const o1 = await g({ folioManual: 1 });
  assert.equal((await q1('SELECT numeroOrden FROM ordenes WHERE id=?', o1)).numeroOrden, '000001');
  assert.equal((await q1('SELECT siguiente FROM folio_rangos WHERE tecnicoId=?', a)).siguiente, 2);
  // 5 CONTINUANDO: el siguiente pasa a 6
  const o2 = await g({ folioManual: 5, continuarSecuencia: true });
  assert.equal((await q1('SELECT numeroOrden FROM ordenes WHERE id=?', o2)).numeroOrden, '000005');
  assert.equal((await q1('SELECT siguiente FROM folio_rangos WHERE tecnicoId=?', a)).siguiente, 6);
  assert.equal(await folios.proximoFolioDisponible(a), 6);
  // 8 SIN continuar: se usa el 8 pero la secuencia sigue en 6
  const o3 = await g({ folioManual: 8, continuarSecuencia: false });
  assert.equal((await q1('SELECT numeroOrden FROM ordenes WHERE id=?', o3)).numeroOrden, '000008');
  assert.equal((await q1('SELECT siguiente FROM folio_rangos WHERE tecnicoId=?', a)).siguiente, 6);
  // duplicado (ya emitido) y reutilización tras borrar la orden
  await rechaza(g({ folioManual: 8 }), 'FOLIO_EMITIDO');
  await (await dbMod.getDatabase()).runAsync('DELETE FROM ordenes WHERE id=?', o3);
  await rechaza(g({ folioManual: 8 }), 'FOLIO_EMITIDO');
  // la secuencia automática salta los ya emitidos: 6, 7, (8 emitido) 9
  const seq = [];
  for (let i = 0; i < 3; i++) seq.push((await q1('SELECT numeroOrden FROM ordenes WHERE id=?', await g({}))).numeroOrden);
  assert.deepEqual(seq, ['000006', '000007', '000009']);
  // sin guardado parcial en los rechazos y libro coherente
  assert.equal((await q1('SELECT COUNT(*) n FROM folios_emitidos')).n, 6);
});


async function crearDosOrdenesParaExportar() {
  await reiniciarBase();
  const a = await tecnico('Ana');
  await folios.asignarRango(a, 1, 20);
  const eq = [{ marca: 'M1', modelo: 'X', nroSerie: 'S1' }, { marca: 'M2', modelo: 'Y', nroSerie: 'S2' }];
  const id1 = await ordenes.guardarOrdenCompleta(null, payload({
    tecnicoPrincipalId: a, equipos: eq,
    datos: { clienteNombre: 'Cliente <Uno> & Cía', clienteTipo: 'Institucional', fechaReporte: '2026-10-05', fechaInicio: '2026-10-05', estado: 'finalizada', modalidadMultiple: 1, observaciones: 'Línea 1\nLínea 2 =SUM(A1)' },
    materiales: [{ descripcion: 'Cable', cantidad: 2.5, importeCUP: 10.1, importeUSD: 0.333 }],
    servicios: [{ servicioId: null, codigo: 'S1', descripcion: 'Perforaciones', cantidad: 16, importeCUP: 12345.67, importeUSD: 0 }],
  }));
  const id2 = await ordenes.guardarOrdenCompleta(null, payload({
    tecnicoPrincipalId: a,
    datos: { clienteNombre: 'Cliente Dos', fechaReporte: '2026-10-06', estado: 'pendiente' },
    servicios: [{ servicioId: null, codigo: 'S2', descripcion: 'Otro', cantidad: 3, importeCUP: 1234567.89, importeUSD: 0.125 }],
  }));
  return [id1, id2];
}

prueba('T25 XLSX real: ZIP válido (CRC), una hoja por orden, importes numéricos idénticos a SQLite; lo abre openpyxl', async () => {
  const ids = await crearDosOrdenesParaExportar();
  const lista = await analitica.obtenerOrdenesFiltradas({ limite: 50 });
  await respaldo.exportarOrdenesXLSX(lista);
  const bytes = Object.entries(estado.compartidos).filter(([n]) => n.endsWith('.xlsx')).pop()[1];
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(bytes[0], 0x50); assert.equal(bytes[1], 0x4b); // «PK»
  // verificación independiente de CRC con zlib
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const zlib = require('zlib');
  let pos = 0, n = 0;
  while (dv.getUint32(pos, true) === 0x04034b50) {
    const crc = dv.getUint32(pos + 14, true), tam = dv.getUint32(pos + 18, true), nl = dv.getUint16(pos + 26, true);
    const datos = bytes.subarray(pos + 30 + nl, pos + 30 + nl + tam);
    assert.equal(zlib.crc32(datos) >>> 0, crc);
    pos += 30 + nl + tam; n++;
  }
  assert.ok(n >= 7);
  // lectura con un lector XLSX real
  const tmp = path.join(TMP, 'salida.xlsx');
  fs.writeFileSync(tmp, bytes);
  const py = require('child_process').spawnSync('python3', ['-I', '-c', `
import sys, json, openpyxl
wb = openpyxl.load_workbook(sys.argv[1])
out = {}
for ws in wb.worksheets:
    d = {'merges': len(ws.merged_cells.ranges)}
    for row in ws.iter_rows(values_only=True):
        vals = [v for v in row if v is not None]
        if not vals: continue
        if 'Folio de la Orden' in vals:
            i = vals.index('Folio de la Orden'); d['Folio'] = vals[i + 1] if len(vals) > i + 1 else None
        if isinstance(vals[0], str) and vals[0].startswith('Totales Generales a Pagar'): d['Total a pagar CUP'], d['Total a pagar USD'] = vals[1], vals[2]
        if isinstance(vals[0], str) and vals[0].startswith('ORDEN DE SERVICIO'): d['titulo'] = True
        if isinstance(vals[0], str) and vals[0].startswith('Listado de los Materiales'): d['materiales'] = True
        if isinstance(vals[0], str) and vals[0].startswith('Listado de los Servicios'): d['servicios'] = True
        if vals[0] == 'Conformidad del Trabajo': d['conformidad'] = True
    out[ws.title] = d
print(json.dumps(out))`, tmp], { encoding: 'utf-8' });
  assert.equal(py.status, 0, py.stderr);
  const hojas = JSON.parse(py.stdout);
  assert.equal(Object.keys(hojas).length, 2);
  for (const id of ids) {
    const o = await ordenes.obtenerOrden(id);
    const t = ordenes.calcularTotales(o.materiales, o.servicios);
    const h = hojas[o.numeroOrden];
    assert.ok(h, `falta la hoja ${o.numeroOrden}`);
    assert.equal(h['Folio'], o.numeroOrden);
    assert.ok(h.titulo && h.materiales && h.servicios && h.conformidad && h.merges > 10, 'disposición del modelo oficial');
    assert.equal(h['Total a pagar CUP'], moneda.normalizarImporte(t.totalCUP));
    assert.equal(h['Total a pagar USD'], moneda.normalizarImporte(t.totalUSD));
  }
  assert.equal(hojas['000001']['Total a pagar CUP'], moneda.normalizarImporte(12345.67 * 16 + 10.1 * 2.5));
});

prueba('T26 PDF por orden: todas las secciones y totales idénticos a los de pantalla, con caracteres especiales escapados', async () => {
  await crearDosOrdenesParaExportar();
  const lista = await analitica.obtenerOrdenesFiltradas({ limite: 50 });
  await respaldo.exportarOrdenesPDF(lista);
  const html = estado.ultimoHtml;
  for (const t of ['ORDEN DE SERVICIO', 'Folio de la Orden', 'Información del Cliente', 'Información del Servicio', 'Información del Equipo', 'Tiempo de Trabajo (Minutos)', 'Observaciones del Trabajo Realizado', 'Listado de los Materiales Utilizados', 'Listado de los Servicios Prestados', 'Totales Generales a Pagar', 'Conformidad del Trabajo', 'Control del Folio', 'Técnico Responsable']) {
    assert.equal((html.match(new RegExp(t.replace(/[().]/g, '\\$&'), 'g')) || []).length, 2, `«${t}» debe aparecer en las 2 órdenes`);
  }
  assert.ok(html.includes('Cliente &lt;Uno&gt; &amp; Cía'));
  assert.ok(!html.includes('<Uno>'));
  const o1 = await ordenes.obtenerOrden(lista.find((x) => x.folio === '000001').id);
  const t1 = ordenes.calcularTotales(o1.materiales, o1.servicios);
  assert.ok(html.includes(moneda.formatearImporte(t1.totalCUP, 'CUP')));
  assert.equal((html.match(/page-break-after/g) || []).length >= 1, true);
});

prueba('T29 Tarifario Estatal/Interno (modelo por familias) con procedimientos oficiales: 1858 servicios con los mismos precios del catálogo; procedimiento por servicio, sin herencia', async () => {
  assert.equal(procedimientos.claveCodigo('25-2035-TER'), '2035');
  assert.equal(procedimientos.claveCodigo('2035'), '2035');
  const p = procedimientos.obtenerProcedimiento('25-2035-TER');
  assert.ok(p, 'el servicio 2035 debe tener procedimiento');
  assert.equal(p.categoriaId, '20');
  assert.equal(p.tecnicos, 3);
  assert.equal(p.tiempoMinutos, 81);
  assert.equal(p.actividades.length, 5);
  assert.equal(p.actividades.reduce((a, x) => a + x.minutos, 0), 81);
  assert.ok(p.actividades[4].actividad.startsWith('Llenado'));
  assert.ok(p.insumos.some((i) => i.producto.startsWith('Papel Carta')));
  assert.equal(procedimientos.obtenerProcedimiento('XX-9999-YYY'), null);
  assert.equal(procedimientos.formatearMinutos(90), '90 min (1 h 30 min)');
  assert.equal(procedimientos.formatearMinutos(45), '45 min');
  assert.equal(procedimientos.formatearMinutos(120), '120 min (2 h)');
  assert.equal(procedimientos.formatearMinutos(null), '—');
  assert.equal(procedimientos.cantidadServiciosTarifarioEstatal(), 1858);
  // integridad contra el catálogo real: mismos servicios y EXACTAMENTE los mismos precios
  const seed = JSON.parse(fs.readFileSync(path.join(SRC, 'data/servicios_seed.json'), 'utf-8'));
  const modelo = JSON.parse(fs.readFileSync(path.join(SRC, 'data/tarifario_estatal.json'), 'utf-8'));
  const porCodigo = new Map();
  for (const c of modelo.categorias) for (const sv of c.servicios) { assert.ok(!porCodigo.has(sv.codigo_completo), 'código repetido'); porCodigo.set(sv.codigo_completo, sv); }
  assert.equal(porCodigo.size, 1858);
  let conProc = 0, sinProc = null;
  for (const x of seed) {
    const m = porCodigo.get(x.codigoServicio);
    assert.ok(m, `falta ${x.codigoServicio}`);
    assert.equal(m.tarifa, x.precioBase, `precio distinto en ${x.codigoServicio}`);
    assert.equal(m.descripcion, x.nombreServicio);
    assert.equal(m.modalidad, x.categoria);
    if (m.procedimiento) {
      conProc++;
      const pr = m.procedimiento;
      assert.ok(pr.actividades.length > 0 && pr.actividades.every((a) => typeof a.actividad === 'string' && (a.minutos === null || a.minutos >= 0)), `actividades inválidas en ${m.codigo}`);
      assert.ok(Number.isFinite(pr.tiempo_minutos) && pr.tiempo_minutos > 0, `tiempo inválido en ${m.codigo}`);
    } else sinProc = sinProc || x.codigoServicio;
  }
  assert.equal(conProc, procedimientos.cantidadServiciosConProcedimiento());
  assert.ok(conProc > 1300, `solo ${conProc} servicios con procedimiento`);
  assert.ok(sinProc, 'debe haber servicios sin procedimiento');
  assert.equal(procedimientos.obtenerProcedimiento(sinProc), null, 'sin procedimiento no hereda nada');
});

prueba('T30 Tarifario de Población: 82 prestaciones independientes, importes exactos del archivo, búsqueda sin acentos, sin enlace a la tabla servicios', async () => {
  const pob = require(path.join(SRC, 'services/tarifarioPoblacionService.ts'));
  assert.deepEqual(pob.validarTarifaPoblacion(), []);
  assert.equal(pob.PRESTACIONES_POBLACION.length, 82);
  assert.equal(pob.PRESTACIONES_POBLACION.reduce((a, x) => a + x.precioCUP, 0), 162580);
  const todas = pob.listarTarifaPoblacion();
  assert.equal(todas.length, 82);
  assert.ok(todas.every((i) => i.id < 0 && i.tarifa === 'poblacion' && i.categoria === 'Población'));
  assert.equal(new Set(todas.map((i) => i.id)).size, 82);
  const mto = todas.find((i) => i.codigoServicio === '1011');
  assert.equal(mto.precioBase, 1407);
  assert.equal(pob.listarTarifaPoblacion('revision diagnostico').every((i) => /revisi[oó]n/i.test(i.nombreServicio)), true);
  assert.ok(pob.listarTarifaPoblacion('REVISION').length >= 2);
  assert.equal(pob.listarTarifaPoblacion('zzzz-no-existe').length, 0);
  assert.equal(pob.listarTarifaPoblacion('0905')[0].precioBase, 500);
  // procedimiento por equivalencia: solo vínculo, los precios no cambian
  const enlazadas = todas.filter((i) => i.procedimientoDe);
  assert.equal(enlazadas.length, 73);
  assert.ok(enlazadas.every((i) => procedimientos.obtenerProcedimiento(i.procedimientoDe) && ['nombre_igual', 'nombre_similar', 'confirmado'].includes(i.coincidencia)));
  assert.equal(enlazadas.filter((i) => i.coincidencia === 'nombre_igual').length, 57);
  const sinEnlace = todas.filter((i) => !i.procedimientoDe).map((i) => i.codigoServicio);
  for (const c of ['0905', '1039', '0200']) assert.ok(sinEnlace.includes(c), `${c} no debe vincularse`);
  assert.equal(enlazadas.filter((i) => i.coincidencia === 'confirmado').length, 6);
  for (const c of ['2036', '2628', '3017', '7046', '8338', '8418']) assert.equal(todas.find((i) => i.codigoServicio === c).procedimientoDe, c);
  assert.equal(todas.find((i) => i.codigoServicio === '1011').procedimientoDe, '1011');
  assert.deepEqual(pob.validarTarifaPoblacion([{ codigo: 'A', nombre: 'x', unidad: 'UNO', precioCUP: -1 }, { codigo: 'A', nombre: '', unidad: 'UNO', precioCUP: 1 }]).length, 3);
});

prueba('T27 JSON de traspaso: validación de versión, tipos, cantidades, importes y totales; conflictos antes de aplicar; atómico', async () => {
  const ids = await crearDosOrdenesParaExportar();
  const lista = await analitica.obtenerOrdenesFiltradas({ limite: 50 });
  await respaldo.exportarOrdenesJSON(lista);
  const archivo = Object.entries(estado.compartidos).filter(([n]) => n.includes('traspaso')).pop()[1];
  const j = JSON.parse(archivo);
  assert.equal(j.version, 2);
  assert.ok(j.ordenes.every((o) => o.totales && 'totalCUP' in o.totales));
  assert.equal(j.ordenes.find((o) => o.folio === '000001').equipos.length, 2);

  // dispositivo limpio con rango propio de Ana
  const preparar = async (obj) => { await reiniciarBase(); const a = await tecnico('Ana'); await folios.asignarRango(a, 100, 110); return respaldo.prepararTraspasoDesdeTexto(JSON.stringify(obj)); };
  const ok = await preparar(j);
  assert.equal(ok.aImportar.length, 2); assert.equal(ok.omitidas.length, 0);

  const clon = () => JSON.parse(JSON.stringify(j));
  const uno = (x) => x.ordenes.find((o) => o.folio === '000001');
  const casos = [
    ['cantidad cero', (x) => { uno(x).servicios[0].cantidad = 0; }],
    ['cantidad texto', (x) => { uno(x).servicios[0].cantidad = '3'; }],
    ['importe negativo', (x) => { uno(x).materiales[0].importeCUP = -1; }],
    ['importe no numérico', (x) => { uno(x).servicios[0].importeUSD = 'abc'; }],
    ['total alterado', (x) => { uno(x).totales.totalCUP = 1; }],
    ['múltiple sin equipos', (x) => { uno(x).equipos = []; }],
    ['estado desconocido', (x) => { uno(x).estado = 'rara'; }],
  ];
  for (const [nombre, mut] of casos) {
    const x = clon(); mut(x);
    const prep = await preparar(x);
    assert.equal(prep.omitidas.length, 1, `«${nombre}» debe omitirse`);
    assert.equal(prep.aImportar.length, 1, `«${nombre}»: la otra orden sí se importa`);
  }
  const malaVersion = clon(); malaVersion.version = 7;
  await rechaza(preparar(malaVersion), 'TRASPASO_INVALIDO');

  // aplicar: los importes importados son idénticos a los exportados y no se tocó nada más
  const prep = await preparar(j);
  const res = await respaldo.aplicarTraspaso(prep);
  assert.equal(res.importadas, 2);
  for (const orig of j.ordenes) {
    const fila = await q1('SELECT id FROM ordenes WHERE numeroOrden=?', orig.folio);
    const o = await ordenes.obtenerOrden(fila.id);
    const t = ordenes.calcularTotales(o.materiales, o.servicios);
    assert.equal(moneda.normalizarImporte(t.totalCUP), moneda.normalizarImporte(orig.totales.totalCUP));
    assert.equal(moneda.normalizarImporte(t.totalUSD), moneda.normalizarImporte(orig.totales.totalUSD));
    assert.equal(o.equipos.length, orig.equipos.length);
  }
  // segunda importación: choque de folios → se omiten y se listan, sin duplicar
  const otra = await respaldo.prepararTraspasoDesdeTexto(JSON.stringify(j));
  assert.equal(otra.aImportar.length, 0); assert.equal(otra.omitidas.length, 2);
  assert.equal((await q('SELECT * FROM ordenes')).length, 2);
});


prueba('T28 datos antiguos con cantidad ≤ 0: SQL y calcularTotales coinciden (la línea no suma)', async () => {
  await reiniciarBase();
  const a = await tecnico('Ana');
  await folios.asignarRango(a, 1, 5);
  const id = await ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a }));
  const dbx = await dbMod.getDatabase();
  await dbx.runAsync(`INSERT INTO orden_servicios (ordenId, codigo, descripcion, cantidad, importeCUP, importeUSD) VALUES (?, 'LEG', 'legado', 0, 500, 0)`, id);
  await dbx.runAsync(`INSERT INTO orden_servicios (ordenId, codigo, descripcion, cantidad, importeCUP, importeUSD) VALUES (?, 'NEG', 'legado', -2, 700, 0)`, id);
  const o = await ordenes.obtenerOrden(id);
  const t = ordenes.calcularTotales(o.materiales, o.servicios);
  const ult = await analitica.obtenerUltimasOrdenes(10);
  assert.equal(moneda.normalizarImporte(ult[0].totalCUP), moneda.normalizarImporte(t.totalCUP));
  assert.equal(t.totalCUP, 100 * 3 + 10 * 2);
});

// ------------------------------------------------------------------
(async () => {
  let fallos = 0;
  for (const { nombre, fn } of pruebas) {
    try {
      await fn();
      console.log(`✔ ${nombre}`);
    } catch (e) {
      fallos++;
      console.log(`✘ ${nombre}\n   ${e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n   ') : e}`);
    }
  }
  try { await dbMod.cerrarDatabase(); } catch {}
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n${pruebas.length - fallos}/${pruebas.length} pruebas OK`);
  process.exit(fallos ? 1 : 0);
})();
