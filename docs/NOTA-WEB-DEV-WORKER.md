# Nota: `expo start --web` falla con "Worker chunk not found" (issue #9)

**Síntoma:** con `web.output: "static"`, `expo start --web` devuelve HTTP 500 y Metro dice
`Worker chunk not found for: …/expo-sqlite/web/worker.ts`.

**Causa:** defecto de `@expo/metro-config` (serializador de workers, `serializeChunks.js`) al servir bundles
*lazy* de desarrollo con salida `static`/`server`. El arreglo upstream (`isWorker && options.includeAsyncPaths → continue`,
expo/expo#50244) NO está en ninguna versión de la serie SDK 57: 57.0.13 es idéntica en código a 57.0.12.

**Cambio mínimo:** `app.json` → `expo.web.output: "single"`. Solo afecta a la web; Android no cambia.
GBOTtel es una app Android: la web solo sirve para depurar.

**Revertir** a `"static"` cuando una versión de SDK 57 incluya el arreglo (o al migrar a SDK 58).

**Límites conocidos (no tocados aquí):**
- `src/components/app-tabs.web.tsx` es una plantilla de Expo sin adaptar (export por defecto, rutas `/explore`):
  la web arranca pero `RootLayout` falla al renderizar, y `npm run type-check` reporta un error de tipos tras iniciar Expo.
- `npm ci` falla: `package-lock.json` no incluye `react-native-reanimated`/`worklets`/`is-edge-to-edge` que npm resuelve como peers.
- La web no tiene FTS5 (se usa búsqueda LIKE).
