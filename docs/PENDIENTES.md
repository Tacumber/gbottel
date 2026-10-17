# GBOTtel — Cambios pendientes (lista de coordinación)

Última actualización: 2026-10-14. Documento para que ChatGPT, Gemini, DeepSeek y Claude trabajen sobre la misma lista.

## Reglas comunes

- GitHub es la fuente de verdad. `main` no se toca directamente: rama independiente + Pull Request.
- Sin force push, sin comandos destructivos (`expo prebuild --clean`, `gradlew clean`, `git clean`, resets).
- **Tarifario no se modifica** (solo se documentan problemas).
- Sin servidores, APIs ni dependencias que obliguen a usar Internet.
- Cambios pequeños, reversibles y verificables; nada se modifica sin autorización expresa del usuario.
- Cada hallazgo indica contra qué versión se verificó. No dar por corregido lo que no se ha comprobado en el commit que se revisa.

## A. Pedidos del usuario (revisión del ZIP `gbottearr_Claude2`, 7 oct 2026)

Verificados en ese ZIP; **no verificados en `main`**.

| # | Cambio | Detalle | Estado |
| --- | --- | --- | --- |
| A1 | Eliminar el estado «En progreso» | Aparece en tipos, selector de estado, filtros de Órdenes y Reportes, tablero, etiquetas de respaldo y un contador de analítica; el `CHECK` de `ordenes` lo admite. Migrar las órdenes existentes (destino a decidir: `pendiente` o `finalizada`). | Hecho en rama `claude/arreglos-formulario-20261016` |
| A2 | La fecha de inicio define los trabajos | Tablero, ingresos por mes y por técnico, servicios más pedidos y filtros usan `fechaReporte`. Propuesta: `fechaInicio` → `fechaReporte` → `creadoEn`. Decidir si `fechaInicio` es obligatoria. | Hecho en rama `claude/arreglos-formulario-20261016` |
| A3 | Importes no editables y con subtotal | Mostrar por línea importe total = precio unitario × cantidad, solo lectura. Servicios del Tarifario: precio bloqueado. Decidir qué pasa con el precio unitario de materiales. | Hecho en rama `claude/arreglos-formulario-20261016` |
| A4 | Técnicos: selección múltiple | Modal de selección única; quitar «Agregar técnico manualmente», campos manuales por fila y «Guardar este técnico en la base de datos». Los técnicos se dan de alta solo desde la pestaña Técnicos. | Hecho en rama `claude/arreglos-formulario-20261016` |

## B. Issue #3 — folios por rangos y Zustand

Auditoría completa: `docs/auditorias/AUDITORIA-2026-10-14-folios-rangos-zustand.md` (verificada en `main` @ `8da4e7f`).

| # | Cambio | Estado |
| --- | --- | --- |
| B1 | Quitar «Renumerar todo» y `renumerarOrdenesPorFecha()` | Hecho en rama `claude/folios-rangos-apk-20261015` (PR pendiente de revisión) |
| B2 | Esquema v6: `folio_rangos`, `folios_emitidos`, triggers, `tecnicoPrincipalId`, migración histórica con `ROLLBACK` | Hecho en la misma rama |
| B3 | Reserva atómica de folio (transacción exclusiva) | Hecho en la misma rama |
| B4 | Pantalla de rangos con alerta de agotamiento y selector de técnico principal independiente | Hecho en la misma rama (sin Zustand) |
| B5 | Respaldo con validación previa, fusión del libro de folios; traspaso atómico con conflictos explícitos | Hecho en la misma rama |
| B6 | Zustand (borrador + invalidación), opcional | Pendiente |
| B7 | Renombrar el script `prebuild` (`--clean`) | Pendiente |

## C. Auditoría de la rama `chatgpt/reparacion-integral-2026-10-07` (7 oct 2026)

Informe en el chat y en el documento de Claude de esa fecha. Estado comprobado solo en el ZIP `gbottearr_Claude2` (revisión parcial).

| # | Hallazgo | Estado en ZIP Claude2 |
| --- | --- | --- |
| C1 | Llave `}` faltante en `orden-nueva.tsx` (no compilaba) | Corregido |
| C2 | Regex de `campo-fecha.tsx` (`\\d`) desplazaba la fecha un día | Corregido |
| C3 | Borrador no se reiniciaba tras guardar (duplicados) | Corregido |
| C4 | Total de servicios con parser distinto al del guardado | Corregido |
| C5 | Importes inválidos se guardaban como 0 | Corregido (validación estricta) |
| C6 | Folio reutilizado al borrar la última orden | Corregido (contador `siguienteFolio`); sustituir por rangos (B) |
| C7 | `package-lock.json` desincronizado: `npm ci` falla (faltan reanimated, worklets, is-edge-to-edge) | **Pendiente** |
| C8 | ZIP sin `android/`; firma de release con clave de depuración sin definir | **Pendiente** |
| C9 | Aviso de TypeScript en `app-tabs.web.tsx` (`/explore`), probablemente por tipos generados en `.expo` | Por comprobar |
| C10 | Importación de traspaso: clave de duplicado débil y aborto total por una orden inválida | Sin re-verificar |
| C11 | Exportaciones: PDF sin decimales en USD; CSV sin BOM y con flotantes crudos | Sin re-verificar |
| C12 | Tablero: «Ingresos generales» es solo el año en curso; órdenes en progreso sin mostrar; ceros silenciosos ante error | Sin re-verificar |
| C13 | Reportes por técnico: nombres como identidad, reparto con participantes fantasma si cambia el nombre | Sin re-verificar |
| C14 | Persistencia de secciones colapsadas del formulario eliminada con `configuracionService.ts` | En el ZIP Claude2 el servicio existe de nuevo |

## D. Orden sugerido

1. B1 y B7 (reducen riesgo sin migrar datos).
2. C7 y C8 (poder compilar y firmar una APK).
3. A1 y A2 (BD y reportes) → A3 y A4 (formulario).
4. B2 → B3 → B4 → B5.
5. B6 y el resto de C.

## E. Decisiones abiertas del usuario

- Destino de las órdenes «en progreso» (A1) y si `fechaInicio` será obligatoria (A2).
- Precio unitario de materiales: ¿editable solo ahí, o bloqueado también? (A3)
- Folios sin usar de un técnico dado de baja: ¿quedan reservados? (B2)
- Folio en conflicto en un traspaso: ¿omitir y listar, o exportar rechazados? (B5)
- Reportes con principal explícito: ¿atribuir el ingreso al principal o repartir entre participantes?
- Valor de la alerta de agotamiento y tamaño máximo de rango.
- Rama `gemini/qa-20261009`: subirla o enviar el parche para auditarla.
