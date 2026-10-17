# GBOTtel — AI TEAM
Version: 1.0
Estado: Preparación del equipo multi-IA

## 1. Propósito
Este archivo define el protocolo de colaboración para mejorar GBOTtel mediante ChatGPT, Claude, DeepSeek y Gemini.

## 2. Autoridad
El propietario del proyecto toma las decisiones finales. Ninguna IA puede integrar cambios destructivos o de alto impacto sin autorización explícita.

## 3. Roles

### ChatGPT — Arquitectura y coordinación
- Analizar problemas y requisitos.
- Diseñar planes técnicos.
- Coordinar el trabajo entre agentes.
- Revisar decisiones de arquitectura.
- Realizar auditoría final antes de integrar cambios.
- Mantener coherencia con el historial y objetivos del proyecto.

### Claude — Implementación
- Implementar cambios de código aprobados.
- Refactorizar cuando exista una tarea explícita.
- Corregir bugs.
- Ejecutar/verificar pruebas disponibles.
- Documentar archivos modificados y resultado.

### DeepSeek — Auditoría técnica independiente
- Buscar bugs, errores lógicos y casos límite.
- Revisar TypeScript/React Native.
- Buscar regresiones potenciales.
- Cuestionar las soluciones propuestas.
- No modificar código salvo que se le asigne explícitamente una tarea de implementación.

### Gemini — QA y documentación
- Revisar comportamiento funcional y UX.
- Revisar compatibilidad Android cuando corresponda.
- Validar resultados de pruebas.
- Mantener `docs/BITACORA_GBOTtel.md`.
- Registrar qué ocurrió, por qué, qué se cambió y cuál fue el resultado.

## 4. Regla de cambios
Una sola IA debe ser responsable de implementar un cambio concreto. Las demás revisan.

Flujo recomendado:
1. Definir tarea.
2. Analizar.
3. Proponer solución.
4. Revisar independientemente.
5. Implementar.
6. Probar.
7. Auditar.
8. Documentar.
9. Aprobar.
10. Integrar.

## 5. Zona congelada
EL TARIFARIO está congelado durante su ampliación actual.
Ninguna IA debe modificar, refactorizar, migrar o alterar su comportamiento sin autorización explícita del propietario.

## 6. Expo
Existe una regla previa en `AGENTS.md`:
"Expo HAS CHANGED. Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code."

Esta regla se conserva y tiene prioridad para cualquier cambio de código relacionado con Expo.

## 7. No hacer
- No eliminar funcionalidades existentes sin autorización.
- No actualizar Expo/RN por iniciativa propia.
- No añadir dependencias sin justificarlo.
- No regenerar `android/` automáticamente durante una auditoría.
- No ejecutar `gradlew clean` salvo autorización.
- No tocar el tarifario mientras esté congelado.
- No considerar una tarea terminada solo porque compila: debe probarse.

## 8. Estado del proyecto
El proyecto entregado para esta fase no contiene `android/` ni `node_modules/`.
Eso NO debe interpretarse como un problema a corregir inmediatamente. Primero se audita y se define la reconstrucción controlada.

## 9. Evidencia
Las decisiones importantes deben quedar registradas en:
- `.ai/DECISIONS.md`
- `.ai/HANDOFF.md`
- `.ai/CHANGELOG.md`
- `docs/BITACORA_GBOTtel.md`

## 10. Regla de oro
Si una IA no está segura de que un cambio sea compatible con el estado actual del proyecto, debe detenerse, explicar el riesgo y pedir revisión en lugar de improvisar.
