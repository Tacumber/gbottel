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

## 5. Estado tras la implementación (commits posteriores a `ab3a489`)
Pruebas: `npm run test:folios` = 28/28 (Node 22.22, `node:sqlite` como sustituto de expo-sqlite; NO en dispositivo). `npm run check:syntax` 0 errores; `tsc --noEmit` solo el error previo de `app-tabs.web.tsx`; `expo export --platform android` genera el bundle Hermes (no es APK ni prueba en dispositivo).

| ID | Estado | Archivo y evidencia |
|---|---|---|
| A1 secciones −/+ | PARCIAL (código hecho, sin probar la UI) | `orden-nueva.tsx` `Seccion` (botón − / + arriba a la izquierda, `seccionesOcultas`). La UI no se ejecutó en dispositivo ni en un renderizador |
| A2 confirmación al guardar | PARCIAL (código hecho, sin probar la UI) | `orden-nueva.tsx` `guardar()` (Alert «La orden de servicio fue modificada, ¿desea mantenerla así?»; No → recarga de SQLite/restaura secciones; tocar fuera = seguir editando). La lógica de «modificada» usa `instantaneaFormulario`, no probada con UI |
| A3 preferencia por técnico | VERIFICADO (persistencia) | `preferenciasService.ts`; prueba T23 (independiente por técnico, entrada inválida ignorada, no toca la orden, viaja en el respaldo). Que se aplique a «órdenes nuevas» en pantalla: PARCIAL (sin probar UI). Decisión de diseño: «técnico» = técnico principal |
| A4 impresión/exportación completas | VERIFICADO (exportación) | T25 (XLSX) y T26 (PDF) generan desde SQLite todas las secciones; no dependen del estado de pantalla |
| A5 espaciado | PARCIAL | `ordenes.tsx` estilos `filters`/`counter` (−6 px aprox.); sin captura de pantalla |
| B1 importes exactos | VERIFICADO (lógica) | `utils/moneda.ts` único formateador en tablero, órdenes, reportes, orden, PDF, CSV; T20 (SQLite = calcularTotales = últimas 10 = lista = texto; 3 703 728,92) y T28 (SQL y JS alineados con cantidad ≤ 0). Tarifario conserva su formateador propio (regla del proyecto) |
| B2 precio × cantidad una vez | VERIFICADO | T16, T20, T21 |
| B3 PDF y XLSX | VERIFICADO | T25 (celdas numéricas idénticas, leídas con openpyxl), T26 |
| C1 botón «Exportar» | VERIFICADO (texto) / PARCIAL (UI) | `ordenes.tsx`; selector de formato en `Modal` (el Alert de 4 botones no cabía en Android, solo muestra 3) |
| C2 PDF por orden | PARCIAL | T26. Formato oficial NO VERIFICABLE (plantilla ausente); disposición = 9 secciones del formulario |
| C3 XLSX real | VERIFICADO | `utils/ordenExport.ts` (ZIP/OOXML propio, sin dependencias); T25: CRC por `zlib`, una hoja por orden, abierto con openpyxl 3.1.5. No abierto en Excel real |
| C4 JSON importable | VERIFICADO | T13, T14, T19, T27: versión, tipos, cantidades, importes, totales declarados, equipos, conflictos antes de aplicar, atomicidad con fallo forzado |
| D1 folio editable | VERIFICADO (servicio) / PARCIAL (UI) | `foliosService.reservarFolioManual`; T24 (rango, duplicados, continuar/conservar, no retroceder, saltar emitidos). Diálogo en `orden-nueva.tsx` sin probar en UI |
| D2–D5 | VERIFICADO | T02–T08, T10–T15, T19, T24 |
| E1 tipos | PARCIAL | «Interno» añadido (`SelectorTipo`) |
| E2 filtro por tipo | BLOQUEADO | Falta decisión del usuario (ver §3-E) |
| F1/F2 tiempo | VERIFICADO (reglas) / PARCIAL (UI) | `utils/ordenForm.ts`, T22; en pantalla: sugerido = suma de `tiempoEstimado × cantidad` de las líneas con duración (**decisión a confirmar**: multiplicar por cantidad); manual se conserva |
| F3 cantidad múltiple | VERIFICADO (reglas) / PARCIAL (UI) | T21: autollenado inicial, editable, nunca limitada al nº de equipos, no se pisa; `orden-nueva.tsx` |

**Limitaciones:** UI no ejecutada (sin dispositivo/emulador); APK no compilado; hoja XLSX no probada en Excel; formato oficial desconocido; Tablero, Tarifario y Reportes (issue #7 §G) no tocados.

### Actualización: plantilla oficial (2026-10-21 noche)
El usuario aportó la foto del modelo oficial (`docs/modelo-oficial-orden-servicio.png`). `src/utils/ordenExport.ts` genera ahora PDF y XLSX desde UNA misma descripción del formulario (`formularioOrden`) con la disposición del modelo: cabecera con folio, cobertura/MÚLTIPLE, cliente / servicio (6 modalidades) / equipo, tiempo, observaciones, materiales (Vale, Código, Descripción, UM, Cant, Nro Serie, CUP, USD), servicios, totales por cliente y Conformidad (Control del Folio, Técnico Responsable, Cliente). Prueba T25 (celdas combinadas, folio y totales numéricos) y T26 (todos los bloques del modelo en cada orden). Renderizado revisado visualmente (Chromium → PDF y LibreOffice → PDF, una página A4). C2/C3: VERIFICADO contra el modelo (disposición); pendiente solo la comparación a escala/impresión sobre el papel real. Diferencias deliberadas: la 2.ª columna de importe se rotula USD (el modelo dice CUC; la app guarda USD); equipos adicionales y técnicos adicionales van en filas extra; sin precio unitario (el modelo solo trae importe de línea = precio × cantidad).

### Tarifario — arreglos de pantalla (22/10, solicitados expresamente por el usuario)
Autorización: el usuario pidió estos cambios del Tarifario de forma expresa (regla especial del proyecto). Archivos: `src/app/tarifario.tsx`, `src/services/procedimientosService.ts` (nuevo), `src/data/procedimientos_tarifario.json` (el .json de Gemini, tal cual). No se tocó la base, el esquema, precios ni el catálogo.
- Categorías Todos / Estatal / Población / Interno; Estatal e Interno despliegan la subcategoría (las «Modalidad 1–4» actuales) en una fila horizontal propia con etiqueta, sin superponer texto; más espacio entre categorías y lista.
- «Añadir a OS» (texto centrado en ambos botones).
- Doble toque: «Información» (misma ventana, solo lectura) y «Procedimiento» (ventana nueva). Quedan sin acceso desde la pantalla Editar y Eliminar servicio (decisión del usuario).
- **Población: SIN datos.** El usuario dijo que Estatal e Interno usan las mismas tarifas y que Población usa otra, pero el archivo no llegó. La pestaña existe y muestra «El tarifario de Población todavía no está cargado» (no se muestran precios de Estatal como si fueran de Población). Pendiente: modelo de datos del tarifario de Población y cómo entra en «Todos».
- Procedimientos: coincidencia EXACTA por código; solo 20 de 1858 servicios tienen ficha; el resto muestra «sin procedimiento registrado». El procedimiento del archivo es por categoría (10 familias) y de redacción genérica; no es un procedimiento oficial por servicio.
- Hallazgo sobre el .json: en 2 de 20 servicios la tarifa del archivo difiere del catálogo (2510: 1820.40 vs 5093.82; 2511: 1650.15 vs 4740.04), y los tiempos/técnicos difieren en la mayoría. Por eso NO se usan tarifa, tiempo ni técnicos del archivo; manda el catálogo. Corrección: mi afirmación previa de que «Modalidad 1–4» es el tipo de trabajo era una inferencia incompleta (p. ej. «Mantenimiento ligero» 1011 está en Modalidad 3); el significado real de las modalidades sigue sin confirmar.
- Prueba T29 (29/29). `expo export --platform android` OK. UI no probada en dispositivo.

### Tarifario — Población y nuevo modelo Estatal/Interno (22/10)
- **Población:** tarifario independiente (82 prestaciones: código, nombre, UM, CUP enteros) en `src/data/tarifario_poblacion.json`, servicio `tarifarioPoblacionService.ts`. No se compara ni se enlaza con la tabla `servicios`; en la orden `servicioId` = null (ids negativos en pantalla). Suma de control de los 82 precios: 162 580 CUP (prueba T30).
- **Todos** = Estatal/Interno + Población juntos, cada fila etiquetada y con su propio precio; Estatal e Interno comparten el mismo tarifario.
- **Nuevo modelo (Gemini) para los 1858 servicios:** `src/data/tarifario_estatal.json`, generado por `scripts/generar_tarifario_estatal.py` (categorías → servicios; campos codigo, codigo_completo, descripcion, unidad_medida, tarifa, modalidad, tiempo_estimado_minutos, cantidad_tecnicos, id_propietario, complejidad, herramientas_requeridas, procedimiento). Precios tomados del catálogo (no del .json de Gemini, que difiere en 2510 y 2511); T29 comprueba los 1858 precios uno a uno. 34 categorías: las 10 de Gemini con nombre y el resto agrupadas provisionalmente por los 2 primeros dígitos del código (sin nombre: «Familia NN») — falta clasificar y nombrar. Solo 20 servicios tienen procedimiento; agregar uno = completar el campo `procedimiento` del servicio. Se retiró `procedimientos_tarifario.json` del runtime (queda solo como entrada del generador).
- Pendiente: el buscador de servicios dentro de la orden (`orden-nueva.tsx`) sigue usando solo el catálogo Estatal/Interno; para un cliente de Población debería usar el tarifario de Población. Tests 30/30.
- (22/10) Buscador de servicios de la orden: si el tipo de cliente es «Población» busca en el tarifario de Población; con cualquier otro tipo, en Estatal / Interno. Solo cambia la búsqueda; las líneas ya añadidas no se reprecian si luego se cambia el tipo de cliente. Sin probar en dispositivo.

### Procedimientos oficiales y base de 1858 servicios (22/10)
Entrada: ZIP «Procedimientos» (19 libros «NN Nombre 22.xlsx»). `scripts/extraer_procedimientos.py` lee los bloques «PROCEDIMIENTO TÉCNICO» (modalidad, prestación, código, técnicos, actividades con minutos, tiempo de solución técnica, insumos); `scripts/generar_tarifario_estatal.py <carpeta>` los une al catálogo y regenera `src/data/tarifario_estatal.json` (20 categorías = las familias de los libros + «Sin clasificar») y `docs/INFORME-PROCEDIMIENTOS.md`. Los libros NO se incluyen en el repositorio. Las tarifas salen solo del catálogo (T29 las compara una a una). Resultado: 1371 de 1858 servicios con procedimiento (1343 por código, 28 por nombre exacto + tiempo); 487 sin procedimiento; 11 procedimientos sin unir (códigos «0000», «nueva NN», 4224 o errores de código) — ver el informe. Se retiró el procedimiento genérico de Gemini: lo sustituyen los oficiales. La vista «Procedimiento» muestra familia, tipo de servicio, técnicos, tiempo de solución, actividades con minutos e insumos. Población no usa estos procedimientos (tarifario independiente). Hallazgo: «Modalidad 1–4» del catálogo = Reparación / Revisión y Diagnóstico / Instalación y Montaje / Mantenimiento en 1692 de 1792 servicios (100 discrepancias listadas; p. ej. 1001–1007, Revisión y Diagnóstico, figuran como Modalidad 3). T29/T30, 30/30.
