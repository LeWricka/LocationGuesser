-- ════════════════════════════════════════════════════════════════════════════
-- 0035 — NOTA DE VOZ en el momento: columna audio_path
-- ════════════════════════════════════════════════════════════════════════════
-- Issue #648. Un recuerdo (o reto) puede llevar, además de foto y texto, una
-- nota de voz corta (≤60s) grabada con MediaRecorder. Igual que `image_path`,
-- solo guardamos el PATH en el bucket `images` (prefijo `audio/<uuid>.<ext>`,
-- misma RLS y URLs firmadas que las fotos; no hace falta un bucket nuevo). La
-- extensión real depende del navegador (opus/webm en Chrome, aac/mp4 en
-- Safari): no forzamos un único formato, así que NO hay `check` de extensión.
--
-- NO es spoiler (igual que image_path): se sirve siempre, tanto en un
-- RECUERDO como en un RETO — oír la voz de quien lo compartió no revela la
-- ubicación oculta. Por eso entra en `CHALLENGE_COLUMNS_NO_ANSWER` del cliente
-- (web/src/lib/challenges.ts), sin tocar `challenge_answers` ni su RLS.
--
-- DATA-PRESERVING y BACKWARD-COMPATIBLE: columna nullable sin default; todos
-- los momentos existentes quedan con `audio_path = null` (sin nota de voz,
-- comportamiento idéntico al de hoy).
--
-- OJO — esta migración TAMBIÉN toca las policies de RLS de `storage.objects`
-- del bucket `images` (sección 2): sin eso, `audio_path` se podría SUBIR (el
-- INSERT ya es abierto a autenticados, 0025) pero NUNCA LEER — `signedImageUrl`
-- (createSignedUrl) exige la policy SELECT, que hoy solo reconoce
-- `challenges.image_path`/`moment_images.image_path`. Sin este cambio, ni
-- siquiera el propio dueño podría reproducir su nota de voz.
--
-- NO aplicar a producción a mano: lo aplica el orquestador/dueño tras el merge.

alter table public.challenges
  add column if not exists audio_path text;

comment on column public.challenges.audio_path is
  'Path en Storage (bucket images, prefijo audio/<uuid>.<ext>) de la nota de voz '
  'opcional del momento (≤60s, grabada con MediaRecorder). Extensión según el MIME '
  'real del navegador (webm/opus, mp4/aac…): sin formato único forzado. No es '
  'spoiler (como image_path): se sirve siempre, en recuerdo y en reto. Null = sin '
  'nota de voz. Migración 0035.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. RLS de Storage `images` — reconocer `audio_path` (mismo criterio que
--    `image_path`, 0025/0026)
-- ════════════════════════════════════════════════════════════════════════════
-- Recreamos las TRES policies que hacen JOIN por nombre de objeto
-- (`images_select_member`, `images_update_owner`, `images_delete_owner`) para
-- añadir una tercera rama `c.audio_path = storage.objects.name`, con la MISMA
-- regla de pertenencia/propiedad que ya aplica a `image_path`. INSERT
-- (`images_insert_authenticated`, abierta a autenticados) NO cambia: sigue sin
-- poder validar pertenencia antes de que exista la fila que referencia el
-- objeto (mismo motivo que ya justificaba 0025 para las fotos).
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
    )
  );
