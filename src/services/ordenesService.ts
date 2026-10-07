import { getDatabase } from '../database/db';
import type {
  ActualizacionOrden,
  EstadoOrden,
  NuevaOrden,
  NuevoOrdenMaterial,
  NuevoOrdenServicio,
  NuevoOrdenTecnico,
  NuevoOrdenEquipo,
  OrdenEquipo,
  Orden,
  OrdenCompleta,
  OrdenMaterial,
  OrdenServicio,
  OrdenTecnico,
  TotalesOrden,
} from '../types/ordenes.types';

// Mismo criterio de seguridad que tarifarioService.ts: whitelist explícita
// de columnas antes de armar SQL dinámico a partir de las claves de un
// objeto — los tipos de TypeScript no existen en tiempo de ejecución.
const COLUMNAS_ORDEN = new Set<string>([
  'codigoReporte',
  'reportadoPor',
  'fechaReporte',
  'codigoOrden',
  'codigoFactura',
  'tipoCobertura',
  'modalidadMultiple',
  'clienteCodigo',
  'clienteTipo',
  'clienteNombre',
  'clienteDireccion',
  'clienteMunicipio',
  'clienteProvincia',
  'modalidadesServicio',
  'equipoTipo',
  'equipoMarca',
  'equipoModelo',
  'equipoNroSerie',
  'fechaInicio',
  'fechaFin',
  'tiempoTrabajoMinutos',
  'observaciones',
  'tecnicoId',
  'estado',
  'revisorNombre',
  'revisorCargo',
  'revisorFecha',
  'revisorFirmado',
  'tecnicoFirmaNombre',
  'tecnicoFirmaCI',
  'tecnicoFirmado',
  'clienteFirmaNombre',
  'clienteFirmaCargo',
  'clienteFirmaCI',
  'clienteFirmaFecha',
  'clienteFirmado',
]);

async function siguienteNumeroOrden(db: Awaited<ReturnType<typeof getDatabase>>): Promise<string> {
  const fila = await db.getFirstAsync<{ maximo: number | null }>(
    `SELECT MAX(CAST(numeroOrden AS INTEGER)) maximo
     FROM ordenes
     WHERE TRIM(numeroOrden) GLOB '[0-9]*'`,
  );
  const contador = await db.getFirstAsync<{ valor: string | null }>(
    `SELECT valor FROM configuracion WHERE clave = 'siguienteFolio' LIMIT 1`,
  );
  let siguiente = Math.max(
    1,
    (fila?.maximo ?? 0) + 1,
    Number(contador?.valor ?? 1),
  );
  while (true) {
    const folio = String(siguiente).padStart(6, '0');
    const existe = await db.getFirstAsync<{ encontrado: number }>(
      `SELECT 1 encontrado FROM ordenes WHERE numeroOrden = ? LIMIT 1`,
      folio,
    );
    if (!existe) {
      await db.runAsync(
        `INSERT INTO configuracion (clave, valor) VALUES ('siguienteFolio', ?)
         ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`,
        String(siguiente + 1),
      );
      return folio;
    }
    siguiente += 1;
  }
}

/**
 * Crea una orden y asigna el siguiente folio disponible según la secuencia
 * almacenada en la base. La búsqueda parte del máximo numérico existente y
 * comprueba la unicidad antes de insertar.
 */
export async function crearOrden(datos: NuevaOrden): Promise<number> {
  const db = await getDatabase();
  const entradas = Object.entries(datos).filter(
    ([campo, valor]) => valor !== undefined && COLUMNAS_ORDEN.has(campo)
  ) as [string, string | number | null][];

  const columnas = entradas.map(([campo]) => campo);
  const marcadores = columnas.map(() => '?').join(', ');
  const valores = entradas.map(([, valor]) => valor);

  const folio = await siguienteNumeroOrden(db);
  const resultado = await db.runAsync(
    `INSERT INTO ordenes (numeroOrden, compania${columnas.length ? ', ' + columnas.join(', ') : ''})
     VALUES (?, 'COPEXTEL'${columnas.length ? ', ' + marcadores : ''})`,
    folio,
    ...valores
  );

  const id = resultado.lastInsertRowId;
  return id;
}

export async function actualizarOrden(id: number, cambios: ActualizacionOrden): Promise<void> {
  const entradas = Object.entries(cambios).filter(
    ([campo, valor]) => valor !== undefined && COLUMNAS_ORDEN.has(campo)
  ) as [string, string | number | null][];
  if (entradas.length === 0) return;

  const db = await getDatabase();
  const asignaciones = entradas.map(([campo]) => `${campo} = ?`).join(', ');
  const valores = entradas.map(([, valor]) => valor);

  await db.runAsync(
    `UPDATE ordenes SET ${asignaciones}, actualizadoEn = datetime('now') WHERE id = ?`,
    ...valores,
    id
  );
}

export async function obtenerOrden(id: number): Promise<OrdenCompleta | null> {
  const db = await getDatabase();
  const orden = await db.getFirstAsync<Orden>(`SELECT * FROM ordenes WHERE id = ?`, id);
  if (!orden) return null;

  const [equipos, materiales, servicios, tecnicos] = await Promise.all([
    db.getAllAsync<OrdenEquipo>(`SELECT * FROM orden_equipos WHERE ordenId = ? ORDER BY id ASC`, id),
    db.getAllAsync<OrdenMaterial>(`SELECT * FROM orden_materiales WHERE ordenId = ? ORDER BY id ASC`, id),
    db.getAllAsync<OrdenServicio>(`SELECT * FROM orden_servicios WHERE ordenId = ? ORDER BY id ASC`, id),
    db.getAllAsync<OrdenTecnico>(`SELECT * FROM orden_tecnicos WHERE ordenId = ? ORDER BY id ASC`, id),
  ]);

  return { ...orden, equipos, materiales, servicios, tecnicos };
}

export async function listarOrdenes(opciones: { estado?: EstadoOrden; limite?: number } = {}): Promise<Orden[]> {
  const { estado, limite = 100 } = opciones;
  const db = await getDatabase();
  const where = estado ? 'WHERE estado = ?' : '';
  const params = estado ? [estado, limite] : [limite];
  return db.getAllAsync<Orden>(
    `SELECT * FROM ordenes ${where} ORDER BY id DESC LIMIT ?`,
    ...params
  );
}

export async function eliminarOrden(id: number): Promise<void> {
  const db = await getDatabase();
  // orden_materiales y orden_servicios tienen ON DELETE CASCADE — se
  // borran solas al borrar la orden, no hace falta borrarlas aparte.
  await db.runAsync(`DELETE FROM ordenes WHERE id = ?`, id);
}


export interface OrdenCompletaParaGuardar {
  datos: NuevaOrden;
  equipos: NuevoOrdenEquipo[];
  materiales: NuevoOrdenMaterial[];
  servicios: ServicioParaGuardar[];
  tecnicos: NuevoOrdenTecnico[];
}

/**
 * Guarda una orden completa en una sola transacción.
 *
 * Antes la pantalla hacía: crear/actualizar orden + tres Promise.all de
 * reemplazo. Si una operación fallaba, la orden podía quedar parcialmente
 * guardada. SQLite garantiza aquí un commit único: o se guarda todo o no se
 * modifica nada.
 */
export async function guardarOrdenCompletaEnTransaccion(
  db: Awaited<ReturnType<typeof getDatabase>>,
  ordenId: number | null,
  payload: OrdenCompletaParaGuardar,
): Promise<number> {
  validarPayloadOrden(payload);
  let id = ordenId;

    if (id === null) {
      const entradas = Object.entries(payload.datos).filter(
        ([campo, valor]) => valor !== undefined && COLUMNAS_ORDEN.has(campo)
      ) as [string, string | number | null][];
      const columnas = entradas.map(([campo]) => campo);
      const marcadores = columnas.map(() => '?').join(', ');
      const valores = entradas.map(([, valor]) => valor);

      const folio = await siguienteNumeroOrden(db);
      const resultado = await db.runAsync(
        `INSERT INTO ordenes (numeroOrden, compania${columnas.length ? ', ' + columnas.join(', ') : ''})
         VALUES (?, 'COPEXTEL'${columnas.length ? ', ' + marcadores : ''})`,
        folio,
        ...valores
      );
      id = resultado.lastInsertRowId;
    } else {
      const entradas = Object.entries(payload.datos).filter(
        ([campo, valor]) => valor !== undefined && COLUMNAS_ORDEN.has(campo)
      ) as [string, string | number | null][];
      if (entradas.length) {
        const asignaciones = entradas.map(([campo]) => `${campo} = ?`).join(', ');
        const valores = entradas.map(([, valor]) => valor);
        await db.runAsync(
          `UPDATE ordenes SET ${asignaciones}, actualizadoEn = datetime('now') WHERE id = ?`,
          ...valores,
          id
        );
      }
    }

    await db.runAsync(`DELETE FROM orden_equipos WHERE ordenId = ?`, id);
    for (const e of payload.equipos) {
      await db.runAsync(
        `INSERT INTO orden_equipos (ordenId, marca, modelo, nroSerie) VALUES (?, ?, ?, ?)`,
        id,
        e.marca ?? null,
        e.modelo ?? null,
        e.nroSerie ?? null,
      );
    }

    await db.runAsync(`DELETE FROM orden_materiales WHERE ordenId = ?`, id);
    for (const m of payload.materiales) {
      await db.runAsync(
        `INSERT INTO orden_materiales (ordenId, vale, codigo, descripcion, unidadMedida, cantidad, nroSerie, importeCUP, importeUSD)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        m.vale ?? null,
        m.codigo ?? null,
        m.descripcion ?? null,
        m.unidadMedida ?? null,
        m.cantidad ?? 0,
        m.nroSerie ?? null,
        m.importeCUP ?? 0,
        m.importeUSD ?? 0
      );
    }

    await db.runAsync(`DELETE FROM orden_servicios WHERE ordenId = ?`, id);
    for (const s of payload.servicios) {
      await db.runAsync(
        `INSERT INTO orden_servicios (ordenId, servicioId, codigo, descripcion, cantidad, importeCUP, importeUSD)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        id,
        s.servicioId,
        s.codigo,
        s.descripcion,
        s.cantidad,
        s.importeCUP,
        s.importeUSD
      );
    }

    await db.runAsync(`DELETE FROM orden_tecnicos WHERE ordenId = ?`, id);
    for (const t of payload.tecnicos) {
      await db.runAsync(
        `INSERT INTO orden_tecnicos (ordenId, tecnicoId, nombre, cargo, ci, firmado) VALUES (?, ?, ?, ?, ?, ?)`,
        id,
        t.tecnicoId ?? null,
        t.nombre ?? null,
        t.cargo ?? null,
        t.ci ?? null,
        t.firmado ?? 0
      );
    }
  if (id === null) {
    throw new Error('guardarOrdenCompleta: no se pudo determinar el id de la orden guardada.');
  }
  return id;
}

function validarPayloadOrden(payload: OrdenCompletaParaGuardar): void {
  if (payload.datos.modalidadMultiple === 1 && payload.equipos.length < 2) {
    throw new Error('Una orden en modalidad múltiple debe contener al menos dos equipos atendidos.');
  }

  for (const material of payload.materiales) {
    if (material.cantidad == null || !Number.isFinite(material.cantidad) || material.cantidad <= 0) {
      throw new Error('La cantidad de cada material debe ser mayor que cero.');
    }
    if (!Number.isFinite(material.importeCUP ?? 0) || (material.importeCUP ?? 0) < 0 ||
        !Number.isFinite(material.importeUSD ?? 0) || (material.importeUSD ?? 0) < 0) {
      throw new Error('Los importes de los materiales no son válidos.');
    }
  }

  for (const servicio of payload.servicios) {
    if (!Number.isFinite(servicio.cantidad) || servicio.cantidad <= 0) {
      throw new Error('La cantidad de cada servicio debe ser mayor que cero.');
    }
    if (!Number.isFinite(servicio.importeCUP) || servicio.importeCUP < 0 ||
        !Number.isFinite(servicio.importeUSD) || servicio.importeUSD < 0) {
      throw new Error('Los importes de los servicios no son válidos.');
    }
  }
}

export async function guardarOrdenCompleta(
  ordenId: number | null,
  payload: OrdenCompletaParaGuardar
): Promise<number> {
  validarPayloadOrden(payload);
  const db = await getDatabase();
  let id: number | null = ordenId;
  await db.withExclusiveTransactionAsync(async (tx) => {
    id = await guardarOrdenCompletaEnTransaccion(tx, ordenId, payload);
  });
  if (id === null) throw new Error('guardarOrdenCompleta: no se pudo determinar el id de la orden guardada.');
  return id;
}

// ---------- Materiales ----------

export async function agregarMaterial(ordenId: number, material: NuevoOrdenMaterial): Promise<number> {
  const db = await getDatabase();
  const resultado = await db.runAsync(
    `INSERT INTO orden_materiales (ordenId, vale, codigo, descripcion, unidadMedida, cantidad, nroSerie, importeCUP, importeUSD)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ordenId,
    material.vale ?? null,
    material.codigo ?? null,
    material.descripcion ?? null,
    material.unidadMedida ?? null,
    material.cantidad ?? 0,
    material.nroSerie ?? null,
    material.importeCUP ?? 0,
    material.importeUSD ?? 0
  );
  return resultado.lastInsertRowId;
}

export async function actualizarMaterial(id: number, cambios: NuevoOrdenMaterial): Promise<void> {
  const campos = ['vale', 'codigo', 'descripcion', 'unidadMedida', 'cantidad', 'nroSerie', 'importeCUP', 'importeUSD'];
  const entradas = Object.entries(cambios).filter(([campo, valor]) => valor !== undefined && campos.includes(campo));
  if (entradas.length === 0) return;

  const db = await getDatabase();
  const asignaciones = entradas.map(([campo]) => `${campo} = ?`).join(', ');
  const valores = entradas.map(([, valor]) => valor as string | number | null);
  await db.runAsync(`UPDATE orden_materiales SET ${asignaciones} WHERE id = ?`, ...valores, id);
}

export async function eliminarMaterial(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM orden_materiales WHERE id = ?`, id);
}

// ---------- Servicios (acá pega el doble clic desde el Tarifario) ----------

/**
 * Agrega un servicio del catálogo a la orden. Copia código/descripción/
 * precio en la línea en vez de solo guardar la referencia — si el precio
 * del catálogo cambia después, esta orden ya facturada no cambia de
 * valor retroactivamente (ver comentario en schema.ts).
 */
export async function agregarServicioDesdeTarifario(
  ordenId: number,
  servicio: { id: number; codigoServicio: string; nombreServicio: string; precioBase: number },
  cantidad = 1
): Promise<number> {
  const db = await getDatabase();
  const resultado = await db.runAsync(
    `INSERT INTO orden_servicios (ordenId, servicioId, codigo, descripcion, cantidad, importeCUP, importeUSD)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
    ordenId,
    servicio.id,
    servicio.codigoServicio,
    servicio.nombreServicio,
    cantidad,
    servicio.precioBase
  );
  return resultado.lastInsertRowId;
}

export async function actualizarServicioDeOrden(id: number, cambios: NuevoOrdenServicio): Promise<void> {
  const campos = ['codigo', 'descripcion', 'cantidad', 'importeCUP', 'importeUSD'];
  const entradas = Object.entries(cambios).filter(([campo, valor]) => valor !== undefined && campos.includes(campo));
  if (entradas.length === 0) return;

  const db = await getDatabase();
  const asignaciones = entradas.map(([campo]) => `${campo} = ?`).join(', ');
  const valores = entradas.map(([, valor]) => valor as string | number | null);
  await db.runAsync(`UPDATE orden_servicios SET ${asignaciones} WHERE id = ?`, ...valores, id);
}

export async function eliminarServicioDeOrden(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM orden_servicios WHERE id = ?`, id);
}

/** Suma materiales + servicios en CUP y USD — para la sección 8 (Totales Generales). */
function cantidadValida(valor: number): number {
  return Number.isFinite(valor) && valor > 0 ? valor : 0;
}

export function calcularTotales(materiales: OrdenMaterial[], servicios: OrdenServicio[]): TotalesOrden {
  const materialesCUP = materiales.reduce((acc, m) => acc + m.importeCUP * cantidadValida(m.cantidad), 0);
  const materialesUSD = materiales.reduce((acc, m) => acc + m.importeUSD * cantidadValida(m.cantidad), 0);
  const serviciosCUP = servicios.reduce((acc, s) => acc + s.importeCUP * cantidadValida(s.cantidad), 0);
  const serviciosUSD = servicios.reduce((acc, s) => acc + s.importeUSD * cantidadValida(s.cantidad), 0);
  return {
    materialesCUP,
    materialesUSD,
    serviciosCUP,
    serviciosUSD,
    totalCUP: materialesCUP + serviciosCUP,
    totalUSD: materialesUSD + serviciosUSD,
  };
}

/**
 * Borra los materiales existentes de la orden y carga la lista dada.
 * Un formulario que se guarda entero de una vez no necesita un diff fila
 * por fila — reemplazar todo es más simple y sin casos raros.
 */
export async function reemplazarMateriales(ordenId: number, materiales: NuevoOrdenMaterial[]): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM orden_materiales WHERE ordenId = ?`, ordenId);
    for (const m of materiales) {
      await db.runAsync(
        `INSERT INTO orden_materiales (ordenId, vale, codigo, descripcion, unidadMedida, cantidad, nroSerie, importeCUP, importeUSD)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ordenId,
        m.vale ?? null,
        m.codigo ?? null,
        m.descripcion ?? null,
        m.unidadMedida ?? null,
        m.cantidad ?? 0,
        m.nroSerie ?? null,
        m.importeCUP ?? 0,
        m.importeUSD ?? 0
      );
    }
  });
}

export interface ServicioParaGuardar {
  servicioId: number | null;
  codigo: string;
  descripcion: string;
  cantidad: number;
  importeCUP: number;
  importeUSD: number;
}

export async function reemplazarServiciosDeOrden(ordenId: number, servicios: ServicioParaGuardar[]): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM orden_servicios WHERE ordenId = ?`, ordenId);
    for (const s of servicios) {
      await db.runAsync(
        `INSERT INTO orden_servicios (ordenId, servicioId, codigo, descripcion, cantidad, importeCUP, importeUSD)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ordenId,
        s.servicioId,
        s.codigo,
        s.descripcion,
        s.cantidad,
        s.importeCUP,
        s.importeUSD
      );
    }
  });
}

/**
 * Reemplaza la lista de técnicos firmantes de la orden. Es una tabla
 * aparte (no columnas en `ordenes`) porque un trabajo en brigada tiene
 * varios técnicos firmando la misma orden, no uno solo.
 */
export async function reemplazarTecnicosDeOrden(ordenId: number, tecnicos: NuevoOrdenTecnico[]): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM orden_tecnicos WHERE ordenId = ?`, ordenId);
    for (const t of tecnicos) {
      await db.runAsync(
        `INSERT INTO orden_tecnicos (ordenId, tecnicoId, nombre, cargo, ci, firmado) VALUES (?, ?, ?, ?, ?, ?)`,
        ordenId,
        t.tecnicoId ?? null,
        t.nombre ?? null,
        t.cargo ?? null,
        t.ci ?? null,
        t.firmado ?? 0
      );
    }
  });
}
