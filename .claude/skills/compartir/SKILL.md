---
name: compartir
description: Sincroniza con el remoto. Si hay cambios sin commitear, hace /guardar antes. Luego pull --rebase y push.
---

# Compartir

**Comando: `/compartir`**

Ejecuta directo. Si hay cambios sin commitear, ejecuta el flujo de `/guardar` primero (sin preguntar).

## Flujo

1. `git status` — si hay cambios sin commitear, ejecutar `/guardar` primero.
2. `git pull --rebase`
   - Si hay conflictos: mostrarlos y ayudar a resolverlos (esto sí requiere al usuario).
3. `git push`
   - Si no hay remoto configurado, avisar y explicar cómo añadirlo (`git remote add origin …`).
4. Mostrar resumen: rama → remoto, commits subidos, estado.

## Reglas

- NO preguntar confirmación.
- SIEMPRE pull antes de push. NUNCA force push.
- Parar solo si hay conflictos de merge.
