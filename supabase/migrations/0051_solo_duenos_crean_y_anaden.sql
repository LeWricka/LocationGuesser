-- ════════════════════════════════════════════════════════════════════════════
-- 0051 — solo DUEÑO/CO-DUEÑO crean, editan, invitan y comparten
-- ════════════════════════════════════════════════════════════════════════════
-- Issue #962. Decisión de producto del dueño: el viaje lo CURAN el dueño y los
-- co-dueños (`is_group_owner(group_id)` = creador raíz + `group_members.role =
-- 'owner'`, issue #26); los MIEMBROS solo juegan (votan/adivinan) y ven. Para
-- que alguien aporte, el dueño lo promueve a co-dueño (enlace de co-dueño,
-- issue #38/`InviteModal`).
--
-- Esto REVIERTE A PROPÓSITO dos migraciones anteriores que abrieron crear/
-- añadir a CUALQUIER miembro:
--   · #783/0020: `challenges_insert_member` — cualquier miembro creaba
--     momentos/retos. Vuelve a exigir ser DUEÑO/CO-DUEÑO.
--   · 0045 (bug Sara/Sheila, #937): `moment_images_insert_member` — cualquier
--     miembro añadía fotos a un momento ya existente. Vuelve a exigir ser
--     DUEÑO/CO-DUEÑO del grupo del momento.
--
-- SIN CAMBIOS (a propósito):
--   · SELECT de `challenges`/`moment_images`: los miembros siguen viendo TODO
--     el viaje (diario, bitácora, marcador) — solo se curan crear/añadir, no
--     ver.
--   · `votes` INSERT / `submit_vote`: los miembros SIGUEN jugando (votar/
--     adivinar no es "aportar contenido", es la mecánica del reto).
--   · UPDATE/DELETE de `challenges`/`moment_images` (0026/0044): YA eran de
--     dueño/co-dueño — se confirman, no se tocan.
--
-- El cliente (`web/src/features/trip/TripPage.tsx` y sátélites) deja de
-- OFRECER crear/añadir/invitar/compartir a un miembro raso (gate por
-- `isOwner`); esta migración es la defensa real en el servidor.
-- ════════════════════════════════════════════════════════════════════════════

-- ── challenges — INSERT: DUEÑO/CO-DUEÑO (antes: cualquier miembro) ─────────
drop policy if exists "challenges_insert_member" on public.challenges;
create policy "challenges_insert_owner" on public.challenges
  for insert to authenticated
  with check (
    public.is_group_owner(group_id)
    and created_by = auth.uid()
    and exists (
      select 1 from public.groups g
      where g.id = group_id and g.closed_at is null
    )
  );

-- ── moment_images — INSERT: DUEÑO/CO-DUEÑO del grupo del momento (antes:
--    cualquier miembro, 0045) ─────────────────────────────────────────────
drop policy if exists moment_images_insert_member on public.moment_images;
create policy moment_images_insert_owner on public.moment_images
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.challenges c
      join public.groups g on g.id = c.group_id
      where c.id = moment_images.challenge_id
        and public.is_group_owner(c.group_id)
        and g.closed_at is null
    )
  );
