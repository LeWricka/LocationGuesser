-- ════════════════════════════════════════════════════════════════════════════
-- 0031 — SEGURIDAD: cerrar escalada a CO-DUEÑO por auto-insert de `role`
-- ════════════════════════════════════════════════════════════════════════════
-- Issue #328 (vulnerabilidad CRÍTICA en prod).
--
-- AGUJERO: la policy `group_members_insert_self` (0004) solo comprobaba
--   `with check (user_id = auth.uid())` y NO restringía la columna `role`. Desde
--   que 0026 (co-dueños) convirtió `role='owner'` en credencial de administrador
--   (is_group_owner → UPDATE/DELETE de groups/challenges/imágenes + gestión de
--   roles), CUALQUIER usuario autenticado podía auto-insertarse en
--   `group_members` con `role='owner'` en cualquier grupo cuyo id conociera
--   (`groups_select_authenticated` deja leer los ids) y así ESCALAR a co-dueño de
--   un grupo ajeno, ganando permisos de administrador sobre él.
--
-- FIX: el INSERT propio sigue permitido (auto-join), pero el `role` queda atado:
--   · un usuario corriente solo puede auto-insertarse con `role='member'`;
--   · el CREADOR del grupo (`groups.created_by = auth.uid()`) puede insertarse
--     como 'owner' — lo necesita el alta del dueño al crear el grupo
--     (joinGroupAsOwner), que corre DESPUÉS de insertar la fila en `groups`.
--   La promoción a co-dueño sigue pasando SOLO por el UPDATE gobernado por
--   `group_members_update_owner` (0026), que solo un owner puede ejecutar. Esta
--   migración NO toca esa policy ni ninguna otra.
--
-- DATA-PRESERVING: solo recrea una policy (drop+create). No mueve datos.
-- NO aplicar a producción a mano: lo aplica el pipeline db-migrate al mergear.

drop policy if exists "group_members_insert_self" on public.group_members;
create policy "group_members_insert_self" on public.group_members
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      role = 'member'
      or exists (
        select 1 from public.groups g
        where g.id = group_id and g.created_by = auth.uid()
      )
    )
  );
