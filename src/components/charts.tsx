import Svg, { Circle, G, Line, Path, Polyline, Rect, Text as SvgText } from "react-native-svg";
import { View, StyleSheet } from "react-native";

import { ThemedText } from "@/components/themed-text";

const VB_W = 300;

function truncar(texto: string, largo: number): string {
  return texto.length > largo ? `${texto.slice(0, largo - 1)}…` : texto;
}

function polarACartesiano(cx: number, cy: number, r: number, angulo: number) {
  const rad = ((angulo - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function trazoSector(cx: number, cy: number, r: number, desde: number, hasta: number): string {
  const inicio = polarACartesiano(cx, cy, r, hasta);
  const fin = polarACartesiano(cx, cy, r, desde);
  const arcoGrande = hasta - desde > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${inicio.x} ${inicio.y} A ${r} ${r} 0 ${arcoGrande} 0 ${fin.x} ${fin.y} Z`;
}

/** Pastel con leyenda de color debajo. Un solo dato se dibuja como
 * círculo completo aparte: el cálculo de arco normal degenera cuando el
 * punto de inicio y fin coinciden (0° y 360° son el mismo punto). */
export function PieChart({
  data,
  colors,
  height = 170,
}: {
  data: { label: string; value: number }[];
  colors: string[];
  height?: number;
}) {
  if (!data.length) return null;
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return null;
  const r = height / 2 - 4;
  const cx = height / 2;
  const cy = height / 2;

  let acumulado = 0;
  const sectores =
    data.length === 1
      ? null
      : data.map((d, i) => {
          const desde = acumulado;
          const grados = (d.value / total) * 360;
          acumulado += grados;
          return { path: trazoSector(cx, cy, r, desde, desde + grados), color: colors[i % colors.length] };
        });

  return (
    <View>
      <Svg width={height} height={height} viewBox={`0 0 ${height} ${height}`} style={{ alignSelf: "center" }}>
        {sectores
          ? sectores.map((s, i) => <Path key={i} d={s.path} fill={s.color} />)
          : <Circle cx={cx} cy={cy} r={r} fill={colors[0]} />}
      </Svg>
      <View style={styles.leyenda}>
        {data.map((d, i) => (
          <View key={d.label} style={styles.leyendaItem}>
            <View style={[styles.punto, { backgroundColor: colors[i % colors.length] }]} />
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.leyendaTexto}>
              {truncar(d.label, 18)} · {Math.round((d.value / total) * 100)}%
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Gráfica de barras verticales, con la etiqueta debajo de cada barra. */
export function BarChartVertical({
  data,
  color,
  labelColor,
  height = 150,
  formatValue,
}: {
  data: { label: string; value: number }[];
  color: string;
  labelColor: string;
  height?: number;
  formatValue?: (n: number) => string;
}) {
  if (!data.length) return null;
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;
  const gap = 8;
  const barW = (VB_W - gap * (n + 1)) / n;
  const chartH = height - 34;
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${VB_W} ${height}`}>
      {data.map((d, i) => {
        const h = (d.value / max) * (chartH - 18);
        const x = gap + i * (barW + gap);
        const y = chartH - h;
        return (
          <G key={`${d.label}-${i}`}>
            <Rect x={x} y={y} width={barW} height={Math.max(2, h)} rx={4} fill={color} />
            <SvgText x={x + barW / 2} y={Math.max(10, y - 6)} fontSize={11} fontWeight="600" fill={color} textAnchor="middle">
              {formatValue ? formatValue(d.value) : String(d.value)}
            </SvgText>
            <SvgText x={x + barW / 2} y={chartH + 16} fontSize={11} fontWeight="600" fill={labelColor} textAnchor="middle">
              {d.label}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

/** Ranking en barras horizontales — etiqueta arriba, barra + valor abajo. */
export function BarChartHorizontal({
  data,
  color,
  labelColor,
  valueColor,
  truncarEn = 26,
  formatValue,
}: {
  data: { label: string; value: number }[];
  color: string;
  labelColor: string;
  valueColor: string;
  truncarEn?: number;
  formatValue?: (n: number) => string;
}) {
  if (!data.length) return null;
  const max = Math.max(1, ...data.map((d) => d.value));
  const rowH = 36;
  const height = data.length * rowH;
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${VB_W} ${height}`}>
      {data.map((d, i) => {
        const y = i * rowH;
        const w = (d.value / max) * (VB_W - 46);
        return (
          <G key={`${d.label}-${i}`}>
            <SvgText x={0} y={y + 10} fontSize={11} fontWeight="600" fill={labelColor}>
              {truncar(d.label, truncarEn)}
            </SvgText>
            <Rect x={0} y={y + 16} width={Math.max(3, w)} height={8} rx={4} fill={color} />
            <SvgText x={VB_W} y={y + 21} fontSize={11} fontWeight="600" fill={valueColor} textAnchor="end">
              {formatValue ? formatValue(d.value) : String(d.value)}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

/** Varias líneas sobre el mismo eje de meses, con leyenda de color debajo. */
export function LineChartMulti({
  series,
  months,
  colors,
  monthLabel,
  axisColor,
  height = 150,
}: {
  series: { label: string; values: number[] }[];
  months: string[];
  colors: string[];
  monthLabel: (mes: string) => string;
  axisColor: string;
  height?: number;
}) {
  if (!months.length || !series.length) return null;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const n = months.length;
  const chartH = height - 22;
  const stepX = n > 1 ? VB_W / (n - 1) : 0;
  const puntos = (values: number[]) =>
    values
      .map((v, i) => {
        const x = n > 1 ? i * stepX : VB_W / 2;
        const y = chartH - (v / max) * (chartH - 10);
        return `${x},${y}`;
      })
      .join(" ");
  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${VB_W} ${height}`}>
        <Line x1={0} y1={chartH} x2={VB_W} y2={chartH} stroke={axisColor} strokeWidth={1} />
        {series.map((s, i) => (
          <Polyline
            key={s.label}
            points={puntos(s.values)}
            fill="none"
            stroke={colors[i % colors.length]}
            strokeWidth={2}
          />
        ))}
        {months.map((m, i) => (
          <SvgText
            key={m}
            x={n > 1 ? i * stepX : VB_W / 2}
            y={height - 4}
            fontSize={11}
            fontWeight="600"
            fill={axisColor}
            textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
          >
            {monthLabel(m)}
          </SvgText>
        ))}
      </Svg>
      <View style={styles.leyenda}>
        {series.map((s, i) => (
          <View key={s.label} style={styles.leyendaItem}>
            <View style={[styles.punto, { backgroundColor: colors[i % colors.length] }]} />
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.leyendaTexto}>
              {truncar(s.label, 18)}
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Círculo de progreso estilo "carga del sistema". El porcentaje real
 * puede pasar 100 (técnico que superó el plan); el arco se recorta en
 * 100% pero el número en el centro muestra el valor real. */
export function CircularProgress({
  percent,
  size = 46,
  strokeWidth = 5,
  color,
  trackColor,
  textColor,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
  color: string;
  trackColor: string;
  textColor: string;
}) {
  const recortado = Math.max(0, Math.min(100, percent));
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circunferencia = 2 * Math.PI * r;
  const offset = circunferencia * (1 - recortado / 100);
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={cx} cy={cy} r={r} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={cx} cy={cy} r={r} stroke={color} strokeWidth={strokeWidth} fill="none"
          strokeDasharray={circunferencia} strokeDashoffset={offset} strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </Svg>
      <View style={styles.circularOverlay}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ThemedText style={{ fontSize: size * 0.24, fontWeight: "700", color: textColor }}>
            {Math.round(percent)}%
          </ThemedText>
        </View>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  circularOverlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  leyenda: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  leyendaItem: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: 120 },
  punto: { width: 8, height: 8, borderRadius: 4 },
  leyendaTexto: { flexShrink: 1 },
});
