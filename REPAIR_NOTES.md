# GBOTtel — reparación integral 2026-10-07 · corrección posterior a auditoría

Esta rama contiene la reparación integral posterior a la auditoría de Claude, manteniendo intacta la implementación interna de Tarifario.

## Cambios principales

- Migración SQLite de técnicos reconstruida de forma segura y con restauración garantizada de `foreign_keys`.
- Nueva tabla `orden_equipos` para modalidad múltiple, con guardado/carga transaccional.
- Compatibilidad de órdenes antiguas que tenían modalidad múltiple pero solo los campos singulares de equipo.
- Folios nuevos derivados de la secuencia existente y comprobados por unicidad.
- Renumeración masiva en dos fases para evitar colisiones UNIQUE.
- Guardado completo de orden en una transacción.
- Importación de órdenes de traspaso en una única transacción.
- Respaldos completos v3 compatibles con respaldos v1/v2; se incluyen equipos.
- Fechas mostradas como `dd/mm/aaaa` y sin desplazamiento UTC para fechas puras.
- Cantidades/precios con soporte para coma decimal y validación contra cero/valores inválidos.
- Totales y analítica de facturación multiplican precio unitario por cantidad exactamente una vez.
- Rangos mensuales calculados desde el primer día del mes para evitar errores en días 29/30/31.
- Dashboard reorganizado: completadas/facturadas, pendientes, ingresos mensuales, técnicos registrados/activos, plan mensual, ingresos generales y dos evoluciones de servicios con métricas distintas.
- Mayor legibilidad de etiquetas y valores de gráficos.
- Borradores de nueva orden ya no se destruyen al cambiar de pestaña; las selecciones provenientes de Tarifario se conservan.
- Selector de técnicos desplazable.
- Se eliminó el uso real de Reanimated/Worklets que quedaba en el proyecto; se mantiene Animated de React Native.
- Se sincroniza la cantidad de servicios con el número de equipos en modalidad múltiple.
- Protección contra doble guardado y contra guardar una orden que no pudo cargarse.

## Reemplazo en Windows

1. Conserva una copia de seguridad de tu `C:\gbottel` actual.
2. No elimines tu keystore de firma si existe en `android\\app\\gbottel-release-key.keystore`.
3. Sustituye el código por el contenido de esta rama.
4. Conserva cualquier secreto/keystore local que no esté versionado.
5. No se modificó Tarifario internamente.

Rama base: `chatgpt/reparacion-integral-2026-10-07`
Rama corregida: `chatgpt/reparacion-integral-2026-10-07-fixed`
El ZIP final incluye un `package-lock.json` regenerado por `npm install --package-lock-only` durante la validación.
