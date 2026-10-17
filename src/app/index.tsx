import { Ionicons } from '@expo/vector-icons';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BarChartVertical, LineChartMulti } from '@/components/charts';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  obtenerEvolucionAceptacionServicios,
  obtenerEvolucionTopServicios,
  obtenerIngresosPorMes,
  obtenerResumenDashboard,
  obtenerUltimasOrdenes,
  type EvolucionServicio,
  type MesIngreso,
  type OrdenDashboard,
} from '@/services/analyticsService';

type IconName = keyof typeof Ionicons.glyphMap;
const money = (n: number, currency: 'CUP' | 'USD') =>
  new Intl.NumberFormat('es-CU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(n || 0);

const estado: Record<string, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  finalizada: 'Finalizada',
  facturada: 'Facturada',
};

const MESES_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const mesCorto = (m: string) => {
  const [, mm] = m.split('-');
  return MESES_ES[Number(mm) - 1] ?? m;
};

const SERIE_COLORES = ['#2f6fed', '#16a34a', '#d97706'];

function aSeries(data: EvolucionServicio[]) {
  return data.slice(0, 3).map((item) => ({
    label: item.servicio,
    values: item.puntos.map((p) => p.cantidad),
  }));
}

export default function TableroScreen() {
  const theme = useTheme();
  const [data, setData] = useState<Awaited<ReturnType<typeof obtenerResumenDashboard>> | null>(null);
  const [meses, setMeses] = useState<MesIngreso[]>([]);
  const [topServicios, setTopServicios] = useState<EvolucionServicio[]>([]);
  const [aceptacionServicios, setAceptacionServicios] = useState<EvolucionServicio[]>([]);
  const [ultimas, setUltimas] = useState<OrdenDashboard[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!data) setCargando(true);
    setErrorCarga(null);
    try {
      const [d, m, top, aceptacion, u] = await Promise.all([
        obtenerResumenDashboard(),
        obtenerIngresosPorMes(6),
        obtenerEvolucionTopServicios(6, 3),
        obtenerEvolucionAceptacionServicios(6, 3),
        obtenerUltimasOrdenes(10),
      ]);
      setData(d);
      setMeses(m);
      setTopServicios(top);
      setAceptacionServicios(aceptacion);
      setUltimas(u);
    } catch (error) {
      console.error('[GBOTtel] No se pudo cargar el tablero:', error);
      setErrorCarga(error instanceof Error ? error.message : 'No se pudo cargar el tablero.');
    } finally {
      setCargando(false);
    }
  }, [data]);

  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar]),
  );

  const mesesTop = topServicios[0]?.puntos.map((p) => p.mes) ?? [];
  const mesesAceptacion = aceptacionServicios[0]?.puntos.map((p) => p.mes) ?? [];

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <ThemedText type="title" style={styles.title}>Tablero</ThemedText>
            <ThemedText themeColor="textSecondary">
              Resumen operativo, facturación y comportamiento de servicios
            </ThemedText>
          </View>
        </View>

        {cargando && !data ? (
          <ActivityIndicator color={theme.primary} />
        ) : (
          <>
            {errorCarga ? (
              <ThemedView type="surface" style={[styles.card, { borderColor: theme.border }]}>
                <ThemedText type="smallBold" style={{ color: theme.danger }}>
                  No se pudo actualizar el tablero
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{errorCarga}</ThemedText>
              </ThemedView>
            ) : null}
            <View style={styles.grid}>
              <Stat
                icon="checkmark-done-outline"
                title="Órdenes completadas y facturadas"
                value={String(data?.ordenesCompletadasFacturadas ?? 0)}
                sub="Este mes"
              />
              <Stat
                icon="time-outline"
                title="Órdenes pendientes"
                value={String(data?.pendientes ?? 0)}
                sub="Pendientes solamente"
                accent
              />
              <Stat
                icon="cash-outline"
                title="Ingresos mensuales"
                value={money(data?.ingresoMesCUP ?? 0, 'CUP')}
                sub={money(data?.ingresoMesUSD ?? 0, 'USD')}
                accent
              />
              <Stat
                icon="construct-outline"
                title="Técnicos registrados"
                value={String(data?.tecnicosRegistrados ?? 0)}
                sub={`${data?.tecnicosActivos ?? 0} activos`}
              />
            </View>

            <ThemedView type="surface" style={[styles.card, { borderColor: theme.border }]}>
              <View style={styles.cardTitleRow}>
                <Ionicons name="flag-outline" size={16} color={theme.text} />
                <ThemedText type="smallBold">Plan mensual por técnico</ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                Meta mensual acumulada de los técnicos activos frente a la facturación del mes.
              </ThemedText>
              {data?.planMensualCUP ? (
                <>
                  <View style={[styles.barBg, { backgroundColor: theme.backgroundSelected }]}>
                    <View
                      style={[
                        styles.bar,
                        {
                          backgroundColor: (data.porcentajePlan ?? 0) >= 100 ? theme.success : theme.primary,
                          width: `${Math.min(100, data.porcentajePlan ?? 0)}%`,
                        },
                      ]}
                    />
                  </View>
                  <ThemedText
                    type="smallBold"
                    style={{ color: (data.porcentajePlan ?? 0) >= 100 ? theme.success : theme.primary }}
                  >
                    {(data.porcentajePlan ?? 0).toFixed(0)}% del plan · {money(data.ingresoMesCUP ?? 0, 'CUP')} de {money(data.planMensualCUP, 'CUP')}
                  </ThemedText>
                </>
              ) : (
                <ThemedText type="small" themeColor="textMuted">
                  Nadie tiene una meta configurada todavía.
                </ThemedText>
              )}
            </ThemedView>

            <ThemedView type="surface" style={[styles.card, { borderColor: theme.border }]}>
              <View style={styles.cardTitleRow}>
                <Ionicons name="bar-chart-outline" size={16} color={theme.text} />
                <ThemedText type="smallBold">Facturación por mes</ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                Finalizadas y facturadas · últimos {meses.length || 6} meses.
              </ThemedText>
              {meses.length ? (
                <BarChartVertical
                  data={meses.map((m) => ({ label: mesCorto(m.mes), value: m.cup }))}
                  color={theme.primary}
                  labelColor={theme.textSecondary}
                  height={170}
                  formatValue={(n) => money(n, 'CUP')}
                />
              ) : (
                <ThemedText type="small" themeColor="textMuted">Todavía no hay ingresos registrados.</ThemedText>
              )}
              <View style={[styles.anualRow, { borderTopColor: theme.border }]}>
                <ThemedText type="small" themeColor="textSecondary">Ingresos generales</ThemedText>
                <ThemedText type="smallBold">{money(data?.ingresoAnualCUP ?? 0, 'CUP')}</ThemedText>
              </View>
            </ThemedView>

            <View style={styles.sideBySide}>
              <ThemedView type="surface" style={[styles.card, styles.half, { borderColor: theme.border }]}>
                <View style={styles.cardTitleRow}>
                  <Ionicons name="trophy-outline" size={16} color={theme.text} />
                  <ThemedText type="smallBold">Top de servicios</ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  Evolución por cantidad solicitada.
                </ThemedText>
                {mesesTop.length && topServicios.length ? (
                  <LineChartMulti
                    series={aSeries(topServicios)}
                    months={mesesTop}
                    colors={SERIE_COLORES}
                    monthLabel={mesCorto}
                    axisColor={theme.textSecondary}
                    height={190}
                  />
                ) : (
                  <ThemedText type="small" themeColor="textMuted">Sin datos.</ThemedText>
                )}
              </ThemedView>

              <ThemedView type="surface" style={[styles.card, styles.half, { borderColor: theme.border }]}>
                <View style={styles.cardTitleRow}>
                  <Ionicons name="trending-up-outline" size={16} color={theme.text} />
                  <ThemedText type="smallBold">Servicios con mayor aceptación</ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  Evolución por número de órdenes que los incluyen.
                </ThemedText>
                {mesesAceptacion.length && aceptacionServicios.length ? (
                  <LineChartMulti
                    series={aSeries(aceptacionServicios)}
                    months={mesesAceptacion}
                    colors={SERIE_COLORES}
                    monthLabel={mesCorto}
                    axisColor={theme.textSecondary}
                    height={190}
                  />
                ) : (
                  <ThemedText type="small" themeColor="textMuted">Sin datos.</ThemedText>
                )}
              </ThemedView>
            </View>

            <ThemedView type="surface" style={[styles.card, { borderColor: theme.border }]}>
              <View style={styles.sectionHeader}>
                <ThemedText type="smallBold">Últimas 10 órdenes</ThemedText>
                <Link href="/ordenes">
                  <ThemedText type="small" style={{ color: theme.primary }}>Ver todas →</ThemedText>
                </Link>
              </View>
              <View style={styles.tableHeader}>
                <ThemedText type="smallBold" style={styles.colFolio}>Folio</ThemedText>
                <ThemedText type="smallBold" style={styles.colClient}>Cliente</ThemedText>
                <ThemedText type="smallBold" style={styles.colState}>Estado</ThemedText>
                <ThemedText type="smallBold" style={styles.colMoney}>CUP</ThemedText>
                <ThemedText type="smallBold" style={styles.colMoney}>USD</ThemedText>
              </View>
              {ultimas.map((o) => (
                <Link key={o.id} href={`/orden-nueva?id=${o.id}`} asChild>
                  <Pressable style={StyleSheet.flatten([styles.tableRow, { borderTopColor: theme.border }])}>
                    <ThemedText type="small" numberOfLines={1} style={styles.colFolio}>{o.folio}</ThemedText>
                    <ThemedText type="small" numberOfLines={1} style={styles.colClient}>{o.cliente}</ThemedText>
                    <ThemedText type="small" numberOfLines={1} style={styles.colState}>{estado[o.estado] ?? o.estado}</ThemedText>
                    <ThemedText type="small" style={styles.colMoney}>{money(o.totalCUP, 'CUP')}</ThemedText>
                    <ThemedText type="small" style={styles.colMoney}>{money(o.totalUSD, 'USD')}</ThemedText>
                  </Pressable>
                </Link>
              ))}
            </ThemedView>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({
  icon,
  title,
  value,
  sub,
  accent,
}: {
  icon: IconName;
  title: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  const theme = useTheme();
  return (
    <ThemedView type="surface" style={[styles.stat, { borderColor: theme.border }]}>
      <View style={styles.statTitleRow}>
        <Ionicons name={icon} size={16} color={theme.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>{title}</ThemedText>
      </View>
      <ThemedText type="title" style={[styles.statValue, accent && { color: theme.primary }]}>{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{sub}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 28, lineHeight: 32 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  stat: { width: '48%', minHeight: 112, padding: Spacing.three, borderRadius: Spacing.three, borderWidth: StyleSheet.hairlineWidth, gap: 4 },
  statTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statValue: { fontSize: 24, lineHeight: 30, marginTop: 2 },
  card: { padding: Spacing.three, borderRadius: Spacing.three, borderWidth: StyleSheet.hairlineWidth, gap: Spacing.two },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sideBySide: { flexDirection: 'row', gap: Spacing.two },
  half: { flex: 1, minWidth: 0 },
  barBg: { height: 10, borderRadius: 8, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 8 },
  anualRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, marginTop: 2, borderTopWidth: StyleSheet.hairlineWidth },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  tableHeader: { flexDirection: 'row', paddingBottom: 6 },
  tableRow: { flexDirection: 'row', paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  colFolio: { width: 58 },
  colClient: { flex: 1, minWidth: 0, paddingRight: 5 },
  colState: { width: 80 },
  colMoney: { width: 82, textAlign: 'right' },
});
