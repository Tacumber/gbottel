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
  'expo-print': {},
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
prueba('T01 base nueva: v6, sin rangos → no se puede crear orden y no queda nada a medias', async () => {
  await reiniciarBase();
  assert.equal((await q1(`SELECT valor FROM configuracion WHERE clave='schemaVersion'`)).valor, '6');
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
  await rechaza(ordenes.guardarOrdenCompleta(null, payload({ tecnicoPrincipalId: a, servicios: [{ servicioId: null, codigo: 'x', descripcion: 'x', cantidad: null, importeCUP: 1, importeUSD: 0 }] })), 'NOT NULL');
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
  assert.equal((await q1(`SELECT valor FROM configuracion WHERE clave='schemaVersion'`)).valor, '6');
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

prueba('T10 respaldo v3: ida y vuelta conserva folios; fusiona bloques con el mayor siguiente; el libro local no se pierde', async () => {
  const contenido = await escenarioRespaldo();
  const j = JSON.parse(contenido);
  assert.equal(j.version, 3);
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
  malo.ordenes[1].estado = 'no_existe';
  await reiniciarBase(); await tecnico('Beto');
  const p3 = await respaldo.prepararTraspasoDesdeTexto(JSON.stringify(malo));
  await rechaza(respaldo.aplicarTraspaso(p3), 'CHECK');
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
