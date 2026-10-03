import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  titulo: string;
  fase: string;
  descripcion: string;
};

/**
 * Placeholder honesto para las secciones cuyo esquema de base de datos ya
 * existe (ver database/schema.ts) pero todavía no tienen pantalla. A
 * propósito NO simula datos ni botones que no hacen nada — decir
 * claramente "todavía no está" es mejor que una pantalla que aparenta
 * funcionar y no hace nada al tocarla.
 */
export function EnConstruccion({ titulo, fase, descripcion }: Props) {
  const theme = useTheme();

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
      <ThemedView style={[styles.flex, styles.centrado]}>
        <View style={[styles.badge, { backgroundColor: theme.pendingBg }]}>
          <ThemedText type="small" style={{ color: theme.pending }}>
            {fase}
          </ThemedText>
        </View>
        <ThemedText type="title" style={styles.titulo}>
          {titulo}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.descripcion}>
          {descripcion}
        </ThemedText>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centrado: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.five,
    gap: Spacing.two,
  },
  badge: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 999,
    marginBottom: Spacing.two,
  },
  titulo: { fontSize: 24, lineHeight: 28, textAlign: 'center' },
  descripcion: { textAlign: 'center', lineHeight: 20, maxWidth: 320 },
});
