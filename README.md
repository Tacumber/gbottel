# GBOTtel

App de gestión para servicios técnicos de COPEXTEL (Las Tunas): tarifario, órdenes de trabajo, técnicos y reportes. Offline-first, React Native + Expo, SQLite local.

## Estado del proyecto

| Módulo | Estado |
|---|---|
| Tarifario (1858 servicios reales, búsqueda FTS5, filtro por categoría) | Funcional |
| Tablero (estadísticas reales del catálogo) | Funcional |
| Órdenes de trabajo | Funcional |
| Técnicos | Funcional |
| Reportes / Ajustes | Parcial / en evolución |

## Arrancar

```bash
npm install
npx expo start
```

La primera vez que se abre la app se crea la base SQLite local y se importan los 1858 servicios desde `src/data/servicios_seed.json`. Los arranques siguientes no vuelven a importar si el catálogo ya existe. La base actual se llama `gbottel.db`.

## Estructura

```
src/
  app/            rutas de expo-router (una pantalla por archivo)
  components/     componentes compartidos (Themed*, tabs, etc.)
  database/       schema SQL + apertura de conexión SQLite
  services/       lógica de acceso a datos (tarifarioService, etc.)
  theme/          tokens de marca (color, spacing, tipografía)
  constants/      puente entre theme/tokens.ts y React Native
  types/          tipos TypeScript del dominio
  scripts/        scripts de importación/verificación (corren dentro de la app, no por CLI)
```

## Decisiones pendientes

- **Nombre de la app**: `theme/tokens.ts` documenta 3 nombres distintos encontrados en el código fuente original (GBOTtel, COPEXTEL Gestión Empresarial, Gestor Pro COPEXTEL). Se usó "GBOTtel" de forma consistente — confirmar si es el correcto.
- **`android.package`** en `app.json`: puesto como `cu.copextel.gbottel`. Es la identidad permanente del app una vez publicada — confirmar antes del primer build real.
- **Categorías del tarifario**: "Modalidad 1"–"Modalidad 4" son los nombres del archivo original de COPEXTEL. Renombrar con `renombrarCategoria()` en `tarifarioService.ts` una vez se sepan los nombres reales.
- **Modo oscuro**: no está diseñado todavía. `constants/theme.ts` usa la misma paleta para claro y oscuro a propósito, para no inventar una versión oscura no oficial.

## Verificación de instalación

`src/scripts/verificarInstalacion.ts` es una prueba de humo que corre dentro de la app (no es un script de terminal — `expo-sqlite` es un módulo nativo, no corre bajo Node puro). Limpia sus propios datos de prueba al terminar.

## V5 — estabilidad y cambios funcionales

Esta versión fija la estructura definitiva de Técnicos, soporte de brigadas, selector desplegable de estado en Orden de Servicio y selección robusta del Tarifario.

### Validación recomendada

```cmd
npm install
npx expo-doctor
npm run check:syntax
npm run type-check
npx expo start --clear
```

Si Expo Go SDK 57 se cierra con `SIGSEGV` en `mqt_v_js`/`libworklets.so`, prueba el binario propio:

```cmd
eas build --platform android --profile preview
```

Ese paso es importante porque existe un problema público de Expo Go SDK 57 con una firma de crash equivalente. No se debe seguir modificando la lógica de la app para intentar corregir un `SIGSEGV` que pertenece al runtime de Expo Go sin aislar primero el binario propio.
