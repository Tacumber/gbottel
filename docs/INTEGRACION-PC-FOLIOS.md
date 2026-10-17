# Integración: estado del PC + folios por rangos + arreglos A1–A4

Rama local `integracion/pc-folios-20261017` (base: instantánea del ZIP del PC). No toca `main`, `android/` ni el Tarifario.

## Qué contiene
- Todo lo del PC (equipos por orden, fechas dd/mm/aaaa, CSV seguro, técnicos robustos, cantidades válidas).
- Folios por rangos de técnico principal (PR #5) y arreglos A1–A4 (PR #6).
- Esquema **v7** (la v6 del PC es `orden_equipos`). Respaldo **v4** = equipos + bloques + libro de folios; acepta v1–v4.
- Se elimina la renumeración por fecha: el folio es permanente.
- Fecha contable = fecha de inicio (respaldo: fecha de reporte, luego creación). «En progreso» pasa a Pendiente.

## Pruebas
`npm run test:folios` (19 pruebas), `npm run type-check`, `npm run check:syntax`. Lint: solo errores preexistentes (_layout, tarifario, tecnicos).

## Advertencias
- `npm ci` falla en el árbol del PC (package-lock desalineado con package.json): usar `npm install`.
- Transacción exclusiva de expo-sqlite sin probar en dispositivo; APK no compilado (sin Android SDK aquí).
- Sin implementar (issue #7): folio editable, tablero, Tarifario (bloqueado por regla), secciones –/+, tipo de cliente, tiempo estimado, exportar por orden, filtros de reportes.
