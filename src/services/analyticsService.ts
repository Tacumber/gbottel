import { getDatabase } from '@/database/db';

export type OrdenDashboard = {
  id: number;
  folio: string;
  cliente: string;
  fecha: string | null;
  estado: string;
  totalCUP: number;
  totalUSD: number;
};

export type MesIngreso = { mes: string; ordenes: number; cup: number; usd: number };
export type ServicioRendimiento = { servicio: string; codigo: string; cantidad: number; cup: number; usd: number };

const REVENUE_STATES = `('finalizada','facturada')`;

const TOTAL_CUP = `(SELECT COALESCE(SUM(os.importeCUP),0) FROM orden_servicios os WHERE os.ordenId=o.id) + (SELECT COALESCE(SUM(om.importeCUP),0) FROM orden_materiales om WHERE om.ordenId=o.id)`;
const TOTAL_USD = `(SELECT COALESCE(SUM(os.importeUSD),0) FROM orden_servicios os WHERE os.ordenId=o.id) + (SELECT COALESCE(SUM(om.importeUSD),0) FROM orden_materiales om WHERE om.ordenId=o.id)`;

export async function obtenerResumenDashboard() {
  const db = await getDatabase();
  const esteMes = `substr(COALESCE(NULLIF(o.fechaReporte,''),o.creadoEn),1,7)=strftime('%Y-%m','now','localtime')`;
  const [ordenes, completadas, pendientes, progreso, facturadas, tecnicos, ingresoMes, ingresoAnual, ordenesAnual, plan] = await Promise.all([
    db.getFirstAsync<{ total: number }>(`SELECT COUNT(*) total FROM ordenes`),
    // Completadas resetea cada mes (cuenta solo lo finalizado/facturado
    // ESTE mes) — a diferencia de Órdenes activas, que es un estado
    // actual y no debe resetear: un pendiente de un mes anterior sigue
    // siendo un pendiente real hoy.
    db.getFirstAsync<{ total: number }>(`SELECT COUNT(*) total FROM ordenes o WHERE o.estado='finalizada' AND ${esteMes}`),
    db.getFirstAsync<{ total: number }>(`SELECT COUNT(*) total FROM ordenes WHERE estado='pendiente'`),
    db.getFirstAsync<{ total: number }>(`SELECT COUNT(*) total FROM ordenes WHERE estado='en_progreso'`),
    db.getFirstAsync<{ total: number }>(`SELECT COUNT(*) total FROM ordenes o WHERE o.estado='facturada' AND ${esteMes}`),
    db.getFirstAsync<{ total: number }>(`SELECT COUNT(*) total FROM tecnicos WHERE estado='activo'`),
    db.getFirstAsync<{ cup: number; usd: number }>(`SELECT COALESCE(SUM(${TOTAL_CUP}),0) cup, COALESCE(SUM(${TOTAL_USD}),0) usd FROM ordenes o WHERE o.estado IN ${REVENUE_STATES} AND ${esteMes}`),
    db.getFirstAsync<{ cup: number; usd: number }>(`SELECT COALESCE(SUM(${TOTAL_CUP}),0) cup, COALESCE(SUM(${TOTAL_USD}),0) usd FROM ordenes o WHERE o.estado IN ${REVENUE_STATES} AND substr(COALESCE(NULLIF(o.fechaReporte,''),o.creadoEn),1,4)=strftime('%Y','now','localtime')`),
    db.getFirstAsync<{ total: number }>(`SELECT COUNT(*) total FROM ordenes o WHERE substr(COALESCE(NULLIF(o.fechaReporte,''),o.creadoEn),1,4)=strftime('%Y','now','localtime')`),
    // Suma de la meta individual de cada técnico activo, no un valor único
    // global — cada técnico define su propia meta en la pantalla Técnicos.
    db.getFirstAsync<{ total: number }>(`SELECT COALESCE(SUM(planMensualCUP),0) total FROM tecnicos WHERE estado='activo'`),
  ]);
  const ingreso = ingresoMes?.cup ?? 0;
  const planCUP = plan?.total ?? 0;
  return {
    totalOrdenes: ordenes?.total ?? 0,
    completadas: completadas?.total ?? 0,
    pendientes: pendientes?.total ?? 0,
    enProgreso: progreso?.total ?? 0,
    facturadas: facturadas?.total ?? 0,
    tecnicosActivos: tecnicos?.total ?? 0,
    ingresoMesCUP: ingreso,
    ingresoMesUSD: ingresoMes?.usd ?? 0,
    ingresoAnualCUP: ingresoAnual?.cup ?? 0,
    ingresoAnualUSD: ingresoAnual?.usd ?? 0,
    ordenesAnual: ordenesAnual?.total ?? 0,
    planMensualCUP: planCUP,
    porcentajePlan: planCUP > 0 ? Math.min(999, (ingreso / planCUP) * 100) : 0,
  };
}

/**
 * Antes esto hacía GROUP BY + LIMIT directo, así que un mes sin
 * facturación simplemente no aparecía — en la gráfica se veía como un
 * salto (ej. jul -> sep, sin agosto) en vez de una barra en cero. Ahora
 * se arma la lista de meses corridos primero y se completa con 0 lo que
 * falte.
 */
export async function obtenerIngresosPorMes(meses = 12): Promise<MesIngreso[]> {
  const db = await getDatabase();
  const filas = await db.getAllAsync<MesIngreso>(
    `SELECT substr(COALESCE(NULLIF(o.fechaReporte,''),o.creadoEn),1,7) mes,
            COUNT(*) ordenes,
            COALESCE(SUM(${TOTAL_CUP}),0) cup,
            COALESCE(SUM(${TOTAL_USD}),0) usd
     FROM ordenes o
     WHERE o.estado IN ${REVENUE_STATES}
       AND substr(COALESCE(NULLIF(o.fechaReporte,''),o.creadoEn),1,7) >= strftime('%Y-%m','now','-' || ? || ' months')
     GROUP BY mes`,
    meses - 1
  );
  const porMes = new Map<string, MesIngreso>(filas.map((f) => [f.mes, f]));
  const hoy = new Date();
  const continuo: MesIngreso[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    continuo.push(porMes.get(clave) ?? { mes: clave, ordenes: 0, cup: 0, usd: 0 });
  }
  return continuo.reverse();
}

export async function obtenerRendimientoServicios(meses = 12): Promise<ServicioRendimiento[]> {
  const db = await getDatabase();
  return db.getAllAsync<ServicioRendimiento>(
    `SELECT COALESCE(os.descripcion,'Servicio sin descripción') servicio,
            COALESCE(os.codigo,'') codigo,
            SUM(os.cantidad) cantidad,
            COALESCE(SUM(os.importeCUP),0) cup,
            COALESCE(SUM(os.importeUSD),0) usd
     FROM orden_servicios os JOIN ordenes o ON o.id=os.ordenId
     WHERE o.estado IN ${REVENUE_STATES}
       AND substr(COALESCE(NULLIF(o.fechaReporte,''),o.creadoEn),1,7) >= substr(strftime('%Y-%m','now','-' || ? || ' months'),1,7)
     GROUP BY os.servicioId, os.codigo, os.descripcion
     ORDER BY cantidad DESC, cup DESC LIMIT 20`, meses
  );
}

export async function obtenerAceptacionServiciosPorMes(meses = 12): Promise<{ mes: string; servicio: string; cantidad: number; cup: number }[]> {
  const db = await getDatabase();
  return db.getAllAsync<{ mes: string; servicio: string; cantidad: number; cup: number }>(
    `WITH base AS (
       SELECT substr(COALESCE(NULLIF(o.fechaReporte,''),o.creadoEn),1,7) mes,
              COALESCE(os.descripcion,'Sin descripción') servicio,
              SUM(os.cantidad) cantidad, COALESCE(SUM(os.importeCUP),0) cup
       FROM orden_servicios os JOIN ordenes o ON o.id=os.ordenId
       WHERE o.estado IN ${REVENUE_STATES}
       GROUP BY mes, os.servicioId, os.descripcion
     ), ranked AS (
       SELECT *, ROW_NUMBER() OVER (PARTITION BY mes ORDER BY cantidad DESC, cup DESC) rn FROM base
     )
     SELECT mes, servicio, cantidad, cup FROM ranked WHERE rn <= 5 ORDER BY mes DESC, cantidad DESC`
  );
}

export type IngresoTecnicoPeriodo = {
  periodo: string; tecnico: string; ordenes: number; cup: number; usd: number;
  plan: number; porcentajePlan: number;
};

/**
 * Corrige el bug de la versión anterior: si una orden tiene 3 técnicos,
 * antes se le sumaba el monto COMPLETO a cada uno de los 3 (triplicando el
 * ingreso reportado). Ahora se divide el total de cada orden entre la
 * cantidad de técnicos que realmente participaron en ESA orden (CTE
 * `conteo`), y a cada uno se le suma su parte.
 *
 * Agrupa por período (día/mes/año) dentro del rango desde/hasta. Si no se
 * da un rango, aplica un respaldo razonable (60 días para "dia", 12 meses
 * para "mes"/"año") en vez de traer el historial completo sin límite.
 *
 * El plan y el porcentaje se calculan distinto según el período:
 * - día/mes: se compara contra el plan mensual del técnico tal cual.
 * - año: el plan se prorratea desde el mes de la PRIMERA orden de ese
 *   técnico en ese año hasta diciembre — no desde enero, porque exigirle
 *   el año completo a alguien que recién empieza a reportar a mitad de
 *   año no tendría sentido. Verificado con datos de prueba: un técnico
 *   que arranca en octubre con plan de 8000/mes da un plan anual
 *   prorrateado de 24000 (3 meses), no de 96000 (12 meses).
 */
export async function obtenerIngresosPorTecnico(
  periodo: 'dia' | 'mes' | 'año' = 'mes',
  opciones: { desde?: string; hasta?: string } = {}
): Promise<IngresoTecnicoPeriodo[]> {
  const db = await getDatabase();
  const periodoExpr = periodo === 'dia' ? `substr(a.fecha,1,10)` : periodo === 'año' ? `substr(a.fecha,1,4)` : `substr(a.fecha,1,7)`;
  const respaldoDias = periodo === 'dia' ? 60 : 365;

  const cond: string[] = [];
  const params: (string | number)[] = [];
  if (opciones.desde) { cond.push(`date(fecha) >= date(?)`); params.push(opciones.desde); }
  else { cond.push(`date(fecha) >= date('now','-${respaldoDias} days')`); }
  if (opciones.hasta) { cond.push(`date(fecha) <= date(?)`); params.push(opciones.hasta); }
  const whereFecha = cond.join(' AND ');

  const filas = await db.getAllAsync<{ periodo: string; tecnico: string; ordenes: number; cup: number; usd: number }>(
    `WITH totales AS (
       SELECT o.id, COALESCE(NULLIF(o.fechaReporte,''),o.creadoEn) fecha, ${TOTAL_CUP} cup, ${TOTAL_USD} usd
       FROM ordenes o WHERE o.estado IN ${REVENUE_STATES}
     ), acotado AS (
       SELECT * FROM totales WHERE ${whereFecha}
     ), participantes AS (
       SELECT o.id, COALESCE(NULLIF(t.nombre,''),'Técnico no identificado') tecnico
       FROM ordenes o LEFT JOIN tecnicos t ON t.id=o.tecnicoId
       WHERE o.estado IN ${REVENUE_STATES} AND o.tecnicoId IS NOT NULL
       UNION
       SELECT ot.ordenId, COALESCE(NULLIF(ot.nombre,''),'Técnico no identificado')
       FROM orden_tecnicos ot JOIN ordenes o ON o.id=ot.ordenId
       WHERE o.estado IN ${REVENUE_STATES} AND NULLIF(ot.nombre,'') IS NOT NULL
     ), conteo AS (
       SELECT id, COUNT(*) n FROM participantes GROUP BY id
     )
     SELECT ${periodoExpr} periodo, p.tecnico,
            COUNT(DISTINCT p.id) ordenes,
            COALESCE(SUM(a.cup / c.n),0) cup,
            COALESCE(SUM(a.usd / c.n),0) usd
     FROM acotado a
     JOIN participantes p ON p.id = a.id
     JOIN conteo c ON c.id = a.id
     GROUP BY periodo, p.tecnico
     ORDER BY periodo DESC, cup DESC`,
    ...params
  );

  const planes = await db.getAllAsync<{ nombre: string; plan: number }>(`SELECT nombre, planMensualCUP plan FROM tecnicos`);
  const planPorNombre = new Map<string, number>(planes.map((p) => [p.nombre, p.plan]));

  if (periodo !== 'año') {
    return filas.map((f) => {
      const plan = planPorNombre.get(f.tecnico) ?? 0;
      return { ...f, plan, porcentajePlan: plan > 0 ? (f.cup / plan) * 100 : 0 };
    });
  }

  const primerMesFilas = await db.getAllAsync<{ tecnico: string; anio: string; primerMes: string }>(
    `WITH participantes AS (
       SELECT o.id, COALESCE(NULLIF(o.fechaReporte,''),o.creadoEn) fecha,
              COALESCE(NULLIF(t.nombre,''),'Técnico no identificado') tecnico
       FROM ordenes o LEFT JOIN tecnicos t ON t.id=o.tecnicoId
       WHERE o.estado IN ${REVENUE_STATES} AND o.tecnicoId IS NOT NULL
       UNION
       SELECT ot.ordenId, COALESCE(NULLIF(o.fechaReporte,''),o.creadoEn),
              COALESCE(NULLIF(ot.nombre,''),'Técnico no identificado')
       FROM orden_tecnicos ot JOIN ordenes o ON o.id=ot.ordenId
       WHERE o.estado IN ${REVENUE_STATES} AND NULLIF(ot.nombre,'') IS NOT NULL
     )
     SELECT tecnico, substr(fecha,1,4) anio, MIN(substr(fecha,1,7)) primerMes
     FROM participantes WHERE ${whereFecha}
     GROUP BY tecnico, anio`,
    ...params
  );
  const primerMesPorClave = new Map<string, string>(primerMesFilas.map((p) => [`${p.tecnico}|${p.anio}`, p.primerMes]));

  return filas.map((f) => {
    const planMensual = planPorNombre.get(f.tecnico) ?? 0;
    const inicio = primerMesPorClave.get(`${f.tecnico}|${f.periodo}`);
    const mesesDelPlan = inicio ? 12 - Number(inicio.slice(5, 7)) + 1 : 12;
    const plan = planMensual * mesesDelPlan;
    return { ...f, plan, porcentajePlan: plan > 0 ? (f.cup / plan) * 100 : 0 };
  });
}

export async function obtenerUltimasOrdenes(limite = 10): Promise<OrdenDashboard[]> {
  const db = await getDatabase();
  return db.getAllAsync<OrdenDashboard>(
    `SELECT o.id, o.numeroOrden folio, COALESCE(o.clienteNombre,'Sin cliente') cliente,
            COALESCE(NULLIF(o.fechaReporte,''),o.creadoEn) fecha, o.estado,
            ${TOTAL_CUP} totalCUP, ${TOTAL_USD} totalUSD
     FROM ordenes o ORDER BY o.id DESC LIMIT ?`, limite
  );
}

export async function obtenerOrdenesFiltradas(opciones: {
  termino?: string; estado?: string; tecnicoId?: number; desde?: string; hasta?: string;
  min?: number; max?: number; limite?: number;
} = {}): Promise<OrdenDashboard[]> {
  const db = await getDatabase();
  const where: string[] = [];
  const params: (string|number)[] = [];
  const term=opciones.termino?.trim();
  if (term) { where.push(`(o.numeroOrden LIKE ? OR o.clienteNombre LIKE ? OR o.codigoOrden LIKE ? OR o.codigoFactura LIKE ?)`); const q=`%${term}%`; params.push(q,q,q,q); }
  if (opciones.estado) { where.push(`o.estado = ?`); params.push(opciones.estado); }
  if (opciones.tecnicoId) { where.push(`o.tecnicoId = ?`); params.push(opciones.tecnicoId); }
  if (opciones.desde) { where.push(`date(COALESCE(NULLIF(o.fechaReporte,''),o.creadoEn)) >= date(?)`); params.push(opciones.desde); }
  if (opciones.hasta) { where.push(`date(COALESCE(NULLIF(o.fechaReporte,''),o.creadoEn)) <= date(?)`); params.push(opciones.hasta); }
  if (opciones.min != null) { where.push(`(${TOTAL_CUP}) >= ?`); params.push(opciones.min); }
  if (opciones.max != null) { where.push(`(${TOTAL_CUP}) <= ?`); params.push(opciones.max); }
  const limit=Math.max(1, Math.min(500, opciones.limite ?? 100));
  params.push(limit);
  return db.getAllAsync<OrdenDashboard>(
    `SELECT o.id, o.numeroOrden folio, COALESCE(o.clienteNombre,'Sin cliente') cliente,
            COALESCE(NULLIF(o.fechaReporte,''),o.creadoEn) fecha, o.estado,
            ${TOTAL_CUP} totalCUP, ${TOTAL_USD} totalUSD
     FROM ordenes o ${where.length?`WHERE ${where.join(' AND ')}`:''}
     ORDER BY o.id DESC LIMIT ?`, ...params
  );
}

export async function obtenerOrdenesPorEstado() {
  const db=await getDatabase();
  return db.getAllAsync<{estado:string; total:number}>(`SELECT estado, COUNT(*) total FROM ordenes GROUP BY estado ORDER BY total DESC`);
}

export type EvolucionServicio = { servicio: string; puntos: { mes: string; cantidad: number }[] };

/**
 * A diferencia de obtenerAceptacionServiciosPorMes (que da el top 5 DE CADA
 * mes, un conjunto que cambia mes a mes), esto fija un cohorte único — el
 * top de servicios del período completo — y trae su evolución mes a mes,
 * con 0 en los meses sin actividad. Pensado específicamente para una
 * gráfica de líneas: mismas líneas de punta a punta, sin altas/bajas del
 * propio conjunto de series.
 */
export async function obtenerEvolucionTopServicios(meses = 6, top = 5): Promise<EvolucionServicio[]> {
  const db = await getDatabase();
  const filas = await db.getAllAsync<{ mes: string; servicio: string; cantidad: number }>(
    `WITH top AS (
       SELECT COALESCE(os.descripcion,'Sin descripción') servicio, SUM(os.cantidad) total
       FROM orden_servicios os JOIN ordenes o ON o.id=os.ordenId
       WHERE o.estado IN ${REVENUE_STATES}
         AND substr(COALESCE(NULLIF(o.fechaReporte,''),o.creadoEn),1,7) >= substr(strftime('%Y-%m','now','-' || ? || ' months'),1,7)
       GROUP BY os.servicioId, os.descripcion ORDER BY total DESC LIMIT ?
     )
     SELECT substr(COALESCE(NULLIF(o.fechaReporte,''),o.creadoEn),1,7) mes,
            COALESCE(os.descripcion,'Sin descripción') servicio,
            SUM(os.cantidad) cantidad
     FROM orden_servicios os JOIN ordenes o ON o.id=os.ordenId
     WHERE o.estado IN ${REVENUE_STATES}
       AND COALESCE(os.descripcion,'Sin descripción') IN (SELECT servicio FROM top)
       AND substr(COALESCE(NULLIF(o.fechaReporte,''),o.creadoEn),1,7) >= substr(strftime('%Y-%m','now','-' || ? || ' months'),1,7)
     GROUP BY mes, servicio ORDER BY mes ASC`,
    meses, top, meses
  );

  const mesesOrdenados: string[] = Array.from(new Set<string>(filas.map((f) => f.mes))).sort();
  const porServicio = new Map<string, Map<string, number>>();
  for (const f of filas) {
    if (!porServicio.has(f.servicio)) porServicio.set(f.servicio, new Map());
    porServicio.get(f.servicio)!.set(f.mes, f.cantidad);
  }
  return Array.from(porServicio.entries()).map(([servicio, porMes]) => ({
    servicio,
    puntos: mesesOrdenados.map((mes) => ({ mes, cantidad: porMes.get(mes) ?? 0 })),
  }));
}
