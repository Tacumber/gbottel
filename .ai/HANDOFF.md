# HANDOFF

## Formato de entrega entre IAs

### Tarea
ID:

### Estado
ANÁLISIS / IMPLEMENTACIÓN / REVISIÓN / QA / APROBACIÓN / CERRADA

### Qué se hizo
-

### Archivos afectados
-

### Riesgos
-

### Pruebas realizadas
-

### Problemas pendientes
-

### Siguiente responsable
-

### Instrucciones para la siguiente IA
-

---

## Entrega: Issue #7, etapa 1 (Claude, 2026-10-21)

### Tarea
ID: issue #7 — auditar, corregir y completar GBOTtel. Rama `claude/ordenes-servicio-20261021` (base `integracion/pc-folios-20261017`, 220393e). Matriz completa: `docs/AUDITORIA-ISSUE7-20261021.md`.

### Estado
REVISIÓN (lista para QA en dispositivo; NO aprobada)

### Qué se hizo
- B: formateador único de importes CUP/USD (`src/utils/moneda.ts`), sin «mil», sin redondeo a entero; SQL y JS usan la misma regla de cantidad (cantidad ≤ 0 aporta 0).
- A: secciones plegables −/+ por técnico principal (`preferenciasService`), confirmación al guardar, espaciado de contadores.
- C: botón «Exportar»; PDF completo por orden, XLSX real (OOXML propio, una hoja por orden) y JSON validado con vista previa/transacción atómica; CSV solo como listado.
- D: folio editable con «continuar secuencia» (`reservarFolioManual`), respeta rangos, sin duplicados ni retrocesos.
- F: tiempo sugerido (Σ tiempoEstimado × cantidad) editable a mano sin pisarse; cantidad multi-equipo inicial = nº de equipos, editable.
- E: opción «Interno» añadida.

### Archivos afectados
`src/utils/{moneda,ordenForm,ordenExport}.ts`, `src/services/{preferenciasService,foliosService,ordenesService,respaldoService,analyticsService}.ts`, `src/app/{orden-nueva,ordenes,index,reportes}.tsx`, `scripts/test-folios.js`, `docs/AUDITORIA-ISSUE7-20261021.md`. Tarifario NO tocado.

### Riesgos
- UI (diálogos, plegado, modal de formato) sin ejecutar en dispositivo; no hay APK.
- Transacciones exclusivas de expo-sqlite no probadas en dispositivo (las pruebas usan node:sqlite).
- XLSX no abierto en Excel real; formato oficial de PDF/XLSX desconocido.
- Fórmula de tiempo (× cantidad) y «por técnico = técnico principal» son decisiones a confirmar.

### Pruebas realizadas
`npm run test:folios` → 28/28; `npm run check:syntax` → 0 errores; `npx tsc --noEmit` → solo error previo en `app-tabs.web.tsx`; `npx expo export --platform android` → bundle Hermes OK. `npm ci` falla (lock desincronizado: requiere decisión del usuario).

### Problemas pendientes
- BLOQUEADO E2: filtro del catálogo por Institucional/Población/Interno (catálogo solo tiene «Modalidad 1–4» e `idPropietario` sin significado confirmado). Preguntar al usuario.
- Tablero (3 tarjetas, Top servicios, quitar «Mayor aceptación»), Reportes y Tarifario del issue #7: no abordados (Tarifario requiere autorización expresa).
- Plantilla oficial PDF/XLSX; README/Expo Go; regenerar lock.

### Siguiente responsable
Gemini (QA/revisión) tras la revisión del usuario de la matriz.

### Instrucciones para la siguiente IA
1. No mergear; revisar el PR de esta rama. 2. Probar en dispositivo/emulador los flujos de UI listados como PARCIAL en la matriz. 3. No tocar Tarifario ni `main`. 4. Resolver E2 solo con respuesta del usuario. 5. Anotar en este archivo comandos y resultados.
