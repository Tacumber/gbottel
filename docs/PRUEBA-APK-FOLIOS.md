# Primera APK de prueba — folios por rangos (issue #3)

Rama: `claude/folios-rangos-apk-20261015` (base: `main` @ 31f0548 = 8da4e7f auditado + docs).
**Esta rama no incluye un APK**: el entorno donde se escribió no tiene acceso a Google Maven,
al SDK de Android ni a Gradle, y no se simula un resultado que no existe.

## Qué cambia
- Esquema v6: `folio_rangos`, `folios_emitidos` (libro que solo crece), triggers anti-solape /
  folio inmutable, `ordenes.tecnicoPrincipalId`, `ordenes.claveGuardado`.
- Migración transaccional (con ROLLBACK) desde v5: los folios existentes no cambian; se registran en
  el libro y se crea un bloque histórico ya consumido. Las órdenes antiguas quedan sin principal.
- Folio = siguiente número libre del bloque del **técnico principal** (elegido en el formulario,
  independiente de los firmantes). Reserva y creación de la orden en una sola transacción exclusiva.
  Sin folios → no se crea nada y se muestra el motivo. Aviso en Órdenes (umbral por defecto: 10).
- Ajustes → «Administrar rangos de folios»: asignar, quitar bloques sin usar, vincular bloques
  huérfanos, umbral de aviso.
- Respaldo v3 (acepta v2): validación y previsualización ANTES de borrar; no renumera; fusiona
  bloques y conserva el libro local. «Restablecer de fábrica» conserva libro y bloques.
- Traspaso v2: el folio viaja; se eliminó «Renumerar todo»; previsualización; los conflictos se
  omiten y se listan; importación atómica. Los archivos de traspaso v1 (sin folio) se rechazan.
- Doble guardado: cola en memoria + clave única por formulario + transacción exclusiva.

## Qué NO cambia
Tarifario (código y datos), reglas económicas y reportes (`calcularTotales`, `analyticsService`),
sin Zustand, sin dependencias nuevas, `prebuild` intacto.
Nota: el respaldo/restauración sigue incluyendo la tabla `servicios`; solo cambia que corre dentro
de la transacción exclusiva. Revísalo con cuidado por la regla del Tarifario.

## Limitaciones conocidas
- Dos dispositivos sin conexión no pueden detectar bloques solapados: quien administra debe
  repartirlos sin solaparlos. El respaldo/traspaso sí detecta el choque cuando se juntan.
- Los reportes por técnico siguen usando `ordenes.tecnicoId` (primer firmante) y `orden_tecnicos`;
  no se atribuyen al principal hasta que decidas la regla.
- Folios sin usar de un técnico dado de baja siguen reservados (el bloque queda visible).
- Las órdenes creadas antes de la v6 no tienen técnico principal.
- Con la base actual el bloque histórico no emite: para crear órdenes tras actualizar hay que
  asignar primero un rango que empiece después del último folio existente.
- Expo/Android no se ejecutó en dispositivo: las pruebas usan SQLite real de Node, no expo-sqlite.
  Riesgo a verificar en el teléfono: `withExclusiveTransactionAsync` (conexión aparte).

## Pruebas
```
npm run test:folios      # 16 pruebas de aceptación sobre SQLite real (Node >= 22.13)
npm run type-check       # 1 error preexistente en src/components/charts.tsx
npm run check:syntax
```

## Generar el APK de prueba (en tu PC, sin `prebuild --clean`)
```
git fetch origin && git checkout claude/folios-rangos-apk-20261015
npm ci                      # si falla por package-lock desincronizado, ver docs/PENDIENTES.md C7
cd android
./gradlew assembleRelease   # Windows: gradlew.bat assembleRelease
```
APK: `android/app/build/outputs/apk/release/app-release.apk`. El `build.gradle` actual firma el
release con la keystore de depuración estándar (solo válido para pruebas, no para publicar).
No hay keystore ni credenciales en el repositorio. Alternativa: `npx eas build -p android --profile preview` (requiere cuenta y red).

## Verificación manual en el teléfono
1. Actualizar sobre una base existente: abre sin errores; órdenes y folios intactos.
2. Órdenes → Nueva: sin rango → mensaje claro; Ajustes → Rangos → asignar → crear: folio del bloque.
3. Agotar un bloque pequeño: bloquea y avisa. Doble toque en Guardar: una sola orden.
4. Exportar respaldo → restablecer → importar: mismos folios, sin renumerar.
5. Exportar traspaso en un dispositivo e importarlo en otro: folios intactos; reimportar omite todo.

## Arreglos del formulario (rama `claude/arreglos-formulario-20261016`, apilada sobre esta)
- **A1** «En progreso» eliminado de formulario, filtros, reportes y tablero. Las órdenes que lo tenían pasan a
  **Pendiente** (al abrir la app, al restaurar un respaldo y al importar un traspaso). El CHECK de la columna aún lo
  admite (quitarlo exige reconstruir la tabla), pero nada lo escribe.
- **A2** Reportes, filtros por fecha y tablero usan la **fecha de inicio** (si falta: fecha de reporte; si falta: creación).
  La fecha de inicio NO es obligatoria (decisión pendiente tuya).
- **A3** Servicios: el precio unitario viene del tarifario y ya no se edita; se muestra el **importe = cantidad × precio**,
  que cambia al cambiar la cantidad. Materiales: el precio unitario sigue editable (no hay catálogo) y se muestra el
  importe calculado. Lo guardado y `calcularTotales` no cambian (precio unitario × cantidad, una sola vez).
- **A4** Técnicos: selección **múltiple** de técnicos registrados con casillas; se quitó «agregar manualmente» y
  «guardar este técnico en la base de datos». Las órdenes viejas con firmantes manuales se siguen mostrando (solo lectura).
- Nada de esto toca Tarifario. `npm run test:folios` ahora tiene 18 pruebas (T17: En progreso, T18: fecha de inicio).
