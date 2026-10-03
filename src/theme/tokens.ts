/**
 * theme/tokens.ts
 *
 * Sistema de diseño de GBOTtel. v2: valores confirmados directamente en el
 * código fuente real de GBOTtel_clean (tailwind.config.js, index.css,
 * className="bg-[#...]" literales en los componentes) — ya no son
 * aproximaciones de captura de pantalla como en la v1. Donde el original
 * era genérico o tenía un bug real, se corrigió (ver README).
 */

export const APP_NAME = 'GBOTtel';
export const APP_TAGLINE = 'Gestión Pro';
// El proyecto original tenía 3 nombres distintos sin resolver entre sí
// (in-app: "GBOTtel"/"Gestión Pro"; manifest.json: "COPEXTEL Gestión
// Empresarial"; meta tag: "Gestor Pro COPEXTEL"). Se adoptó el que
// aparece de forma consistente en pantalla — avisar si no es el correcto.

export const color = {
  // Confirmados literal en el código fuente real (bg-[#B11226], etc.)
  primary: '#B11226',
  primaryDark: '#8e0e1f', // hover/pressed — valor exacto usado en todos los botones de GBOTtel
  black: '#000000',

  // Fondo y superficies
  background: '#F5F5F5', // fondo general (coincide con el doc original: "F5F5F5 fondo claro")
  surface: '#FFFFFF', // tarjetas
  border: '#E5E5E5',

  // Texto
  textPrimary: '#111111',
  textSecondary: '#5A5A5A', // subtítulos, etiquetas — coincide con el doc original
  textMuted: '#9A9A9A', // placeholders, texto deshabilitado

  // Estado / semántica (vistos en Técnicos, Órdenes, Reportes)
  success: '#1E9E5A', // "activo", "finalizada", contribución neta positiva
  successBg: '#E6F6ED',
  danger: '#B11226', // contribución neta negativa reusa el primario — no un rojo distinto
  dangerBg: '#FDEBEE',
  pending: '#5A5A5A', // "pendiente" — gris, no un color de alerta
  pendingBg: '#EFEFEF',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

/** Paleta de gráficos — confirmada literal en Reports.jsx del código fuente real. */
export const chartPalette = ['#B11226', '#5A5A5A', '#000000', '#999999', '#CC3344', '#666666'] as const;

export const radius = {
  sm: 8,
  md: 12, // tarjetas
  lg: 16,
  pill: 999, // badges de estado, botones tipo píldora
} as const;

export const type = {
  // Fuente: Inter (según el doc original). Fallback del sistema si no
  // está cargada como custom font en el proyecto todavía.
  fontFamily: 'Inter',
  pageTitle: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.3 },
  pageSubtitle: { fontSize: 14, fontWeight: '400' as const, color: color.textSecondary },
  sectionTitle: { fontSize: 18, fontWeight: '600' as const },
  label: { fontSize: 13, fontWeight: '500' as const, color: color.textSecondary },
  body: { fontSize: 15, fontWeight: '400' as const },
  statNumber: { fontSize: 26, fontWeight: '700' as const }, // cifras grandes del Tablero/Reportes
  eyebrow: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 1, textTransform: 'uppercase' as const },
} as const;

export const shadow = {
  // Elevación sutil, no el shadow por defecto de Tailwind. Una sola
  // fuente de sombra consistente en toda la app, no valores distintos
  // por pantalla.
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2, // Android
  },
} as const;

/**
 * Estructura de navegación inferior — 6 pestañas, confirmada en todas las
 * capturas. Se mantiene igual: es información, no decoración.
 */
export const BOTTOM_TABS = ['Tablero', 'Tarifario', 'Órdenes', 'Técnicos', 'Reportes', 'Ajustes'] as const;
