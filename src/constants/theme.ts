/**
 * constants/theme.ts
 *
 * Puente entre theme/tokens.ts (la marca real de GBOTtel: color, spacing,
 * radius, type — ver ese archivo para las notas de dónde sale cada valor)
 * y las piezas que son responsabilidad de React Native/Expo (fuentes por
 * plataforma, breakpoints de layout). Los componentes Themed* consumen
 * `Colors`/`ThemeColor` de aquí — antes tenían su propia paleta gris
 * genérica de la plantilla de Expo, sin relación con theme/tokens.ts.
 *
 * theme/tokens.ts no define una variante oscura (la app original de la
 * que salieron estos valores tampoco la tiene). En vez de inventar una
 * paleta oscura no diseñada y hacerla pasar por oficial, `dark` reusa los
 * mismos valores que `light` — la app se ve igual sin importar el tema
 * del sistema hasta que se diseñe un modo oscuro real.
 */


import { Platform } from 'react-native';

import { color } from '@/theme/tokens';

const base = {
  text: color.textPrimary,
  textSecondary: color.textSecondary,
  textMuted: color.textMuted,
  background: color.background,
  surface: color.surface,
  backgroundElement: color.surface,
  backgroundSelected: color.border,
  border: color.border,
  primary: color.primary,
  primaryDark: color.primaryDark,
  success: color.success,
  successBg: color.successBg,
  danger: color.danger,
  dangerBg: color.dangerBg,
  pending: color.pending,
  pendingBg: color.pendingBg,
} as const;

export const Colors = {
  light: base,
  dark: base,
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'Inter, system-ui, sans-serif',
    serif: 'Georgia, Times New Roman, serif',
    rounded: 'system-ui',
    mono: 'ui-monospace',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
