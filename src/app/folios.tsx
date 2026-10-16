import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  asignarRango,
  eliminarRangoSinUsar,
  formatearFolio,
  guardarUmbralAviso,
  listarRangos,
  obtenerUmbralAviso,
  vincularRango,
  type RangoFolios,
} from '@/services/foliosService';
import { listarTecnicos } from '@/services/tecnicosService';
import type { Tecnico } from '@/types/tecnicos.types';

export default function FoliosScreen() {
  const theme = useTheme();
  const [rangos, setRangos] = useState<RangoFolios[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [umbral, setUmbral] = useState('10');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [tecnicoId, setTecnicoId] = useState<number | null>(null);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [r, t, u] = await Promise.all([listarRangos(), listarTecnicos(), obtenerUmbralAviso()]);
      setRangos(r);
      setTecnicos(t);
      setUmbral(String(u));
    } catch (e) {
      Alert.alert('No se pudieron cargar los rangos', e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  async function ejecutar(fn: () => Promise<void>, titulo: string) {
    if (guardando) return;
    setGuardando(true);
    try {
      await fn();
      await cargar();
    } catch (e) {
      Alert.alert(titulo, e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  const asignar = () => {
    if (tecnicoId == null) { Alert.alert('Falta el técnico', 'Elige el técnico principal al que se asigna el bloque.'); return; }
    const d = Number(desde);
    const h = Number(hasta);
    void ejecutar(async () => {
      await asignarRango(tecnicoId, d, h);
      setDesde('');
      setHasta('');
    }, 'No se pudo asignar el rango');
  };

  const quitar = (r: RangoFolios) =>
    Alert.alert('Quitar bloque', `Se quita el bloque ${formatearFolio(r.desde)}–${formatearFolio(r.hasta)} (no ha emitido ningún folio).`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: () => void ejecutar(() => eliminarRangoSinUsar(r.id), 'No se pudo quitar') },
    ]);

  const vincular = (r: RangoFolios) => {
    if (!tecnicos.length) { Alert.alert('Sin técnicos', 'Crea o reactiva primero un técnico.'); return; }
    Alert.alert(
      'Vincular bloque',
      `¿A qué técnico pertenece el bloque ${formatearFolio(r.desde)}–${formatearFolio(r.hasta)}${r.tecnicoNombre ? ` (antes: ${r.tecnicoNombre})` : ''}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        ...tecnicos.slice(0, 8).map((t) => ({ text: t.nombre, onPress: () => void ejecutar(() => vincularRango(r.id, t.id), 'No se pudo vincular') })),
      ]
    );
  };

  const guardarUmbral = () =>
    void ejecutar(() => guardarUmbralAviso(Number(umbral)), 'Umbral no válido');

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <ThemedView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()}>
            <ThemedText type="small" style={{ color: theme.primary }}>‹ Volver</ThemedText>
          </Pressable>
          <ThemedText type="title" style={styles.titulo}>Rangos de folios</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.descripcion}>
            Cada orden toma su folio del bloque de su técnico principal. Un folio emitido nunca se cambia ni se reutiliza,
            aunque la orden se elimine. Si dos dispositivos reciben bloques que se solapan, GBOTtel no puede detectarlo
            desde aquí: reparte los bloques sin solaparlos.
          </ThemedText>

          <ThemedView type="surface" style={[styles.seccion, { borderColor: theme.border }]}>
            <ThemedText type="smallBold">Asignar bloque</ThemedText>
            <View style={styles.chips}>
              {tecnicos.map((t) => (
                <Pressable key={t.id} onPress={() => setTecnicoId(t.id)}>
                  <View style={[styles.chip, { borderColor: theme.border, backgroundColor: tecnicoId === t.id ? theme.primary : theme.surface }]}>
                    <ThemedText type="small" style={{ color: tecnicoId === t.id ? '#fff' : theme.text }}>{t.nombre}</ThemedText>
                  </View>
                </Pressable>
              ))}
              {!tecnicos.length && <ThemedText type="small" themeColor="textSecondary">No hay técnicos activos.</ThemedText>}
            </View>
            <View style={styles.fila}>
              <TextInput value={desde} onChangeText={setDesde} keyboardType="numeric" placeholder="Desde" placeholderTextColor={theme.textMuted}
                style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]} />
              <TextInput value={hasta} onChangeText={setHasta} keyboardType="numeric" placeholder="Hasta" placeholderTextColor={theme.textMuted}
                style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]} />
            </View>
            <Pressable onPress={asignar} disabled={guardando}>
              <ThemedView type="primary" style={styles.boton}>
                {guardando ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.botonTexto}>Asignar</ThemedText>}
              </ThemedView>
            </Pressable>
          </ThemedView>

          <ThemedView type="surface" style={[styles.seccion, { borderColor: theme.border }]}>
            <ThemedText type="smallBold">Aviso de folios por agotarse</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">Se avisa cuando a un técnico le quedan este número de folios o menos.</ThemedText>
            <View style={styles.fila}>
              <TextInput value={umbral} onChangeText={setUmbral} keyboardType="numeric"
                style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]} />
              <Pressable onPress={guardarUmbral} disabled={guardando} style={[styles.botonSec, { borderColor: theme.primary }]}>
                <ThemedText type="small" style={{ color: theme.primary }}>Guardar</ThemedText>
              </Pressable>
            </View>
          </ThemedView>

          <ThemedText type="smallBold">Bloques</ThemedText>
          {cargando && <ActivityIndicator color={theme.primary} />}
          {!cargando && !rangos.length && (
            <ThemedText type="small" themeColor="textSecondary">Aún no hay bloques. Sin un bloque no se pueden crear órdenes nuevas.</ThemedText>
          )}
          {rangos.map((r) => {
            const agotado = r.restantes <= 0;
            return (
              <ThemedView key={r.id} type="surface" style={[styles.seccion, { borderColor: agotado ? theme.danger : theme.border }]}>
                <ThemedText type="smallBold">{formatearFolio(r.desde)} – {formatearFolio(r.hasta)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {r.historico ? 'Histórico (folios anteriores a esta versión)' : r.tecnicoId == null ? `Sin técnico vinculado${r.tecnicoNombre ? ` (antes: ${r.tecnicoNombre})` : ''}` : r.tecnicoNombre}
                  {r.tecnicoEstado === 'inactivo' ? ' · técnico inactivo' : ''}
                </ThemedText>
                <ThemedText type="small" style={{ color: agotado ? theme.danger : theme.text }}>
                  {r.historico ? 'No emite folios nuevos' : agotado ? 'Agotado' : `Siguiente ${formatearFolio(r.siguiente)} · quedan ${r.restantes}`}
                </ThemedText>
                {!r.historico && r.tecnicoId == null && (
                  <Pressable onPress={() => vincular(r)}><ThemedText type="small" style={{ color: theme.primary }}>Vincular a un técnico</ThemedText></Pressable>
                )}
                {!r.historico && r.siguiente === r.desde && (
                  <Pressable onPress={() => quitar(r)}><ThemedText type="small" style={{ color: theme.danger }}>Quitar bloque sin usar</ThemedText></Pressable>
                )}
              </ThemedView>
            );
          })}
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  contenido: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  titulo: { fontSize: 28, lineHeight: 32 },
  descripcion: { lineHeight: 18 },
  seccion: { borderRadius: Spacing.three, borderWidth: 1, padding: Spacing.three, gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  fila: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  boton: { borderRadius: Spacing.two, padding: Spacing.three, alignItems: 'center' },
  botonTexto: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  botonSec: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center' },
});
