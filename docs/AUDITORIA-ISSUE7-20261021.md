# Auditoría inicial — issue #7, etapa 1 (Órdenes de Servicio)

- Fecha: 2026-10-21 · Agente: Claude (sesión de Claude Code, Linux, Node 22.22.0).
- Rama de trabajo: `claude/ordenes-servicio-20261021` · SHA base: `220393e` (= `origin/integracion/pc-folios-20261017`, a su vez derivada de la instantánea del ZIP del PC + PR #5/#6 + arreglos).
- **No auditado / BLOQUEADO:** el código real de Termux/Code Server y el del PC (`C:\gbottel`) no están en GitHub; la rama `gemini/qa-20261009` no existe en el remoto. Solo se audita lo que hay en GitHub.

## 1. Automatizaciones y agentes realmente configurados
| Elemento | Evidencia | Estado |
|---|---|---|
| Claude | Esta sesión: lee/edita el repo, ejecuta pruebas, hace push a ramas propias (no a `main`) | ACTIVO (verificado) |
| DeepSeek | `.github/workflows/deepseek-readonly-review.yml` en `main` (PR #11): revisión de PR **solo lectura**, usa `secrets.DEEPSEEK_API_KEY` | Workflow presente; que el secreto exista y que se ejecute NO es verificable desde aquí |
| Gemini | Ningún workflow ni configuración en el repo | NO VERIFICABLE (una mención no demuestra ejecución) |
| CI de validación | `.github/workflows/validate-package-fixed.yml` (rama integración / PR #8). Último run (39012164157, rama `chatgpt/fix-lint-ci-2026-10-17`): falla solo en el paso Lint (3 errores en `_layout.tsx`, `tarifario.tsx`, `tecnicos.tsx`, ya conocidos; PR #8 los aborda) | `npm ci` y tsc pasaban en ese run |

## 2. Ramas y PR relevantes
`main` (31f0548+PR #11) · PR #5 `claude/folios-rangos-apk-20261015`→main · PR #6 `claude/arreglos-formulario-20261016`→rama de #5 · `integracion/pc-folios-20261017` (PC + #5 + #6, **sin PR**) · PR #10 `claude/fix-web-dev-worker-20261019`→integración (arreglo web, issue #9) · PR #8 (lint, rama `chatgpt/*`) · PR #2 (ChatGPT, rama antigua). Esta etapa parte de `integracion/pc-folios-20261017`; **no** incluye PR #8 ni #10 (son independientes y fusionables).

## 3. Matriz de requisitos (issue #7 y comentarios del 21/10)
Estados: VERIFICADO · PARCIAL · PENDIENTE · BLOQUEADO · NO VERIFICABLE. «Evidencia» = archivo/prueba concreta en la rama base.

### A. Órdenes de Servicio
| ID | Requisito | Estado | Evidencia |
|---|---|---|---|
| A1 | Secciones con − / + en la esquina superior izquierda | PENDIENTE | `src/app/orden-nueva.tsx` no usa ningún componente plegable por sección |
| A2 | Confirmar al guardar una orden modificada («La orden de servicio fue modificada, ¿desea mantenerla así?») | PENDIENTE | `guardar()` (orden-nueva.tsx) guarda sin diálogo |
| A3 | Preferencia de secciones por técnico, aplicada a órdenes nuevas | PENDIENTE | No hay almacenamiento de preferencias (SQLite `configuracion` disponible) |
| A4 | Impresión/exportación siempre con la orden completa | PARCIAL | Las exportaciones actuales leen de SQLite, no del estado de pantalla (`respaldoService.ts`), pero no existe vista de impresión por orden |
| A5 | Menos espacio vertical entre Pendientes/Finalizadas/Facturadas y el contador | PENDIENTE | `src/app/ordenes.tsx` estilos `filters` (paddingVertical 10) + `counter` (8) |
### B. Importes
| B1 | Mismo importe exacto en SQLite, total, contador, 10 últimas, informes, PDF, XLSX, import/export | PARCIAL | Totales: SQL (`analyticsService.ts` TOTAL_CUP) y JS (`calcularTotales`) son equivalentes; **formato inconsistente**: `ordenes.tsx:18` y `reportes.tsx:14` usan `maximumFractionDigits:0` (redondea a enteros), `index.tsx`/`orden-nueva.tsx`/`respaldoService.ts` usan 2 |
| B2 | Precio unitario × cantidad una sola vez | PARCIAL | `calcularTotales` y SQL lo hacen; prueba T16 cubre solo JS, no SQL ni los 10 últimos |
| B3 | Sin abreviaturas tipo «12,3 mil» | VERIFICADO | `grep` de `compact`/`notation`/`/1000` en `src/`: sin coincidencias |
### C. Exportación
| C1 | Botón «Exportar Todas» → «Exportar» | PENDIENTE | `ordenes.tsx:135` («⇩ Exportar todas») |
| C2 | PDF por orden con formato oficial, orden completa | PENDIENTE | `exportarOrdenesPDF` genera un **listado resumen**. La plantilla oficial no está en el repo → formato oficial NO VERIFICABLE |
| C3 | XLSX real, una hoja por orden | PENDIENTE | Solo existe CSV («Excel (CSV)»); sin librería XLSX en `package.json` |
| C4 | JSON importable con validación, previsualización y transacción | PARCIAL | `exportarOrdenesJSON` (v2, completas, con equipos) + `prepararTraspaso`/`aplicarTraspaso` transaccional exclusivo; pruebas T13/T14/T19. Falta validar tipos de cantidades/importes |
### D. Folios
| D1 | Folio editable con pregunta «¿continuar la secuencia desde el número escrito?» | PENDIENTE | El folio es solo texto (`orden-nueva.tsx`, «Folio …») |
| D2 | Únicos, permanentes, dentro de rango, sin colisiones | VERIFICADO | `foliosService.ts` + triggers; `npm run test:folios` T02, T03, T07, T08 |
| D3 | Sin renumeración histórica | VERIFICADO | T07, T11, T15 |
| D4 | Rango agotado bloquea y pide otro | VERIFICADO | T04 |
| D5 | Import/restauración/concurrencia sin duplicados | VERIFICADO* | T06, T10–T14, T19. *Sobre `node:sqlite`, no en dispositivo |
### E. Tipo de cliente
| E1 | Tipos exactos Institucional / Población / Interno | PARCIAL | `orden-nueva.tsx:1786`: solo `["Institucional","Población"]` |
| E2 | Filtrar el catálogo por tipo | BLOQUEADO | Las categorías reales son «Modalidad 1–4» (684/122/605/447 servicios) y `idPropietario` (10 valores, «significado sin confirmar» en `schema.ts`). Ninguna correspondencia fiable con Institucional/Población/Interno. Hace falta una decisión del usuario; no se altera el catálogo |
### F. Tiempo y cantidades
| F1 | Tiempo de trabajo = suma de duraciones de los servicios | PENDIENTE | `servicios.tiempoEstimado` existe (1858/1858 con valor, minutos); el formulario no lo usa |
| F2 | Edición manual no se sobrescribe | PENDIENTE | Depende de F1 |
| F3 | Modalidad múltiple: cantidad inicial = nº de equipos pero editable y libre | PARCIAL (incumple) | `orden-nueva.tsx` `sincronizarCantidadesServicios` fuerza `cantidad = equipos.length` en cada alta/baja de equipo y el campo es `editable={!modalidadMultiple}` |
### G. Otros requisitos del issue #7 (fuera de la etapa 1, no auditados a fondo)
Tablero (3 tarjetas; quitar «Mayor aceptación» —sigue en `index.tsx`— y pastel Top servicios), Tarifario (regla del proyecto: no se modifica sin autorización), Reportes (mes actual por defecto, filtros separados, atribución principal vs participantes), `README`/Expo Go: **PENDIENTE / NO AUDITADO**. Zustand: no requerido por los comentarios; **no se introduce**.

## 4. Plan de esta etapa
Prioridad (cambios pequeños y verificables): B1 (formato único exacto) → F3/F1/F2 (cantidad y tiempo) → A1–A3 (secciones + confirmación + preferencia por técnico) → A5 → C1 → D1 → C3/C2 (XLSX/PDF, solo si hay margen) . E2 queda bloqueado.
