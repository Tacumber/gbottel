import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { APP_NAME } from '@/theme/tokens';
import { useTheme } from '@/hooks/use-theme';
import { router } from 'expo-router';
import { aplicarRespaldo, exportarRespaldoCompleto, prepararRespaldo, resetearBaseDeDatos, type PreparacionRespaldo } from '@/services/respaldoService';
import { contarServicios, importarServiciosDesdeJSON } from '@/services/tarifarioService';
import serviciosSeed from '@/data/servicios_seed.json';
import type { NuevoServicio } from '@/types/tarifario.types';

export default function AjustesScreen() {
  const theme = useTheme();
  const [procesando, setProcesando] = useState<'exportar' | 'importar' | null>(null);

  async function exportar() {
    setProcesando('exportar');
    try {
      await exportarRespaldoCompleto();
    } catch (err) {
      Alert.alert('No se pudo exportar', err instanceof Error ? err.message : String(err));
    } finally {
      setProcesando(null);
    }
  }

  async function elegirRespaldo() {
    setProcesando('importar');
    try {
      const prep = await prepararRespaldo();
      if (prep) confirmarImportar(prep);
    } catch (err) {
      Alert.alert('Respaldo no válido', err instanceof Error ? err.message : String(err));
    } finally {
      setProcesando(null);
    }
  }

  function confirmarImportar(prep: PreparacionRespaldo) {
    const r = prep.resumen;
    Alert.alert(
      'Importar respaldo',
      `El archivo (v${r.version}) tiene ${r.ordenesEnArchivo} orden(es) y ${r.tecnicosEnArchivo} técnico(s).\n\n` +
        `REEMPLAZA los datos de este dispositivo (${r.ordenesLocalesQueSeReemplazan} orden(es) locales, técnicos, tarifario).\n\n` +
        `Folios: no se renumera nada. Los folios ya emitidos aquí se conservan y no se reutilizan (${r.foliosNuevosParaElLibro} nuevo(s) se suman al libro). ` +
        `Bloques: ${r.rangosCoincidentes} coincidente(s), ${r.rangosNuevos} nuevo(s), ${r.rangosSoloLocales} solo locales (se conservan). ¿Seguro?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sí, reemplazar', style: 'destructive', onPress: () => void importar(prep) },
      ]
    );
  }

  function confirmarReset() {
    Alert.alert('Restablecer de fábrica', 'Se eliminarán todas las órdenes, técnicos, configuraciones y datos operativos. El tarifario también volverá al catálogo inicial. Los folios ya emitidos y los rangos se conservan (no se reutilizan). Esta acción no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sí, restablecer', style: 'destructive', onPress: async () => {
        setProcesando('importar');
        try {
          await resetearBaseDeDatos();
          const total = await contarServicios();
          if (total === 0) await importarServiciosDesdeJSON(serviciosSeed as unknown as NuevoServicio[]);
          Alert.alert('Listo', 'GBOTtel fue restablecido a su estado inicial.');
        } catch (err) { Alert.alert('No se pudo restablecer', err instanceof Error ? err.message : String(err)); }
        finally { setProcesando(null); }
      } },
    ]);
  }

  async function importar(prep: PreparacionRespaldo) {
    setProcesando('importar');
    try {
      await aplicarRespaldo(prep);
      Alert.alert('Listo', 'La base se reemplazó con el respaldo importado. Los folios no se renumeraron.');
    } catch (err) {
      Alert.alert('No se pudo importar', err instanceof Error ? err.message : String(err));
    } finally {
      setProcesando(null);
    }
  }

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <ThemedView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.contenido}>
          <View style={styles.header}>
            <ThemedText type="title" style={styles.titulo}>
              Ajustes
            </ThemedText>
            <ThemedText themeColor="textSecondary">{APP_NAME}</ThemedText>
          </View>

          <ThemedView type="surface" style={[styles.seccion, { borderColor: theme.border }]}>
            <ThemedText type="smallBold">Rangos de folios</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.descripcion}>
              Cada técnico principal emite folios de los bloques que le asignes. Un folio emitido no se cambia ni se reutiliza.
            </ThemedText>
            <Pressable onPress={() => router.push('/folios')}>
              <ThemedView type="primary" style={styles.boton}>
                <ThemedText style={styles.botonTexto}>Administrar rangos de folios</ThemedText>
              </ThemedView>
            </Pressable>
          </ThemedView>

          <ThemedView type="surface" style={[styles.seccion, { borderColor: theme.border }]}>
            <ThemedText type="smallBold">Respaldo completo</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.descripcion}>
              Exportá todo lo que hay en este dispositivo (tarifario, órdenes, técnicos) en un archivo para
              compartirlo con la brigada. Al importar, reemplaza todo lo local — no fusiona el trabajo de varios
              técnicos a la vez.
            </ThemedText>

            <Pressable onPress={exportar} disabled={procesando !== null}>
              <ThemedView type="primary" style={styles.boton}>
                {procesando === 'exportar' ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <ThemedText style={styles.botonTexto}>Exportar respaldo completo</ThemedText>
                )}
              </ThemedView>
            </Pressable>

            <Pressable onPress={() => void elegirRespaldo()} disabled={procesando !== null}>
              <View style={[styles.botonSecundario, { borderColor: theme.danger }]}>
                {procesando === 'importar' ? (
                  <ActivityIndicator color={theme.danger} />
                ) : (
                  <ThemedText style={{ color: theme.danger, fontWeight: '700' }}>
                    Importar respaldo (reemplaza todo)
                  </ThemedText>
                )}
              </View>
            </Pressable>
          </ThemedView>

          <ThemedView type="surface" style={[styles.seccion, { borderColor: theme.border }]}>
            <ThemedText type="smallBold">Mantenimiento</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.descripcion}>Restablece los datos operativos del dispositivo. Haz un respaldo antes de usar esta opción.</ThemedText>
            <Pressable onPress={confirmarReset} disabled={procesando !== null}>
              <View style={[styles.botonSecundario, { borderColor: theme.danger }]}>
                <ThemedText style={{ color: theme.danger, fontWeight: '700' }}>Restablecer de fábrica</ThemedText>
              </View>
            </Pressable>
          </ThemedView>

          <ThemedView type="surface" style={[styles.seccion, { borderColor: theme.border }]}>
            <ThemedText type="smallBold">Solo el tarifario</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.descripcion}>
              Para actualizar o compartir el catálogo de precios sin tocar órdenes ni técnicos, usá “Exportar
              JSON” / “Importar JSON” directamente en la pantalla de Tarifario.
            </ThemedText>
          </ThemedView>
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  contenido: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  header: { gap: 2, marginBottom: Spacing.two },
  titulo: { fontSize: 28, lineHeight: 32 },
  seccion: { borderRadius: Spacing.three, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.three, gap: Spacing.two },
  descripcion: { lineHeight: 18 },
  boton: { borderRadius: Spacing.two, padding: Spacing.three, alignItems: 'center', marginTop: Spacing.one },
  botonTexto: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  botonSecundario: { borderWidth: 1.5, borderRadius: Spacing.two, padding: Spacing.three, alignItems: 'center' },
});
