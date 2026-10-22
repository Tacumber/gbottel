# Procedimientos del tarifario de Población

Generado por `scripts/vincular_poblacion.py`. Población es un tarifario independiente: solo se enlaza (campo `procedimiento_de`) con el servicio equivalente de Estatal / Interno para mostrar su procedimiento técnico. No se copian ni comparan precios.

| Concepto | Cantidad |
|---|---|
| Prestaciones de Población | 82 |
| Con procedimiento — nombre idéntico | 57 |
| Con procedimiento — nombre similar (misma prestación) | 10 |
| Con procedimiento — confirmado por el usuario (nombre distinto) | 6 |
| Sin vincular (revisar) | 9 |

## Nombre similar (vinculadas; confirma que son el mismo servicio)

- 1004: «Revisión y Diagnóstico Línea Marrona» ↔ Estatal «Revisión y Diagnóstico Simple Línea Marrona» (similitud 0.80)
- 1018: «Reparación Ligera a Línea Marrona (Excepto para TV 21" TRC Atec Haier y ATEC Panda)» ↔ Estatal «Reparación Ligera a Línea Marrona» (similitud 0.36)
- 1019: «Reparación Pesada a Línea Marrona (Excepto para TV 21" TRC Atec Haier y ATEC Panda)» ↔ Estatal «Reparación Pesada a Línea Marrona» (similitud 0.36)
- 1020: «Reparación de Enseres menores» ↔ Estatal «Reparación  Enseres Menores» (similitud 1.00)
- 1023: «Reparación de caja decodificadora» ↔ Estatal «Reparación Sencilla de caja decodificadora» (similitud 0.75)
- 2627: «Estudio para Instalación y Montaje de respaldo eléctrico.» ↔ Estatal «Estudio para Instalacion y Montaje de respaldo elect.» (similitud 0.67)
- 3048: «Reparación de calentador solar» ↔ Estatal «Reparacion de un Calentador Solar (Colector compacto)» (similitud 0.60)
- 5018: «Mantenimiento de un Mouse o Bocina» ↔ Estatal «Mantenimiento de un Mouse» (similitud 0.67)
- 7005: «Revisión y Diagnóstico Complejo de equipos de clima y refrigeración» ↔ Estatal «Revisión y Diagnóstico Compleja  equipos de clima y refrigeración» (similitud 0.71)
- 7045: «Montaje Split más de 2.6 a 5 Toneladas» ↔ Estatal «Montaje Split mas de 2,6 a 5  Tonelada» (similitud 0.71)

## Confirmados por el usuario (nombre distinto, mismo servicio)

- 2036: «Traslado de materiales hasta una Distancia de 50 M» ↔ Estatal «Carga y Acarreo de Materiales Manual (vagón) Hasta una Distancia de 50 M»
- 2628: «Puesta en marcha de la Instalación y Montaje de eléctrico.» ↔ Estatal «Puesta en marcha de la Instalacion y Montaje de respaldo elect.»
- 3017: «Instalación y montaje de calentador solar» ↔ Estatal «Inst.y Montaje Calentador Solar ( 1 Colector compacto)»
- 7046: «Montaje Split de Cassette» ↔ Estatal «Montaje Split de Casette»
- 8338: «Reparación sencilla de Freezer» ↔ Estatal «Reparación General a Equipos  Eléctricos: Freezer.»
- 8418: «Reparación compleja de Freezer» ↔ Estatal «Reparación Media a Equipos Eléctricos: Freezer»

## Sin vincular (no tienen procedimiento en Población hasta que se confirme)

- 0905: «Atención en el local del cliente» — el código no existe en Estatal / Interno
- 1039: «Reparación sencilla de TV 21" TRC ATEC Haier y ATEC Panda» — el código no existe en Estatal / Interno
- 1040: «Reparación compleja de TV 21" TRC ATEC Haier y ATEC Panda» — el código no existe en Estatal / Interno
- 1041: «Reparación sencilla de cocina de inducción» — el código no existe en Estatal / Interno
- 1042: «Reparación compleja de cocina de inducción» — el código no existe en Estatal / Interno
- 0200: «Levantamiento técnico-comercial» ↔ Estatal «Levantamiento técnico-comercial» — el servicio equivalente no tiene procedimiento
- 7192: «Reparación sencilla de aire ventana» ↔ Estatal «Reparación sencilla de aire ventana» — el servicio equivalente no tiene procedimiento
- 7193: «Reparación Compleja de aire ventana» ↔ Estatal «Reparación Compleja de aire ventana» — el servicio equivalente no tiene procedimiento
- 7200: «Reparación Compleja de Split Cassette» ↔ Estatal «Reparación  Compleja  de split Cassette» — el servicio equivalente no tiene procedimiento
