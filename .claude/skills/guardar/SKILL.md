---
name: guardar
description: Commit de los cambios actuales con mensaje fechado en español. No hace push.
---

# Guardar

**Comando: `/guardar`**

Ejecuta directo, sin pedir confirmación.

## Flujo

1. `git status` — si no hay cambios, informar y terminar.
2. `git add -A` (excluyendo `.env` o credenciales).
3. Generar mensaje de commit con fecha (`date +"%Y-%m-%d %H:%M"`):
   ```
   YYYY-MM-DD HH:MM - [Descripción en español de qué se hizo]
   ```
   Cuerpo opcional de 1-3 líneas. Sin emojis. HEREDOC.
4. `git commit`.
5. Mostrar resumen: hash + mensaje + archivos.

## Reglas

- NO preguntar confirmación.
- NO hacer push (eso es `/compartir`).
- Excluir archivos sensibles (`.env`, credenciales) en silencio.
