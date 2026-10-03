import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppTabs } from '@/components/app-tabs';
import { initDatabase } from '@/database/db';
import serviciosSeed from '@/data/servicios_seed.json';
import { contarServicios, importarServiciosDesdeJSON } from '@/services/tarifarioService';
import type { NuevoServicio } from '@/types/tarifario.types';

// La pantalla nativa de Expo es la única splash que usamos. Evitamos un
// segundo overlay basado en expo-image/Animated porque el fallo actual se
// produce justo en la transición splash -> React y queremos minimizar al
// máximo la superficie nativa durante el arranque.
SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ duration: 350, fade: true });

type StartupState =
  | { status: 'loading'; message: string }
  | { status: 'ready' }
  | { status: 'error'; message: string };

function errorToMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : 'Error desconocido durante el arranque.';
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [startup, setStartup] = useState<StartupState>({
    status: 'loading',
    message: 'Inicializando base de datos…',
  });

  const prepararApp = useCallback(async () => {
    try {
      setStartup({ status: 'loading', message: 'Inicializando base de datos…' });
      console.warn('[GBOTtel] startup: initDatabase:start');
      await initDatabase();
      console.warn('[GBOTtel] startup: initDatabase:ok');

      const total = await contarServicios();
      console.warn(`[GBOTtel] startup: servicios=${total}`);

      if (total === 0) {
        setStartup({ status: 'loading', message: 'Cargando catálogo de servicios…' });
        const resultado = await importarServiciosDesdeJSON(
          serviciosSeed as unknown as NuevoServicio[]
        );
        console.warn(
          `[GBOTtel] startup: importación completada importados=${resultado.importados} duplicados=${resultado.duplicados} errores=${resultado.errores.length}`
        );

        if (resultado.importados === 0 && resultado.errores.length > 0) {
          throw new Error(
            `No se pudo cargar el catálogo inicial. ${resultado.errores[0]}`
          );
        }
      }

      console.warn('[GBOTtel] startup: ready');
      setStartup({ status: 'ready' });
    } catch (error) {
      console.error('[GBOTtel] startup: fatal', error);
      setStartup({ status: 'error', message: errorToMessage(error) });
    }
  }, []);

  useEffect(() => {
    void prepararApp();
  }, [prepararApp]);

  useEffect(() => {
    if (startup.status === 'ready' || startup.status === 'error') {
      SplashScreen.hideAsync().catch((error) =>
        console.warn('[GBOTtel] splash hide failed:', error)
      );
    }
  }, [startup.status]);

  const theme = colorScheme === 'dark' ? DarkTheme : DefaultTheme;

  return (
    <ErrorBoundary>
      <ThemeProvider value={theme}>
      {startup.status === 'ready' ? (
        <AppTabs />
      ) : (
        <StartupScreen state={startup} onRetry={prepararApp} />
      )}
      </ThemeProvider>
    </ErrorBoundary>
  );
}

function StartupScreen({
  state,
  onRetry,
}: {
  state: StartupState;
  onRetry: () => Promise<void>;
}) {
  const error = state.status === 'error';
  const message = state.status === 'ready' ? '' : state.message;

  return (
    <View style={styles.container}>
      {error ? null : <ActivityIndicator size="large" />}
      <Text style={styles.title}>{error ? 'No se pudo iniciar GBOTtel' : 'Iniciando GBOTtel…'}</Text>
      <Text style={styles.message}>
        {message}
      </Text>
      {error ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void onRetry()}
          style={styles.retry}
        >
          <Text style={styles.retryText}>Reintentar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F5F5F5',
  },
  title: {
    marginTop: 16,
    fontSize: 22,
    fontWeight: '700',
    color: '#111111',
    textAlign: 'center',
  },
  message: {
    marginTop: 8,
    maxWidth: 520,
    fontSize: 14,
    lineHeight: 20,
    color: '#5A5A5A',
    textAlign: 'center',
  },
  retry: {
    marginTop: 20,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#B11226',
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
