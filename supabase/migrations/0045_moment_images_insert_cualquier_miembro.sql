-- 0045_moment_images_insert_cualquier_miembro — INSERT de fotos por CUALQUIER miembro
--
-- BUG en prod (RLS 42501, reportado por Sara/Sheila): «no pueden subir fotos». El
-- 0044 alineó `moment_images` con `challenges` pero se pasó de ESTRICTO en el
-- INSERT: exigía `c.created_by = auth.uid()` (solo añadir fotos a un momento que
-- TÚ creaste). Eso desbloqueó «crear momento con fotos» (mismo usuario crea el
-- reto y sus fotos) pero NO el flujo `moment_gallery_add` (añadir fotos a un
-- momento YA existente que creó otra persona, o creado por tu cuenta permanente
-- cuando ahora entras con la anónima). En un diario de viaje COMPARTIDO, cualquier
-- miembro aporta al viaje — igual que ya puede crear momentos (`challenges_insert_member`)
-- y ver todas las fotos (`moment_images_select_member`).
--
-- Fix: el INSERT solo exige ser MIEMBRO del grupo y que el viaje esté abierto (se
-- quita `c.created_by = auth.uid()`). UPDATE/DELETE se dejan como en 0044
-- (dueño/co-dueño o creador): borrar/editar fotos ajenas sí es acción de gestión.

drop policy if exists moment_images_insert_member on public.moment_images;
create policy moment_images_insert_member on public.moment_images
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.challenges c
      join public.groups g on g.id = c.group_id
      where c.id = moment_images.challenge_id
        and public.is_group_member(c.group_id)
        and g.closed_at is null
    )
  );
