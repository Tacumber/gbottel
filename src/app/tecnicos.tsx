import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { actualizarTecnico, crearTecnico, eliminarTecnico, listarTecnicos, reactivarTecnico } from '@/services/tecnicosService';
import type { Tecnico } from '@/types/tecnicos.types';

const empty = () => ({
  id: null as number | null,
  nombre: '', ci: '', cargo: '', telefono: '', correo: '',
  salarioBasico: '0', aportesONAT: '0', planMensualCUP: '0', activo: true,
});

type Form = ReturnType<typeof empty>;

function Campo({
  label,
  value,
  onChangeText,
  num,
  theme,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  num?: boolean;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={num ? 'numeric' : 'default'}
        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
      />
    </View>
  );
}

export default function TecnicosScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ nombre?: string; cargo?: string; ci?: string; desdeOrden?: string }>();
  const parametrosProcesados = useRef(false);
  const desdeOrden = params.desdeOrden === '1';
  const [rows, setRows] = useState<Tecnico[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inactive, setInactive] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(empty());

  const cargar = useCallback(async () => {
    setLoading(true);
    try { setRows(await listarTecnicos({ incluirInactivos: inactive })); }
    catch (error) { Alert.alert('Técnicos', error instanceof Error ? error.message : String(error)); }
    finally { setLoading(false); }
  }, [inactive]);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  useEffect(() => {
    if (parametrosProcesados.current || !desdeOrden) return;
    if (!params.nombre && !params.cargo && !params.ci) return;
    parametrosProcesados.current = true;
    setForm({ ...empty(), nombre: params.nombre ?? '', cargo: params.cargo ?? '', ci: params.ci ?? '' });
    setOpen(true);
  }, [desdeOrden, params.cargo, params.ci, params.nombre]);

  function editar(t: Tecnico) {
    setForm({
      id: t.id, nombre: t.nombre, ci: t.ci, cargo: t.cargo,
      telefono: t.telefono ?? '', correo: t.correo ?? '',
      salarioBasico: String(t.salarioBasico ?? 0), aportesONAT: String(t.aportesONAT ?? 0),
      planMensualCUP: String(t.planMensualCUP ?? 0),
      activo: t.estado === 'activo',
    });
    setOpen(true);
  }

  async function guardar() {
    if (!form.nombre.trim() || !form.cargo.trim() || !form.ci.trim()) {
      Alert.alert('Datos incompletos', 'Nombre y apellidos, cargo y CI son obligatorios.');
      return;
    }
    setSaving(true);
    try {
      const datos = {
        nombre: form.nombre.trim(), cargo: form.cargo.trim(), ci: form.ci.trim(),
        telefono: form.telefono.trim() || null, correo: form.correo.trim() || null,
        salarioBasico: Number(form.salarioBasico) || 0, aportesONAT: Number(form.aportesONAT) || 0,
        planMensualCUP: Number(form.planMensualCUP) || 0,
        estado: form.activo ? 'activo' : 'inactivo',
      } as const;
      if (form.id) await actualizarTecnico(form.id, datos);
      else await crearTecnico(datos);
      setOpen(false);
      await cargar();
      if (desdeOrden && !form.id) router.back();
    } catch (error) {
      Alert.alert('No se pudo guardar', error instanceof Error ? error.message : String(error));
    } finally { setSaving(false); }
  }

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <ThemedView style={styles.flex}>
        <View style={[styles.header,{alignItems:'flex-start'}]}>
          <View>
            <ThemedText type="title" style={styles.title}>Técnicos</ThemedText>
            <ThemedText themeColor="textSecondary">{rows.length} registrados en la vista</ThemedText>
          </View>
          <Pressable onPress={() => { setForm(empty()); setOpen(true); }}>
            <ThemedView type="primary" style={styles.new}><ThemedText style={[styles.white,styles.newIcon]}>+</ThemedText></ThemedView>
          </Pressable>
        </View>

        <Pressable onPress={() => setInactive((v) => !v)} style={styles.toggle}>
          <View style={[styles.box, { borderColor: theme.border }, inactive && { backgroundColor: theme.primary, borderColor: theme.primary }]} />
          <ThemedText type="small" themeColor="textSecondary">Mostrar inactivos</ThemedText>
        </Pressable>

        <ScrollView contentContainerStyle={styles.list}>
          {open && (
            <ThemedView type="surface" style={[styles.form, { borderColor: theme.primary }]}>
              <ThemedText type="title" style={{ fontSize: 20 }}>{form.id ? 'Editar técnico' : 'Nuevo técnico'}</ThemedText>
              <Campo label="Nombre y apellidos *" value={form.nombre} onChangeText={(v) => setForm((p) => ({ ...p, nombre: v }))} theme={theme} />
              <Campo label="Cargo *" value={form.cargo} onChangeText={(v) => setForm((p) => ({ ...p, cargo: v }))} theme={theme} />
              <Campo label="CI *" value={form.ci} onChangeText={(v) => setForm((p) => ({ ...p, ci: v }))} theme={theme} />
              <View style={styles.two}>
                <Campo label="Teléfono" value={form.telefono} onChangeText={(v) => setForm((p) => ({ ...p, telefono: v }))} theme={theme} />
                <Campo label="Correo" value={form.correo} onChangeText={(v) => setForm((p) => ({ ...p, correo: v }))} theme={theme} />
              </View>
              <Campo label="Salario básico / escala (CUP)" value={form.salarioBasico} onChangeText={(v) => setForm((p) => ({ ...p, salarioBasico: v }))} num theme={theme} />
              <Campo label="Aportes a la ONAT (CUP)" value={form.aportesONAT} onChangeText={(v) => setForm((p) => ({ ...p, aportesONAT: v }))} num theme={theme} />
              <Campo label="Meta / plan mensual (CUP)" value={form.planMensualCUP} onChangeText={(v) => setForm((p) => ({ ...p, planMensualCUP: v }))} num theme={theme} />
              <Pressable onPress={() => setForm((p) => ({ ...p, activo: !p.activo }))} style={styles.toggle}>
                <View style={[styles.box, { borderColor: theme.border }, form.activo && { backgroundColor: theme.success, borderColor: theme.success }]} />
                <ThemedText>Activo</ThemedText>
              </Pressable>
              <View style={styles.formBtns}>
                <Pressable onPress={() => setOpen(false)}><ThemedText themeColor="textSecondary">Cancelar</ThemedText></Pressable>
                <Pressable onPress={() => void guardar()} disabled={saving}>
                  <ThemedView type="primary" style={styles.save}>{saving ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.white}>Guardar</ThemedText>}</ThemedView>
                </Pressable>
              </View>
            </ThemedView>
          )}

          {!loading && rows.map((t) => (
            <ThemedView key={t.id} type="surface" style={[styles.card, { borderColor: theme.border }]}>
              <Pressable onPress={() => editar(t)} style={{ flex: 1 }}>
                <ThemedText type="smallBold">{t.nombre}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{t.cargo} · CI {t.ci}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Salario básico {t.salarioBasico || 0} CUP · ONAT {t.aportesONAT || 0} CUP · Meta {t.planMensualCUP || 0} CUP · {t.telefono || 'sin teléfono'}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{t.correo || 'sin correo'}</ThemedText>
              </Pressable>
              {t.estado === 'activo' ? (
                <Pressable onPress={async () => { await eliminarTecnico(t.id); await cargar(); }}>
                  <ThemedText style={{ color: theme.danger }}>Dar de baja</ThemedText>
                </Pressable>
              ) : (
                <Pressable onPress={async () => { await reactivarTecnico(t.id); await cargar(); }}>
                  <ThemedText style={{ color: theme.primary }}>Reactivar</ThemedText>
                </Pressable>
              )}
            </ThemedView>
          ))}
          {!loading && !rows.length && <View style={styles.empty}><ThemedText themeColor="textSecondary">No hay técnicos registrados.</ThemedText></View>}
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.four, paddingBottom: Spacing.two },
  title: { fontSize: 27 }, new: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, newIcon: { fontSize: 22, lineHeight: 24 }, white: { color: '#fff', fontWeight: '700' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.four, paddingVertical: 8 }, box: { width: 18, height: 18, borderWidth: 2, borderRadius: 4 },
  list: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: 10 }, form: { padding: 16, borderWidth: 2, borderRadius: 12, gap: 10 }, field: { flex: 1, gap: 4 }, input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  two: { flexDirection: 'row', gap: 8 }, formBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 18, alignItems: 'center', marginTop: 6 }, save: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  card: { padding: 14, borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 10, alignItems: 'center' }, empty: { padding: 30, alignItems: 'center' },
});
