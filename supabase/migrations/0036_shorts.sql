-- ════════════════════════════════════════════════════════════════════════════
-- 0036 — SHORTS: clip de vídeo corto en el momento — columna video_path
-- ════════════════════════════════════════════════════════════════════════════
-- Issue #649. Un recuerdo (NUNCA un reto, ver la nota de privacidad más abajo)
-- puede llevar, además de foto(s), texto y nota de voz, UN clip de vídeo corto
-- (v1: ≤15s, ≤40MB, sin transcodificar). Igual que `image_path`/`audio_path`,
-- solo guardamos el PATH en el bucket `images` (prefijo `video/<uuid>.<ext>`,
-- misma RLS y URLs firmadas que fotos y audio; no hace falta un bucket nuevo).
--
-- ── PRIVACIDAD (guardarraíl del issue) ──────────────────────────────────────
-- A diferencia de `image_path` y `audio_path` (documentados como "no es
-- spoiler, se sirve siempre, en recuerdo y en reto"), `video_path` NO entra en
-- `CHALLENGE_COLUMNS_NO_ANSWER` (web/src/lib/challenges.ts) y por tanto NUNCA
-- se sirve al JUGAR un reto: un contenedor MP4 puede llevar sus propias
-- coordenadas GPS en los metadatos del contenedor (quicktime `©xyz`/`gps`),
-- a diferencia del JPEG que servimos (ya sale de un `<canvas>` en cliente, sin
-- EXIF) — sería un canal de fuga de la respuesta oculta si se sirviera al
-- adivinar. `video_path` solo se lee en el contexto de RECUERDO (la pestaña
-- Fotos y la hoja de detalle del viaje, vía una consulta APARTE que filtra
-- `is_challenge = false`; ver `useTripData.ts`). Como defensa en profundidad,
-- `promoteToChallenge` (challenges.ts) además VACÍA `video_path` explícitamente
-- al convertir un recuerdo en reto, aunque ya no se leería por lo anterior.
--
-- DATA-PRESERVING y BACKWARD-COMPATIBLE: columna nullable sin default; todos
-- los momentos existentes quedan con `video_path = null` (sin clip, comporta-
-- miento idéntico al de hoy).
--
-- NO aplicar a producción a mano: lo aplica el orquestador/dueño tras el merge.

alter table public.challenges
  add column if not exists video_path text;

comment on column public.challenges.video_path is
  'Path en Storage (bucket images, prefijo video/<uuid>.<ext>) del clip de vídeo '
  'corto opcional del MOMENTO (v1: un único clip, ≤15s, ≤40MB, sin transcodificar). '
  'SOLO para recuerdos: a diferencia de image_path/audio_path, esta columna NO se '
  'sirve al jugar un reto (no está en CHALLENGE_COLUMNS_NO_ANSWER) porque el propio '
  'contenedor MP4 puede llevar coordenadas GPS en sus metadatos, a diferencia del '
  'JPEG (que ya sale de canvas, sin EXIF) — sería un canal de fuga de la respuesta. '
  'Null = sin clip. Migración 0036.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. RLS de Storage `images` — reconocer `video_path` (mismo criterio que
--    `image_path`/`audio_path`, 0025/0026/0035)
-- ════════════════════════════════════════════════════════════════════════════
-- Recreamos las TRES policies que hacen JOIN por nombre de objeto
-- (`images_select_member`, `images_update_owner`, `images_delete_owner`) para
-- añadir una cuarta rama `c.video_path = storage.objects.name`, con la MISMA
-- regla de pertenencia/propiedad que ya aplica a `image_path`/`audio_path`.
-- Esta policy solo gobierna QUIÉN puede LEER/actualizar/borrar el objeto en
-- Storage (miembro del grupo / dueño) — es ortogonal a la guarda de
-- aplicación de la sección 1 (que decide CUÁNDO se pide una URL firmada de
-- `video_path`, nunca al jugar un reto). INSERT (`images_insert_authenticated`,
-- abierta a autenticados) NO cambia: sigue sin poder validar pertenencia antes
-- de que exista la fila que referencia el objeto (mismo motivo que 0025/0035).
drop policy if exists "images_select_member" on storage.objects;
create policy "images_select_member" on storage.objects
  for select to authenticated using (
    bucket_id = 'images'
    and (
      exists (
        select 1
        from public.challenges c
        where c.image_path = storage.objects.name
          and public.is_group_member(c.group_id)
      )
      or exists (
        select 1
        from public.moment_images mi
        join public.challenges c on c.id = mi.challenge_id
        where mi.image_path = storage.objects.name
          and public.is_group_member(c.group_id)
      )
      or exists (
        select 1
        from public.challenges c
        where c.audio_path = storage.objects.name
          and public.is_group_member(c.group_id)
      )
      or exists (
        select 1
        from public.challenges c
        where c.video_path = storage.objects.name
          and public.is_group_member(c.group_id)
      )
    )
  );

drop policy if exists "images_update_owner" on storage.objects;
create policy "images_update_owner" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'images'
    and (
      exists (
        select 1
        from public.challenges c
        where c.image_path = storage.objects.name
          and (
            c.created_by = auth.uid()
            or public.is_group_owner(c.group_id)
            or exists (
              select 1 from public.groups g
              where g.id = c.group_id and g.created_by = auth.uid()
            )
          )
      )
      or exists (
        select 1
        from public.moment_images mi
        join public.challenges c on c.id = mi.challenge_id
        where mi.image_path = storage.objects.name
          and (
            c.created_by = auth.uid()
            or public.is_group_owner(c.group_id)
            or exists (
              select 1 from public.groups g
              where g.id = c.group_id and g.created_by = auth.uid()
            )
          )
      )
      or exists (
        select 1
        from public.challenges c
        where c.audio_path = storage.objects.name
          and (
            c.created_by = auth.uid()
            or public.is_group_owner(c.group_id)
            or exists (
              select 1 from public.groups g
              where g.id = c.group_id and g.created_by = auth.uid()
            )
          )
      )
      or exists (
        select 1
        from public.challenges c
        where c.video_path = storage.objects.name
          and (
            c.created_by = auth.uid()
            or public.is_group_owner(c.group_id)
            or exists (
              select 1 from public.groups g
              where g.id = c.group_id and g.created_by = auth.uid()
            )
          )
      )
    )
  )
  with check (
    bucket_id = 'images'
    and (
      exists (
        select 1
        from public.challenges c
        where c.image_path = storage.objects.name
          and (
            c.created_by = auth.uid()
            or public.is_group_owner(c.group_id)
            or exists (
              select 1 from public.groups g
              where g.id = c.group_id and g.created_by = auth.uid()
            )
          )
      )
      or exists (
        select 1
        from public.moment_images mi
        join public.challenges c on c.id = mi.challenge_id
        where mi.image_path = storage.objects.name
          and (
            c.created_by = auth.uid()
            or public.is_group_owner(c.group_id)
            or exists (
              select 1 from public.groups g
              where g.id = c.group_id and g.created_by = auth.uid()
            )
          )
      )
      or exists (
        select 1
        from public.challenges c
        where c.audio_path = storage.objects.name
          and (
            c.created_by = auth.uid()
            or public.is_group_owner(c.group_id)
            or exists (
              select 1 from public.groups g
              where g.id = c.group_id and g.created_by = auth.uid()
            )
          )
      )
      or exists (
        select 1
        from public.challenges c
        where c.video_path = storage.objects.name
          and (
            c.created_by = auth.uid()
            or public.is_group_owner(c.group_id)
            or exists (
              select 1 from public.groups g
              where g.id = c.group_id and g.created_by = auth.uid()
            )
          )
      )
    )
  );

drop policy if exists "images_delete_owner" on storage.objects;
create policy "images_delete_owner" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'images'
    and (
      exists (
        select 1
        from public.challenges c
        where c.image_path = storage.objects.name
          and (
            c.created_by = auth.uid()
            or public.is_group_owner(c.group_id)
            or exists (
              select 1 from public.groups g
              where g.id = c.group_id and g.created_by = auth.uid()
            )
          )
      )
      or exists (
        select 1
        from public.moment_images mi
        join public.challenges c on c.id = mi.challenge_id
        where mi.image_path = storage.objects.name
          and (
            c.created_by = auth.uid()
            or public.is_group_owner(c.group_id)
            or exists (
              select 1 from public.groups g
              where g.id = c.group_id and g.created_by = auth.uid()
            )
          )
      )
      or exists (
        select 1
        from public.challenges c
        where c.audio_path = storage.objects.name
          and (
            c.created_by = auth.uid()
            or public.is_group_owner(c.group_id)
            or exists (
              select 1 from public.groups g
              where g.id = c.group_id and g.created_by = auth.uid()
            )
          )
      )
      or exists (
        select 1
        from public.challenges c
        where c.video_path = storage.objects.name
          and (
            c.created_by = auth.uid()
            or public.is_group_owner(c.group_id)
            or exists (
              select 1 from public.groups g
              where g.id = c.group_id and g.created_by = auth.uid()
            )
          )
      )
    )
  );
