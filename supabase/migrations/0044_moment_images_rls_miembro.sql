-- 0044_moment_images_rls_miembro — alinear la RLS de moment_images con la de challenges
--
-- BUG en prod (RLS 42501 "new row violates row-level security policy for table
-- moment_images"): un MIEMBRO (no dueño) crea un momento con fotos y falla al subir
-- las fotos. Causa: el issue #783 abrió CREAR momentos/retos a cualquier miembro
-- (`challenges_insert_member` usa `is_group_member`), pero la política de INSERT de
-- `moment_images` se quedó en SOLO DUEÑO (`g.created_by = auth.uid()`). Así, el
-- miembro inserta la fila de `challenges` pero NO sus `moment_images` → 42501. Al
-- dueño le funciona (por eso pasó desapercibido: nadie ejercitó el caso miembro, y
-- la RLS no la tocan los tests herméticos que stubean Supabase).
--
-- Fix: replicar en `moment_images` el MISMO modelo que `challenges`:
--   · INSERT  → cualquier MIEMBRO del grupo que sea el CREADOR del momento, grupo
--               abierto (espejo de `challenges_insert_member`: is_group_member +
--               created_by = auth.uid() + closed_at IS NULL).
--   · UPDATE/DELETE → DUEÑO o CO-DUEÑO (`is_group_owner`) o el creador del momento
--               (espejo de `challenges_update_owner`/`challenges_delete_owner`), y
--               de paso se incluye a los CO-DUEÑOS, que la policy anterior (solo
--               `g.created_by`) tampoco cubría.
--   · SELECT  → sin cambios (`moment_images_select_member`, cualquier miembro).

-- INSERT: miembro + creador del momento + grupo abierto.
drop policy if exists moment_images_insert_owner on public.moment_images;
create policy moment_images_insert_member on public.moment_images
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.challenges c
      join public.groups g on g.id = c.group_id
      where c.id = moment_images.challenge_id
        and public.is_group_member(c.group_id)
        and c.created_by = auth.uid()
        and g.closed_at is null
    )
  );

-- UPDATE: dueño/co-dueño o el creador del momento.
drop policy if exists moment_images_update_owner on public.moment_images;
create policy moment_images_update_member on public.moment_images
  for update to authenticated
  using (
    exists (
      select 1
      from public.challenges c
      where c.id = moment_images.challenge_id
        and (public.is_group_owner(c.group_id) or c.created_by = auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.challenges c
      where c.id = moment_images.challenge_id
        and (public.is_group_owner(c.group_id) or c.created_by = auth.uid())
    )
  );

-- DELETE: dueño/co-dueño o el creador del momento.
drop policy if exists moment_images_delete_owner on public.moment_images;
create policy moment_images_delete_member on public.moment_images
  for delete to authenticated
  using (
    exists (
      select 1
      from public.challenges c
      where c.id = moment_images.challenge_id
        and (public.is_group_owner(c.group_id) or c.created_by = auth.uid())
    )
  );
