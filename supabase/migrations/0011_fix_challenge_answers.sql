-- 0011 — arreglar respuestas huérfanas + permitir a MIEMBROS escribir la respuesta
-- ════════════════════════════════════════════════════════════════════════════
-- Tras la 0010 aparecieron retos sin fila en `challenge_answers`, lo que rompe la
-- RPC `submit_vote` (hace JOIN interno con challenge_answers → "Reto no encontrado",
-- P0002). Dos causas:
--   1) Retos creados en la ventana del despliegue de 0010 (migración aplicada, pero
--      el código que inserta challenge_answers aún no estaba en vivo).
--   2) Desajuste de RLS: `challenges_insert_member` (0004) deja crear un reto a
--      CUALQUIER miembro, pero `challenge_answers_write_owner` (0010) solo dejaba
--      escribir la respuesta al DUEÑO del grupo. Un miembro no-dueño creaba el reto
--      pero la RLS rechazaba su respuesta → reto huérfano.
--
-- Esta migración es DATA-PRESERVING y segura (no toca votos ni retos; solo añade
-- respuestas que faltaban y reajusta políticas).

-- (1) BACKFILL: respuesta para todo reto que no la tenga (sigue en challenges.lat/lng).
insert into public.challenge_answers (challenge_id, lat, lng)
select c.id, c.lat, c.lng
from public.challenges c
where not exists (
  select 1 from public.challenge_answers a where a.challenge_id = c.id
)
on conflict (challenge_id) do nothing;

-- (2) RLS alineada con la creación de retos:
--   · INSERT de la respuesta: cualquier MIEMBRO del grupo del reto (igual que
--     challenges_insert_member). Es quien crea el reto y escribe su respuesta.
--   · UPDATE/DELETE de la respuesta: solo el DUEÑO (igual que challenges_update_owner,
--     que ya limita la edición del reto al dueño).
drop policy if exists "challenge_answers_write_owner" on public.challenge_answers;

create policy "challenge_answers_insert_member" on public.challenge_answers
  for insert to authenticated
  with check (
    exists (
      select 1 from public.challenges c
      where c.id = challenge_answers.challenge_id
        and public.is_group_member(c.group_id)
    )
  );

create policy "challenge_answers_update_owner" on public.challenge_answers
  for update to authenticated
  using (
    exists (
      select 1 from public.challenges c join public.groups g on g.id = c.group_id
      where c.id = challenge_answers.challenge_id and g.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.challenges c join public.groups g on g.id = c.group_id
      where c.id = challenge_answers.challenge_id and g.created_by = auth.uid()
    )
  );

create policy "challenge_answers_delete_owner" on public.challenge_answers
  for delete to authenticated
  using (
    exists (
      select 1 from public.challenges c join public.groups g on g.id = c.group_id
      where c.id = challenge_answers.challenge_id and g.created_by = auth.uid()
    )
  );
