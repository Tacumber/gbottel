import { useState } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";

import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { formatearFecha } from "@/utils/fechas";

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function aFecha(iso: string): Date {
  if (!iso) return new Date();

  // Una fecha "YYYY-MM-DD" no debe pasar por new Date(string): JavaScript
  // la interpreta como UTC y en Cuba puede terminar mostrando el día anterior.
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (soloFecha) {
    const [, y, m, d] = soloFecha;
    const local = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(local.getTime()) ? new Date() : local;
  }

  // Los datetimes guardados por GBOTtel son locales: YYYY-MM-DD HH:mm.
  const d = new Date(iso.trim().replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function aTextoFecha(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function aTextoDateTime(d: Date): string {
  return `${aTextoFecha(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Campo de fecha con calendario nativo, vía
 * @react-native-community/datetimepicker.
 *
 * A propósito NO se usa @expo/ui acá. Su changelog de SDK 57 confirma que
 * arregló un crash real de "shared object ya liberado" en callbacks de
 * worklet (expo/expo#48819) — la misma familia de bug que ya costó tiempo
 * real en este proyecto (crash nativo por desalineación de
 * react-native-worklets). El fix parece legítimo y ya está en el SDK que
 * usa este proyecto, pero no hay forma de probarlo acá antes de que llegue
 * a un teléfono real, y el "premio" es puramente estético (Material 3 vs.
 * el diálogo clásico de Android). No vale la pena el riesgo residual en
 * una app de uso diario en el campo. Esta librería no toca worklets en
 * absoluto — arquitectura de módulo nativo clásica.
 *
 * Si en algún momento se quiere reconsiderar @expo/ui, este es el único
 * archivo que habría que tocar.
 */
export function CampoFecha({
  etiqueta,
  valorISO,
  modo,
  onCambia,
  style,
}: {
  etiqueta: string;
  valorISO: string;
  modo: "date" | "datetime";
  onCambia: (valor: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const [paso, setPaso] = useState<"cerrado" | "fecha" | "hora">("cerrado");
  const [pendiente, setPendiente] = useState<Date | null>(null);

  return (
    <View style={[styles.campo, style]}>
      <ThemedText type="small" themeColor="textSecondary">
        {etiqueta}
      </ThemedText>
      <Pressable onPress={() => setPaso("fecha")}>
        <View
          style={[
            styles.input,
            { backgroundColor: theme.background, borderColor: theme.border },
          ]}
        >
          <ThemedText style={!valorISO ? { color: theme.textMuted } : undefined}>
            {valorISO ? formatearFecha(valorISO, modo === "datetime") : modo === "datetime" ? "Elegir fecha y hora" : "Elegir fecha"}
          </ThemedText>
        </View>
      </Pressable>

      {paso === "fecha" && (
        <DateTimePicker
          value={aFecha(valorISO)}
          mode="date"
          display="default"
          onChange={(evento: DateTimePickerEvent, seleccionada?: Date) => {
            if (evento.type !== "set" || !seleccionada) {
              setPaso("cerrado");
              return;
            }
            if (modo === "date") {
              onCambia(aTextoFecha(seleccionada));
              setPaso("cerrado");
            } else {
              setPendiente(seleccionada);
              setPaso("hora");
            }
          }}
        />
      )}

      {paso === "hora" && pendiente && (
        <DateTimePicker
          value={pendiente}
          mode="time"
          display="default"
          is24Hour
          onChange={(evento: DateTimePickerEvent, seleccionada?: Date) => {
            setPaso("cerrado");
            if (evento.type !== "set" || !seleccionada) return;
            const combinada = new Date(pendiente);
            combinada.setHours(seleccionada.getHours(), seleccionada.getMinutes());
            onCambia(aTextoDateTime(combinada));
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  campo: { gap: 4 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
});
