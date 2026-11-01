# PROMPT MAESTRO PARA CLAUDE — GBOTtel: mejoras integrales de órdenes, técnicos, tablero y reportes

> **Repositorio:** `Tacumber/gbottel`  
> **Rama de trabajo sugerida:** crear una rama de implementación independiente a partir de la rama base actualizada.  
> **Objetivo:** implementar de forma segura las mejoras funcionales y correcciones descritas aquí.  
> **Idioma de trabajo y documentación:** español.  
> **Regla principal:** primero auditar el estado real del repositorio; no asumir que el código coincide con auditorías o archivos anteriores.

---

## 0. Instrucciones obligatorias para Claude

Actúa como ingeniero sénior especializado en React Native, Expo, TypeScript, SQLite, arquitectura móvil offline, contabilidad operativa y pruebas automatizadas.

GBOTtel es una aplicación Android **offline** para gestionar órdenes de servicio técnico. No introduzcas servidores, servicios en la nube, dependencias de red, Base44, sincronización remota ni servicios que requieran conectividad. La base de datos local SQLite es la persistencia principal.

Antes de modificar código:

1. Lee las instrucciones del repositorio, `README`, `package.json`, configuración Expo, esquema SQLite, migraciones, servicios, pantallas, utilidades, pruebas y exportadores.
2. Comprueba la rama, commit base, estado de Git y cambios existentes. No descartes ni sobrescribas trabajo ajeno.
3. Verifica qué hallazgos de esta especificación siguen vigentes en el código actual. Algunos proceden de una revisión estática de un archivo ZIP anterior; el repositorio pudo cambiar.
4. Elabora un plan por etapas, identifica archivos afectados, riesgos de migración y pruebas necesarias.
5. Implementa en ramas/commits pequeños y coherentes. No mezcles refactorizaciones innecesarias con cambios funcionales.
6. No hagas `git push --force`, no reescribas historial, no elimines datos, no cambies folios existentes y no ejecutes `expo prebuild --clean` salvo autorización explícita y justificación técnica indispensable.
7. No ejecutes `gradlew clean` ni builds pesados como primer paso. Primero realiza comprobaciones estáticas y pruebas disponibles.
8. No afirmes que algo está probado si no ejecutaste la prueba. Informa claramente qué se ejecutó, qué pasó y qué no pudo verificarse.
9. No merges el PR. Deja el trabajo en una rama y abre un PR para revisión humana.
10. Si una regla de negocio es ambigua, no inventes una. Documenta la duda y solicita aclaración antes de implementar esa parte.

**Prioridad:** preservar datos históricos y la funcionalidad existente por encima de la velocidad de implementación.

## 1. Contexto técnico que debes verificar

La revisión de un ZIP anterior identificó este entorno aproximado:

- Expo SDK 57.
- React Native 0.86.3.
- TypeScript, Expo Router y `expo-sqlite`.
- Base de datos local `gbottel.db`.
- Esquema observado entonces: versión 9.
- No se encontró Zustand instalado en aquel ZIP.
- No se encontró una implementación real de Zustand; `src/services/orderDraftStore.ts` parecía ser un singleton mutable, no un store reactivo.
- Existían servicios de órdenes, analítica, preferencias, exportación y respaldo.
- La exportación XLSX parecía generar un libro con hojas por orden, pero no se había probado el ciclo exportar-importar.

**No des por sentado que estos datos siguen siendo ciertos. Compruébalos en la rama base actual.**

La aplicación debe continuar siendo compatible con el entorno Android y con los datos de usuarios existentes. No cambies versiones principales ni agregues dependencias grandes sin justificar necesidad, compatibilidad y coste.

## 2. Arquitectura y estado compartido: Zustand

Evaluar e implementar Zustand para centralizar el estado compartido cuando aporte valor real.

Reglas:

- SQLite continúa siendo la fuente de verdad persistente.
- Zustand es una capa reactiva de estado de interfaz/sesión; no sustituye la base de datos ni debe convertirse en una segunda base de datos.
- Los servicios de dominio deben conservar validaciones, transacciones, cálculos y acceso a SQLite.
- Evita duplicar en Zustand datos persistentes que puedan recuperarse de SQLite.
- No almacenes totales calculables en múltiples lugares. Usa funciones puras/selectores para derivarlos.
- Separa stores por dominio solo si mejora mantenibilidad: orden en edición, catálogo/tarifario, técnicos, reportes/tablero y estado general.
- Evita renderizados globales y suscripciones innecesarias; usa selectores.
- No migres todo el estado local indiscriminadamente. Justifica cada migración.
- Mantén la aplicación funcional offline y las preferencias existentes por técnico.

Si Zustand no es necesario para un área, no lo introduzcas artificialmente. Añade pruebas de stores y de integración con servicios.

## 3. Tiempo real trabajado por técnico dentro de una orden

### 3.1 Objetivo de negocio

El pago o reconocimiento económico del técnico se basa en el **tiempo real trabajado** que se le atribuye dentro de cada orden. No debe dividirse el importe de la orden simplemente por el número de participantes.

Cada técnico incluido en la orden debe tener un registro individual de minutos trabajados y una modalidad de asignación:

- `automatico`
- `manual`

El tiempo total distribuible de la orden debe ser explícito y único. No confundas duración estimada del tarifario, duración planificada, duración total real de la orden y suma de minutos atribuidos a los técnicos. Identifica los campos actuales y define una migración compatible antes de implementar.

### 3.2 Reparto inicial

Al añadir participantes y establecer el tiempo total real distribuible, el sistema reparte inicialmente los minutos por igual entre todos los técnicos incluidos.

Ejemplo: 120 minutos y tres técnicos:

- José: 40 minutos, automático.
- Pedro: 40 minutos, automático.
- Juan: 40 minutos, automático.

Si la división deja un resto, no se pierden minutos. Usa una regla determinista y documentada. Ejemplo: 100 minutos entre tres personas: 34, 33 y 33. El resultado debe sumar exactamente 100.

### 3.3 Edición manual y redistribución

Cuando el jefe de brigada o usuario autorizado modifica el tiempo de un técnico:

1. El valor editado pasa inmediatamente a modalidad **manual**.
2. Ese valor manual queda fijado y no vuelve a cambiar automáticamente.
3. Se calcula el tiempo restante: tiempo total de la orden menos la suma de todos los tiempos manuales.
4. Ese restante se distribuye únicamente entre los técnicos que continúan en automático.
5. Si queda un único técnico automático, recibe todo el restante.
6. Los técnicos manuales nunca vuelven a entrar en el reparto por el hecho de modificar a otro técnico.
7. No debe producirse redistribución en cascada hacia técnicos manuales.

Ejemplo obligatorio:

Estado inicial, total 120:
- José 40 automático.
- Pedro 40 automático.
- Juan 40 automático.

Juan se modifica a 20:
- Juan 20 manual.
- José 50 automático.
- Pedro 50 automático.

Luego José se modifica a 20:
- José 20 manual.
- Juan 20 manual.
- Pedro 80 automático.

Pedro debe recibir todo el tiempo restante. No repartir de nuevo entre José y Juan.

### 3.4 Cambios en el total de la orden

Regla confirmada: **solo se modifican los técnicos que estén en automático**.

Ejemplo: José 20 manual, Juan 20 manual y Pedro 80 automático; el total aumenta de 120 a 150:
- José permanece en 20.
- Juan permanece en 20.
- Pedro pasa a 110.

Si el total disminuye y los valores manuales superan el nuevo total, no recortes ni cambies silenciosamente los tiempos manuales. Bloquea la operación o deja el cambio pendiente de confirmación/corrección, explica la diferencia y solicita que el responsable ajuste los valores manuales. Nunca persistas una distribución inválida.

### 3.5 Casos límite y controles

- Si todos están en manual, no redistribuyas. Muestra diferencia pendiente y exige ajuste explícito cuando la suma no coincida con el total.
- No permitas minutos negativos, valores no enteros si la unidad de negocio es el minuto, ni valores no finitos.
- Si no hay participantes, no distribuyas.
- Al añadir un técnico, conserva los manuales y redistribuye solo entre los automáticos, incluyendo al nuevo técnico según la regla de incorporación definida.
- Al quitar un técnico, conserva los tiempos manuales de los restantes y redistribuye entre los automáticos. Antes de eliminar un participante con tiempo manual, informa qué ocurrirá con su tiempo; no lo reasignes sin confirmación.
- Si los minutos manuales exceden el total, muestra error claro y no guardes.
- La suma de minutos atribuidos debe coincidir exactamente con el total cuando la distribución está confirmada.
- Actualiza todo dentro de una transacción SQLite para evitar estados parciales.
- Usa identificadores estables de técnico, nunca nombres como clave contable.
- Conserva el historial de modificaciones: orden, técnico, valor anterior, valor nuevo, modalidad anterior/nueva, usuario responsable, fecha/hora y motivo opcional.
- Debe poder restablecerse un técnico a automático mediante acción explícita del usuario autorizado. Al hacerlo, recalcula solo los automáticos.
- La interfaz debe mostrar nombre, minutos, equivalente horas/minutos, modalidad Automático/Manual, edición, restaurar a automático, total distribuido y diferencia.

### 3.6 Permisos y trazabilidad

El jefe de brigada debe tener control de la distribución de sus subordinados conforme al modelo de permisos existente. Primero audita si ya existen roles y autorizaciones. No inventes un sistema de autenticación remoto. Si no hay roles reales, no simules seguridad con controles visuales: documenta la limitación y propone una implementación local coherente.

### 3.7 Pruebas obligatorias

Implementa pruebas unitarias para:
- reparto igual exacto;
- reparto con resto;
- primera modificación manual;
- segunda modificación manual sin alterar la primera;
- solo un automático restante;
- todos manuales;
- cambio del total con manuales fijos;
- reducción del total por debajo de la suma manual;
- añadir/eliminar participante;
- restablecer manual a automático;
- valores inválidos;
- concurrencia/atomicidad al guardar.

Las pruebas deben demostrar que la suma coincide exactamente con el total cuando el reparto es válido.

## 4. Atribución económica a técnicos

La atribución económica debe derivarse del tiempo individual real trabajado y de la regla de remuneración vigente que se encuentre en el proyecto. No inventes tarifas salariales ni cambies la política de pago.

- Identifica cómo se calcula actualmente el pago o plan mensual por técnico.
- Usa minutos reales atribuidos como base de reparto cuando así lo establezca la regla económica del proyecto.
- Mantén separados: cantidad de órdenes en las que participó, minutos trabajados, importe económico atribuido, facturación de la orden y plan mensual.
- No atribuyas el importe completo a cada participante.
- No uses nombres para agrupar técnicamente: utiliza `tecnicoId`.
- Evita duplicar al técnico principal si también aparece en la tabla de participantes.
- Define y documenta la fórmula económica con ejemplos y pruebas antes de cambiar los reportes.
- Si la remuneración actual no está suficientemente definida en código o documentación, no la reemplaces por una suposición: informa y pide confirmación.

## 5. Tablero principal

Rediseña el tablero sin eliminar los indicadores que el usuario desea conservar.

### 5.1 Tres indicadores principales

Mostrar tres tarjetas independientes:
- Órdenes finalizadas.
- Órdenes facturadas.
- Órdenes pendientes.

Define los estados exactos desde el modelo de datos. No sumes finalizadas y facturadas en una sola tarjeta si son estados distintos. Evita contar una misma orden dos veces.

### 5.2 Indicadores que deben conservarse

Mantener en el tablero:
- Técnicos registrados.
- Plan mensual por técnico.
- Facturación por mes.

Estos elementos ya existían en la versión revisada y **no deben desaparecer** durante el rediseño. Comprueba el diseño y los cálculos actuales antes de reorganizarlos. Conserva su funcionalidad y mejora la presentación si procede.

### 5.3 Gráficos y últimas órdenes

- Elimina el gráfico duplicado de “mayor aceptación” o equivalente.
- Conserva un solo gráfico circular de servicios más realizados.
- Debajo del gráfico, muestra una lista ordenada de servicios con nombre/código y cantidad total.
- Últimas 10 órdenes con solo: folio, estado, CUP y USD.
- Ordena las últimas órdenes por fecha efectiva de la orden y desempata con identificador estable; no uses `id DESC` como sustituto de fecha si puede mostrar órdenes fuera de orden cronológico.
- Mantén formatos monetarios uniformes.

No sacrifiques legibilidad ni hagas que el tablero dependa de una conexión de red.

## 6. Reportes de gestión

La pantalla de reportes debe servir a técnicos, jefes de brigada y supervisores/jefes de taller, según las capacidades y permisos reales del proyecto.

### 6.1 Filtros

- Fecha desde y hasta mediante selector nativo.
- Botón X para limpiar cada fecha.
- Filtros por órdenes y técnicos.
- Búsqueda de folio, cliente y otros campos relevantes.
- Icono de búsqueda y comportamiento eficiente: debounce o botón Aplicar; no dispares una consulta SQLite completa por cada tecla.
- Filtros por estado, técnico, servicio y tipo de cliente cuando esos campos existan.
- Mostrar el mes actual por defecto.
- Permitir consultar periodos históricos sin limitar la consulta a los últimos 12 grupos.
- Mantener coherencia entre filtros y todos los indicadores, tablas y gráficos mostrados.

### 6.2 Grupos plegables

- Agrupar los ingresos/actividad por técnico.
- Cada técnico debe tener control expandir/contraer (+/-).
- Al seleccionar un técnico, el informe completo debe filtrarse por ese técnico, no solo la lista de órdenes.
- El filtro de técnico debe afectar también consultas de ingresos, periodos, totales, gráficos y exportaciones.
- Incluir importes CUP y USD cuando correspondan.

### 6.3 Indicadores útiles para gestión

Cuando los datos existan o se implementen con trazabilidad:
- Órdenes recibidas, finalizadas, facturadas y pendientes.
- Órdenes vencidas y antigüedad del backlog.
- Tiempo medio de ejecución.
- Tiempo real frente a tiempo estimado.
- Carga de trabajo por técnico/brigada.
- Minutos reales por técnico.
- Productividad y cumplimiento del plan mensual.
- Órdenes finalizadas aún no facturadas y su importe.
- Distribución por tipo de cliente.
- Servicios más frecuentes e ingresos por servicio.
- Revisiones aprobadas, rechazadas y retrabajos si hay datos fiables.

No clasifiques a los técnicos únicamente por ingresos. Distingue volumen, tiempo, calidad, cumplimiento y participación económica. No presentes como indicador real algo que la base de datos no mida.

### 6.4 Problemas de analítica que deben verificarse y corregirse

Una revisión estática anterior señaló posibles defectos que debes comprobar en la rama actual:

- La selección de técnico no llegaba a la consulta de ingresos por técnico.
- Algunas consultas filtraban solo `ordenes.tecnicoId` y podían excluir técnicos secundarios de `orden_tecnicos`.
- La atribución/agrupación por nombre podía duplicar o fusionar técnicos con nombres iguales.
- Los indicadores de resumen y estados podían ser globales aunque la lista de órdenes estuviera filtrada.
- El cálculo de plan diario/mensual podía comparar periodos parciales contra el plan mensual completo sin prorrateo o explicación.
- Los grupos de periodos podían limitarse a 12 aunque el usuario solicitara histórico.
- La pantalla podía volver a consultar la base de datos en cada pulsación de búsqueda.
- La consulta de últimas órdenes podía ordenar por ID y no por fecha.
- Los totales CUP/USD se calculaban en más de un lugar (SQL, TypeScript y exportación).

No asumas que cada punto es todavía un bug; reproduce, documenta y corrige los que sigan presentes.

## 7. Moneda y cálculos

- Uniforma la presentación de importes en toda la aplicación: exactamente dos decimales en pantalla, tablero, reportes y exportaciones, salvo que exista una regla contable documentada que exija otra cosa.
- No confundas formato visual con precisión de almacenamiento/cálculo. No redondees prematuramente ni pierdas precisión de los importes guardados.
- Investiga la política actual de `normalizarImporte` y `formatearImporte`.
- Una revisión anterior encontró máximo de hasta 10 decimales en la presentación; verifica si continúa.
- Evita cálculos divergentes de importes de línea y totales entre pantalla, SQL, exportación y reportes.
- Centraliza la regla de cálculo en una función de dominio compartida o una consulta claramente canónica.
- Recuerda la regla existente que debe verificarse: `orden_servicios.importeCUP` representa precio unitario, no total de línea; el total de línea es precio unitario por cantidad.
- Cantidad vacía/cero/inválida no debe mostrar un importe de línea distinto al que participa en el total. La interfaz debe validar y presentar coherentemente.
- CUP es moneda principal y USD secundaria según el comportamiento existente; no conviertas monedas ni sumes CUP con USD.

## 8. Pantalla Tarifario

- Eliminar el botón “+” para añadir tarifas.
- El técnico no debe poder crear tarifas desde la pantalla de Tarifario.
- Mantener consulta, búsqueda, categorías, subcategorías, procedimientos y selección de servicios para órdenes.
- No reescribir ni alterar innecesariamente la estructura del catálogo, tarifas o datos importados.
- Verificar si existen otros caminos para crear/editar tarifas y confirmar si deben permanecer restringidos. No supongas que ocultar un botón equivale a control de permisos.

## 9. Importación de órdenes JSON y XLSX

La pantalla de Órdenes debe permitir importar órdenes de servicio desde JSON y XLSX.

### 9.1 JSON

- Mantener compatibilidad con el formato de respaldo/exportación JSON oficial vigente.
- Inspeccionar `respaldoService` y todos los esquemas reales antes de diseñar el importador.
- Validar estructura, versión, tablas/campos, referencias y relaciones.
- Detectar duplicados y presentar vista previa.
- Nunca borrar datos existentes como efecto secundario de importar órdenes.
- Separar claramente “importar órdenes” de “restaurar respaldo completo”, porque tienen alcances diferentes.
- Transacción SQLite y reporte final de importadas, omitidas y fallidas.
- No confiar en datos del archivo; validar cada registro.

### 9.2 XLSX: usar exclusivamente la plantilla oficial de GBOTtel

**Decisión confirmada por el usuario:** la importación XLSX debe utilizar la misma plantilla oficial que genera la APK cuando exporta órdenes a XLSX. No crear un formato de Excel alternativo ni aceptar arbitrariamente cualquier libro con columnas parecidas.

Requisitos:
- Primero inspecciona el exportador XLSX actual y documenta hojas, nombres, columnas, tipos, relaciones y campos que realmente exporta.
- Implementa el importador de acuerdo con esa estructura real.
- Exportar una orden/libro y volver a importarlo debe recuperar todos los datos exportados que sean importables, sin pérdida ni alteración.
- La plantilla debe tener identificación/versionado de formato si es necesario; cualquier metadato adicional debe ser compatible con libros anteriores cuando sea posible.
- No cambies la exportación de manera incompatible sin migración/documentación.
- Validar hojas requeridas, encabezados, tipos, fechas, números, moneda, técnicos, servicios, materiales, equipos y relaciones.
- Mostrar vista previa antes de confirmar.
- Detectar folios duplicados y referencias inexistentes.
- No sobrescribir órdenes existentes silenciosamente. Ofrecer política explícita de omitir duplicados o cancelar; no reemplazar por defecto.
- Importar de forma transaccional; informar errores por fila/orden sin guardar órdenes parciales.
- No asumir que XLSX contiene todos los datos de un JSON. Importar exactamente lo que la plantilla exporta y documentar cualquier limitación.
- Probar ciclo exportar → importar → comparar campos y relaciones.

### 9.3 Seguridad de importación

- El usuario debe elegir explícitamente el archivo.
- No ejecutar macros ni fórmulas.
- Validar límites de tamaño y número de filas.
- Sanitizar texto y controlar formatos anómalos.
- Manejar fechas Excel con zona horaria local sin desplazar el día.
- Evitar conversiones numéricas que dañen importes o folios con ceros iniciales.
- Proporcionar resumen de importación con totales y errores.

## 10. Formulario de técnicos

Añadir el campo **Dirección particular** al formulario de alta/edición de técnicos.

- Persistirlo en SQLite mediante migración segura.
- Mostrarlo al consultar y permitir editarlo.
- Incluirlo en respaldo JSON y restauración cuando corresponda.
- Revisar exportaciones/importaciones de técnicos.
- No hacerlo obligatorio salvo que el comportamiento existente o el usuario lo exija.
- No mostrarlo públicamente en reportes generales si no es necesario.
- Conservar compatibilidad con técnicos existentes (valor vacío/null).

## 11. Seguridad de migraciones SQLite

Una revisión estática anterior observó que el bloque de migraciones de columnas podía capturar errores no relacionados con “columna ya existe”, registrar una advertencia y continuar, mientras avanzaba la versión del esquema. Verifica si sigue ocurriendo.

Si se confirma:
- No marques una migración como aplicada cuando alguna operación falló.
- Maneja migraciones versionadas y transaccionales en la medida compatible con SQLite/Expo.
- Ignora únicamente errores de duplicado esperados y verificados; propaga otros errores.
- Actualiza `user_version`/versión de esquema solo después del éxito completo.
- Añade pruebas de migración desde versiones antiguas soportadas hasta la actual.
- No elimines ni reconstruyas tablas con datos sin una estrategia probada de copia, validación y rollback.
- Revisa cuidadosamente claves foráneas y secuencia OFF/ON si hay reconstrucción de tablas.

## 12. Historial de revisión y calidad del trabajo

Para que supervisores puedan evaluar calidad de manera objetiva, inspecciona los campos actuales de revisión (por ejemplo, revisor, cargo, fecha y firma, si existen). No inventes métricas sin datos.

Si se requiere ampliar el modelo, propone y justifica un registro de eventos/revisiones para guardar:
- resultado de revisión;
- motivo de rechazo;
- corrección solicitada;
- técnico responsable de corregir;
- fecha de devolución y nueva entrega;
- segunda revisión y resultado;
- usuario que registró cada evento.

No construyas un sistema de roles ficticio ni un módulo completo de incidencias sin acordar alcance. Prioriza primero las funciones solicitadas y la integridad de datos.

## 13. Pruebas y criterios de aceptación globales

Antes de declarar terminado, como mínimo:

1. Ejecutar comprobación TypeScript/tipos y sintaxis según scripts reales del proyecto.
2. Ejecutar pruebas unitarias existentes y nuevas.
3. Añadir pruebas de lógica de reparto de minutos y atribución económica.
4. Añadir pruebas de filtros combinados de reportes y técnico principal/secundario.
5. Añadir pruebas de consistencia de CUP/USD entre pantalla, consultas y exportaciones.
6. Añadir pruebas de migración desde esquemas previos.
7. Añadir pruebas de importación JSON con datos válidos, corruptos, duplicados e incompletos.
8. Añadir pruebas XLSX de exportación-importación round-trip con órdenes que tengan múltiples técnicos, servicios, materiales, equipos, CUP y USD.
9. Verificar que el tablero conserva técnicos registrados, plan mensual por técnico y facturación mensual.
10. Verificar que el botón “+” del Tarifario desaparece y que no queda una vía no autorizada para añadir tarifas.
11. Verificar que dirección particular persiste tras cerrar/reabrir la aplicación y se conserva en respaldo.
12. Probar con base de datos existente y datos reales de prueba, nunca con la única copia de datos del usuario.
13. Si no puedes ejecutar build Android, dilo explícitamente y no afirmes que APK está validada.

### Casos de aceptación esenciales

**Caso A — reparto de minutos**
- Total 120, tres técnicos: 40/40/40 automáticos.
- Juan cambia a 20: José 50 automático, Pedro 50 automático, Juan 20 manual.
- José cambia a 20: Pedro 80 automático, José 20 manual, Juan 20 manual.
- Total permanece en 120.

**Caso B — aumento de total**
- José 20 manual, Juan 20 manual, Pedro 80 automático.
- Total cambia a 150.
- Resultado 20/20/110.

**Caso C — no hay automáticos**
- Todos manuales y total distinto a la suma.
- No redistribuir ni guardar un reparto inconsistente; mostrar diferencia y exigir corrección.

**Caso D — reportes**
- Al elegir un técnico secundario, deben aparecer sus órdenes y su tiempo/importe atribuido en todos los módulos del informe.
- Los indicadores deben respetar exactamente los filtros seleccionados.

**Caso E — XLSX**
- Exportar orden oficial con todos los detalles soportados.
- Importar ese mismo archivo.
- Comparar campos y relaciones; no perder datos ni duplicar folio.

## 14. Orden de implementación recomendado

Trabaja por fases para facilitar revisión:

### Fase 1 — auditoría y seguridad
- Inventario real de arquitectura, esquema, cálculos, exportaciones, importaciones, pruebas y Git.
- Identificar defectos reproducibles.
- Diseñar migraciones y política de compatibilidad.
- No modificar código hasta presentar el plan.

### Fase 2 — modelo de tiempo y atribución
- Esquema de tiempo total y tiempo por técnico.
- Algoritmo puro automático/manual.
- Transacciones y auditoría de cambios.
- Pruebas exhaustivas.

### Fase 3 — analítica y consistencia económica
- Unificar cálculos y formato monetario.
- Corregir filtros y atribución por ID.
- Corregir consultas de dashboard y reportes.

### Fase 4 — tablero
- Tres tarjetas principales.
- Mantener técnicos registrados, plan mensual por técnico y facturación por mes.
- Un gráfico de servicios, lista debajo y últimas 10 órdenes.

### Fase 5 — reportes
- Fechas limpiables, filtros coherentes, búsqueda eficiente, grupos plegables y periodo actual por defecto.

### Fase 6 — pantallas auxiliares e importación
- Quitar “+” del Tarifario.
- Añadir dirección particular.
- Importación JSON.
- Importación XLSX basada en la plantilla oficial de exportación.

### Fase 7 — validación final
- Pruebas, revisión de migraciones, comprobación de no regresiones, documentación y PR.

Si la implementación completa es demasiado grande para un solo PR, divide por fases en PRs dependientes y revisables. No reduzcas cobertura ni dejes funciones a medias para aparentar finalización.

## 15. Entregables obligatorios

Al terminar cada fase, informa:
- Qué archivos cambiaste y por qué.
- Qué comportamiento se implementó.
- Migraciones de SQLite realizadas.
- Pruebas ejecutadas y resultado real.
- Riesgos, limitaciones y pruebas pendientes.
- Capturas o evidencia de UI cuando sea posible.
- Commit(s) y rama.
- PR abierto, sin fusionar.

Incluye documentación técnica del algoritmo de reparto de minutos y del formato XLSX oficial.

## 16. Prohibiciones

- No borrar, reiniciar ni sustituir la base de datos del usuario.
- No cambiar folios históricos ni recalcularlos masivamente sin aprobación.
- No cambiar el significado de `importeCUP` o `importeUSD`.
- No cambiar la política de remuneración sin evidencia de la regla actual y confirmación del usuario.
- No eliminar indicadores actuales que el usuario ha pedido conservar.
- No quitar funcionalidades de orden, exportación, respaldo o preferencias por técnico.
- No introducir servicios online.
- No modificar la rama principal directamente.
- No fusionar el PR.
- No afirmar que el proyecto compila o que el APK funciona sin ejecutar las verificaciones correspondientes.

## 17. Instrucción final

Empieza por la **Fase 1: auditoría del repositorio actual y plan de implementación**, sin alterar archivos funcionales. Devuelve un informe conciso pero técnico, con los hallazgos confirmados, los que ya no aplican y los riesgos. Después implementa por fases en una rama separada y abre PR(s) para revisión.

El objetivo no es reescribir GBOTtel: es corregir y ampliar lo que ya existe, preservar los datos y entregar una aplicación estable, coherente y verificable.
