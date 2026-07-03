-- ════════════════════════════════════════════════════════════════════════════
-- 0033 — CO-DUEÑOS con plenos poderes: expulsar (con salvaguardas)
-- ════════════════════════════════════════════════════════════════════════════
-- Issue #624. Decisión del dueño: "los co-dueños pueden hacer todo". Hoy
-- `group_members_delete` (0004) solo deja borrar filas ajenas al CREADOR RAÍZ
-- (`groups.created_by`); un co-dueño (role='owner' vía 0026) no puede expulsar
-- a nadie — recibiría 0 filas. Esta migración amplía el DELETE a cualquier
-- dueño, con salvaguardas para que nadie escale más allá de lo que le toca:
--
--   (a) el CREADOR RAÍZ expulsa a CUALQUIERA menos a sí mismo (ni siquiera él
--       puede salir por esta vía: "salir" es la fila propia, y el creador no
--       sale sin transferir antes — lo exige también lib/membership.leaveGroup).
--   (b) un CO-DUEÑO (role='owner', helper `is_group_owner` de 0026) SOLO borra
--       filas con role='member'. No puede expulsar a otro co-dueño ni al
--       creador (su fila es siempre role='owner' tras el backfill de 0026) —
--       eso sigue siendo privilegio exclusivo del creador raíz.
--   (c) cualquiera borra su PROPIA fila para salir, salvo el creador raíz — así
--       no se auto-expulsa un dueño sin dueño (grupo huérfano de admin). Esto
--       formaliza en RLS lo que hoy solo bloqueaba el cliente
--       (`leaveGroup` lanza si `created_by = userId`): incluso saltándose el
--       cliente, la BD ya lo impedía informalmente porque el creador nunca
--       necesitaba usar esta vía; ahora queda explícito y a prueba de bypass.
--
-- Sin recursión: igual que 0026, la comprobación de co-dueño usa el helper
-- SECURITY DEFINER `is_group_owner(gid)` (se salta la RLS de group_members) y
-- la del creador raíz usa una subconsulta a `groups` (otra tabla, no hay
-- recursión posible). El `role = 'member'` de (b) se lee de la propia fila
-- que se intenta borrar (la policy ve la fila objetivo en `using`).
--
-- Promover/degradar roles (`group_members_update_owner`, 0026) y transferir la
-- propiedad raíz (`groups_transfer_owner`, 0009) NO cambian: siguen siendo
-- privilegio de cualquier owner y del creador respectivamente.
--
-- DATA-PRESERVING: solo drop+create de una policy. No mueve datos.
-- NO aplicar a producción a mano: lo aplica el orquestador tras el merge.

drop policy if exists "group_members_delete" on public.group_members;
create policy "group_members_delete" on public.group_members
  for delete to authenticated
  using (
    -- (a) creador raíz: a cualquiera menos a sí mismo.
    (
      user_id <> auth.uid()
      and exists (
        select 1 from public.groups g
        where g.id = group_id and g.created_by = auth.uid()
      )
    )
    -- (b) co-dueño: solo filas de miembros (nunca otro dueño, nunca al creador).
    or (public.is_group_owner(group_id) and role = 'member')
    -- (c) salir: la fila propia, salvo la del creador raíz.
    or (
      user_id = auth.uid()
      and not exists (
        select 1 from public.groups g
        where g.id = group_id and g.created_by = auth.uid()
      )
    )
  );
