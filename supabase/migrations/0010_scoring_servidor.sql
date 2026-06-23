-- ════════════════════════════════════════════════════════════════════════════
-- 0010 — Scoring con AUTORIDAD DE SERVIDOR + ocultar la respuesta antes de votar
-- ════════════════════════════════════════════════════════════════════════════
-- Issue #150. Hallazgo crítico de la auditoría (docs/calidad/auditoria-tecnica.md §5.1):
-- el bucle competitivo no tenía autoridad de servidor.
--
--   1) Los `points` los calculaba y los mandaba el CLIENTE (lib/votes.ts) y la RLS de
--      `votes` solo validaba autoría (user_id = auth.uid()): un miembro podía inyectar
--      `points: 5000` en cada reto y liderar la clasificación.
--   2) La respuesta del reto (`lat`/`lng`) era legible por cualquier miembro ANTES de
--      votar (getChallenge devolvía la fila entera): se podía leer en la pestaña de red.
--
-- Esta migración resuelve (1) por completo a nivel de BD y monta la pieza de servidor
-- de (2): una RPC `submit_vote` SECURITY DEFINER que es el ÚNICO camino para puntuar, y
-- una tabla-respuesta `challenge_answers` gobernada por RLS (legible solo si el reto está
-- cerrado o si ya votaste). La fórmula de puntos se REPLICA EXACTAMENTE de geo.ts
-- (`5000 * exp(-km/2000)`, redondeado) y la distancia con la MISMA haversine (R=6371 km):
-- la puntuación numérica de un mismo acierto NO cambia.
--
-- ────────────────────────────────────────────────────────────────────────────
-- DATA-PRESERVING: NO trunca ni reescribe ningún voto ni reto existentes.
--   · `challenge_answers` se BACKFILLEA desde `challenges.lat/lng` (todos los retos,
--     vivos y cerrados, conservan su respuesta).
--   · Los `votes` existentes (incluidos los de timeout de 0007: points=0, guess null)
--     se quedan intactos: la RPC hace UPSERT idempotente por (challenge_id, user_id),
--     así que revotar es imposible (igual que hoy) y los puntos ya guardados no cambian.
--   · `challenges.lat/lng` SE MANTIENEN tal cual (no se nulifican ni se revoca su
--     privilegio de columna): los lectores actuales de retos cerrados (GroupPage,
--     EditChallenge, membership, groupData) siguen funcionando sin tocarlos. Ver NOTA.
--
-- NO aplicar a producción desde aquí: lo coordina el orquestador con el usuario
-- (no hay staging). Ver always.md §6.
--
-- ────────────────────────────────────────────────────────────────────────────
-- NOTA sobre la ocultación de la respuesta (enfoque elegido — opción (a) parcial):
--   · La pieza de SERVIDOR que oculta la respuesta es `challenge_answers` + su RLS:
--     la RPC `submit_vote` la devuelve al votar (revelado instantáneo) y un miembro
--     que recargue un reto YA votado (o ya cerrado) puede leerla por RLS.
--   · El CLIENTE (lib/challenges.getChallenge) deja de pedir `lat/lng` para el flujo de
--     jugar: el payload del mapa de adivinar ya NO contiene la respuesta.
--   · Cerrar el leak DIRECTO de `challenges.lat/lng` por REST (curl select=lat,lng en un
--     reto abierto) exige revocar el privilegio de COLUMNA de `challenges.lat/lng` (o
--     moverlas a esta tabla). Eso rompería a los lectores que hacen `select()` = `*`
--     sobre `challenges` y leen lat/lng de retos CERRADOS: `groupData.getGroupChallenges`,
--     `membership` y `GroupPage`/`EditChallenge` — TODOS fuera del alcance de #150.
--     Por eso ese paso (revocar columna + apuntar esos lectores a `challenge_answers`)
--     se deja como FOLLOW-UP coordinado, no en esta migración. Al final del fichero hay
--     el bloque exacto, COMENTADO, listo para ese paso. Ver el PR para el detalle.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. challenge_answers — la respuesta del reto, gobernada por RLS
-- ════════════════════════════════════════════════════════════════════════════
-- 1:1 con challenges (PK = FK, on delete cascade). Guarda lat/lng = la respuesta.
-- Es la fuente que la RPC consulta server-side y la que el cliente lee SOLO cuando
-- tiene derecho (reto cerrado o ya votó). Mantener separada de `challenges` permite
-- una RLS de SELECT distinta a la del reto (el reto en sí —título, escena— se ve
-- siempre que seas miembro; la RESPUESTA, no, hasta que votes o cierre).
create table if not exists public.challenge_answers (
  challenge_id uuid primary key references public.challenges (id) on delete cascade,
  lat double precision not null,
  lng double precision not null
);

-- BACKFILL idempotente desde los retos existentes (vivos y cerrados conservan su
-- respuesta). `on conflict do nothing`: re-ejecutar la migración no duplica.
insert into public.challenge_answers (challenge_id, lat, lng)
select c.id, c.lat, c.lng
from public.challenges c
on conflict (challenge_id) do nothing;

alter table public.challenge_answers enable row level security;

-- SELECT: la respuesta es legible si
--   (a) el reto ya está CERRADO (deadline_at <= now()): histórico "anteriores"; o
--   (b) el solicitante YA tiene un voto en ese reto (votó → se le revela).
-- En ambos casos hay que ser MIEMBRO del grupo del reto (perímetro de 0004).
-- Un reto ABIERTO sin voto del solicitante: NO legible (es el caso que protegemos).
drop policy if exists "challenge_answers_select" on public.challenge_answers;
create policy "challenge_answers_select" on public.challenge_answers
  for select to authenticated
  using (
    exists (
      select 1
      from public.challenges c
      where c.id = challenge_answers.challenge_id
        and public.is_group_member(c.group_id)
        and (
          c.deadline_at <= now()
          or exists (
            select 1 from public.votes v
            where v.challenge_id = c.id and v.user_id = auth.uid()
          )
        )
    )
  );

-- INSERT/UPDATE/DELETE directos: solo el DUEÑO del grupo del reto (alineado con
-- challenges_update_owner/_delete_owner de 0004). El cliente NO escribe aquí en el
-- flujo normal: createChallenge inserta la respuesta vía esta policy (es el dueño al
-- crear su reto), y editar la ubicación de un reto sin votos la actualiza.
drop policy if exists "challenge_answers_write_owner" on public.challenge_answers;
create policy "challenge_answers_write_owner" on public.challenge_answers
  for all to authenticated
  using (
    exists (
      select 1 from public.challenges c
      join public.groups g on g.id = c.group_id
      where c.id = challenge_answers.challenge_id and g.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.challenges c
      join public.groups g on g.id = c.group_id
      where c.id = challenge_answers.challenge_id and g.created_by = auth.uid()
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 2. RLS de votes — el cliente ya NO puede escribir `points` arbitrario
-- ════════════════════════════════════════════════════════════════════════════
-- Quitamos el INSERT/UPDATE directos de `votes` para `authenticated` (las policies
-- votes_insert_self / votes_update_self de 0004). A partir de ahora el ÚNICO camino
-- para crear/actualizar un voto es la RPC `submit_vote` (SECURITY DEFINER), que calcula
-- los puntos server-side. Así `points` deja de poder falsearse desde el navegador.
--   · SELECT (marcador) y DELETE (tu propio voto) se MANTIENEN: no afectan a la
--     integridad de la puntuación.
--   · La unique (challenge_id, user_id) de 0004 sigue garantizando 1 voto por reto.
drop policy if exists "votes_insert_self" on public.votes;
drop policy if exists "votes_update_self" on public.votes;
-- votes_select_member y votes_delete_self (de 0004) se quedan como están.

-- ════════════════════════════════════════════════════════════════════════════
-- 3. RPC submit_vote — autoridad de servidor para puntuar (revela al votar)
-- ════════════════════════════════════════════════════════════════════════════
-- Contrato: submit_vote(p_challenge_id, p_lat, p_lng) -> (distance_km, points,
-- answer_lat, answer_lng). p_lat/p_lng NULL = voto de TIMEOUT (jugó pero no marcó):
-- se guarda points=0 sin guess (compatible con 0007); no devuelve la respuesta.
--
-- Hace, en una sola llamada autenticada:
--   1) valida que el solicitante es MIEMBRO del grupo del reto,
--   2) valida que el reto sigue ABIERTO (deadline_at > now()) para votar,
--   3) calcula distance_km (haversine, R=6371) y points (5000*exp(-km/2000) redondeado)
--      contra la respuesta real leída de challenge_answers — el cliente NO la envía,
--   4) UPSERT idempotente del voto por (challenge_id, user_id) con esos puntos,
--   5) devuelve distancia + puntos + la respuesta para el revelado instantáneo.
--
-- SECURITY DEFINER: corre con los privilegios del dueño de la función (se salta RLS),
-- por eso lee challenge_answers y escribe votes aunque hayamos cerrado el INSERT/UPDATE
-- directo. La validación de membresía/estado la hace la propia función (no la RLS).
-- search_path fijado para evitar secuestro de nombres (buena práctica en DEFINER).
create or replace function public.submit_vote(
  p_challenge_id uuid,
  p_lat double precision,
  p_lng double precision
)
returns table (
  distance_km double precision,
  points integer,
  answer_lat double precision,
  answer_lng double precision
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_group text;
  v_open  boolean;
  v_alat  double precision;
  v_alng  double precision;
  v_km    double precision;
  v_pts   integer;
  -- Constantes que REPLICAN geo.ts (no cambiar sin cambiar el cliente en paralelo).
  c_earth constant double precision := 6371;            -- radio terrestre en km
  c_base  constant double precision := 5000;            -- puntos máximos
  c_decay constant double precision := 2000;            -- escala de caída en km
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  -- Reto + estado abierto + respuesta, de una vez. Falla si el reto no existe.
  select c.group_id, (c.deadline_at > now()), a.lat, a.lng
    into v_group, v_open, v_alat, v_alng
  from public.challenges c
  join public.challenge_answers a on a.challenge_id = c.id
  where c.id = p_challenge_id;

  if not found then
    raise exception 'Reto no encontrado' using errcode = 'P0002';
  end if;

  -- Membresía: solo un miembro del grupo del reto puede votar.
  if not public.is_group_member(v_group) then
    raise exception 'No eres miembro del grupo de este reto' using errcode = '42501';
  end if;

  -- El reto debe seguir abierto para votar (con pin o por timeout).
  if not v_open then
    raise exception 'El reto ya está cerrado' using errcode = 'P0001';
  end if;

  if p_lat is null or p_lng is null then
    -- Voto de TIMEOUT: jugó pero no marcó → 0 puntos, sin pin (compatible con 0007).
    v_km  := null;
    v_pts := 0;
  else
    -- Haversine (idéntica a geo.haversine): dLat/dLng en radianes; clamp en sqrt.
    v_km := 2 * c_earth * asin(least(1, sqrt(
      power(sin(radians(v_alat - p_lat) / 2), 2)
      + cos(radians(p_lat)) * cos(radians(v_alat))
        * power(sin(radians(v_alng - p_lng) / 2), 2)
    )));
    -- Puntos (idéntico a geo.scoreFor): max(0, round(5000*exp(-km/2000))).
    v_pts := greatest(0, round(c_base * exp(-v_km / c_decay)))::integer;
  end if;

  -- UPSERT idempotente: revotar no duplica ni cambia un voto ya emitido a otra cosa
  -- (mismo comportamiento que el upsert del cliente de hoy). El group_id se toma del
  -- reto (no del cliente): no se puede atribuir el voto a otro grupo.
  insert into public.votes (group_id, challenge_id, user_id, guess_lat, guess_lng, distance_km, points)
  values (v_group, p_challenge_id, v_uid, p_lat, p_lng, v_km, v_pts)
  on conflict (challenge_id, user_id) do update
    set guess_lat   = excluded.guess_lat,
        guess_lng   = excluded.guess_lng,
        distance_km = excluded.distance_km,
        points      = excluded.points;

  -- Revelado: distancia + puntos + la respuesta (null en timeout: no se revela pin).
  return query select
    v_km,
    v_pts,
    case when p_lat is null then null else v_alat end,
    case when p_lat is null then null else v_alng end;
end;
$$;

-- Solo los usuarios autenticados pueden ejecutar la RPC (no el rol anónimo).
revoke all on function public.submit_vote(uuid, double precision, double precision) from public;
grant execute on function public.submit_vote(uuid, double precision, double precision) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- FOLLOW-UP COORDINADO (NO en esta migración) — cerrar el leak DIRECTO por REST
-- ════════════════════════════════════════════════════════════════════════════
-- Para que `select=lat,lng` por REST sobre un reto ABIERTO deje de devolver la
-- respuesta, hay que revocar el privilegio de COLUMNA y apuntar los lectores de retos
-- CERRADOS a challenge_answers. Esos lectores (groupData.getGroupChallenges, membership,
-- GroupPage, EditChallenge) están FUERA del alcance de #150, así que esto se hace en una
-- issue/PR aparte, en el MISMO despliegue coordinado. Bloque listo (déjalo comentado):
--
--   revoke select (lat, lng) on public.challenges from authenticated;
--   -- (y cambiar esos lectores a leer la respuesta de challenge_answers)
--
-- Hasta entonces, la respuesta de un reto abierto sigue siendo legible por REST directo
-- (no por el flujo de la app, que ya no la pide). El scoring, en cambio, queda blindado
-- desde ESTA migración: aunque conozcas la respuesta, los puntos los pone el servidor.
