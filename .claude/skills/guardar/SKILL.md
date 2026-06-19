---
name: guardar
description: Commit de los cambios actuales con mensaje en formato Conventional Commits (español). No hace push.
---

# Guardar

**Comando: `/guardar`**

Ejecuta directo, sin pedir confirmación.

## Flujo

1. `git status` — si no hay cambios, informar y terminar.
2. `git add -A` (excluyendo `.env` o credenciales).
3. Generar mensaje en **Conventional Commits, en español**:
   ```
   type(scope): descripción
   ```
   - **type:** `feat | fix | refactor | perf | test | docs | style | build | ci | chore | revert`.
   - **scope:** área afectada (`web`, `docs`, `legacy`, `db`, `config`, `deps`, `ci`…). Opcional pero recomendado.
   - **descripción:** imperativo presente, minúscula, ≤72 caracteres. Describe QUÉ, no CÓMO.
   - Cuerpo opcional tras línea en blanco para cambios complejos (decisiones, breaking changes con `BREAKING CHANGE:`). Sin emojis. HEREDOC.
4. `git commit`.
5. Mostrar resumen: hash + mensaje + archivos.

## Reglas

- NO preguntar confirmación.
- NO hacer push (eso es `/compartir`).
- Excluir archivos sensibles (`.env`, credenciales) en silencio.
- Si hay varios cambios sin relación, considerar dividir en commits separados por `type/scope`.
