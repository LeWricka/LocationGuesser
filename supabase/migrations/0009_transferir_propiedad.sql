-- 0009_transferir_propiedad — permitir al dueño TRANSFERIR la propiedad del grupo
-- Issue #146 (CRUD básico: gestión de reto, grupo y miembros), punto 7.
--
-- Problema: la policy `groups_update_owner` (migración 0004) tiene
--   USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid())
-- El WITH CHECK exige que la fila RESULTANTE siga teniendo created_by = auth.uid(),
-- así que un UPDATE que ponga created_by a OTRO usuario (transferir) es rechazado.
-- Eso bloquea el flujo de "salir siendo dueño → transferir antes" (#146).
--
-- Solución: una policy adicional de UPDATE para el dueño actual que SÍ permite
-- mover created_by a otro usuario, siempre que el nuevo dueño sea ya MIEMBRO del
-- grupo (no se regala un grupo a un extraño). El USING sigue restringiendo a que
-- quien ejecuta el UPDATE sea el dueño actual. Las policies de UPDATE se combinan
-- con OR, por lo que esta convive con `groups_update_owner` (edición normal:
-- nombre, premios) sin romperla.
--
-- NO aplicar a producción aquí: lo coordina el orquestador (ver always.md §6).

drop policy if exists "groups_transfer_owner" on public.groups;
create policy "groups_transfer_owner" on public.groups
  for update to authenticated
  using (created_by = auth.uid())
  with check (
    -- El nuevo dueño debe ser miembro del propio grupo.
    exists (
      select 1 from public.group_members m
      where m.group_id = id and m.user_id = created_by
    )
  );
