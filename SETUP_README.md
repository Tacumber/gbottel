# Cómo instalar este paquete en GBOTtel

1. Extrae el proyecto GBOTtel en `C:\gbottel`.
2. Copia la carpeta `.ai` de este paquete dentro de la raíz del proyecto.
3. Copia `docs/BITACORA_GBOTtel.md` dentro de la carpeta `docs` existente, si existe.
4. NO reemplaces `AGENTS.md` ni `CLAUDE.md`; ya existen y contienen reglas específicas.
5. NO ejecutes todavía `npm install`.
6. NO ejecutes todavía `npx expo prebuild`.
7. NO reconstruyas `android/` hasta terminar la auditoría inicial.
8. Después de copiar los archivos, haz un commit inicial en Git.

## Importante
Este paquete solo crea documentación y protocolo. No modifica código de GBOTtel.

## Próxima fase
Auditar:
- package.json / lockfile
- app.json
- tsconfig
- babel/metro
- src/app
- src/components
- src/database
- src/services
- src/types
- seed de servicios
- configuración Expo
- dependencias
- reglas AGENTS/CLAUDE

El tarifario permanece congelado.
