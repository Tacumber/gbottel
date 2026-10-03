import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { ColorValue, useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

/**
 * Navegador de pestañas ESTÁNDAR de expo-router (react-navigation/
 * bottom-tabs), no el "unstable-native-tabs" que se usaba antes.
 *
 * Se cambió por esto: un crash nativo reproducible en Expo Go, con
 * libworklets.so en el stack, sobrevivió a sacar por completo
 * react-native-reanimated/react-native-worklets del proyecto (verificado:
 * ni en package.json ni en node_modules). libworklets.so es parte del
 * propio binario de Expo Go, no del proyecto — así que lo que quedaba
 * como sospechoso era una feature que Expo Go implementa de forma
 * nativa. unstable-native-tabs es, literalmente por su nombre, la pieza
 * experimental que se dibuja primero al abrir la app.
 *
 * Los íconos habían quedado como símbolos de texto por un require() de
 * PNG que fallaba de forma intermitente en las pruebas de entonces. Acá
 * se pasa a @expo/vector-icons (Ionicons) en vez de eso: es una sola
 * tipografía de íconos cargada una vez por expo-font, no un require()
 * por ícono — arquitectura distinta a la que falló, y es el paquete que
 * ya viene incluido con Expo (cero plugin de configuración, cero cambio
 * al build nativo). Ojo: Expo anunció que @expo/vector-icons va a
 * quedar deprecado a favor de @react-native-vector-icons — se eligió
 * igual por ahora porque no toca el build nativo, que es justo la parte
 * que ya dio problemas acá antes. Si el día de mañana hay que migrar,
 * es este archivo nada más.
 */
const ICONOS = {
  tablero: 'grid-outline',
  tarifario: 'pricetags-outline',
  ordenes: 'clipboard-outline',
  tecnicos: 'construct-outline',
  reportes: 'stats-chart-outline',
  ajustes: 'settings-outline',
} as const;

export function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  const icono = (nombre: keyof typeof ICONOS) =>
    function TabIcon({ color }: { focused: boolean; color: ColorValue; size: number }) {
      return <Ionicons name={ICONOS[nombre]} size={22} color={color} />;
    };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Tablero', tabBarIcon: icono('tablero') }} />
      <Tabs.Screen name="tarifario" options={{ title: 'Tarifario', tabBarIcon: icono('tarifario') }} />
      <Tabs.Screen name="ordenes" options={{ title: 'Órdenes', tabBarIcon: icono('ordenes') }} />
      <Tabs.Screen name="tecnicos" options={{ title: 'Técnicos', tabBarIcon: icono('tecnicos') }} />
      <Tabs.Screen name="reportes" options={{ title: 'Reportes', tabBarIcon: icono('reportes') }} />
      <Tabs.Screen name="ajustes" options={{ title: 'Ajustes', tabBarIcon: icono('ajustes') }} />
      <Tabs.Screen name="orden-nueva" options={{ href: null }} />
    </Tabs>
  );
}
