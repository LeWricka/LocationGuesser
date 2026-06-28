-- ════════════════════════════════════════════════════════════════════════════
-- 0015 — marcar cuando el jugador SALE de la app durante la jugada (anti-trampa)
-- ════════════════════════════════════════════════════════════════════════════
-- Issue #200. Deterrente social anti-trampa: si el jugador cambia de pestaña/app
-- mientras el reloj corre (antes de votar), lo marcamos en su voto. No bloquea ni
-- penaliza puntos —solo deja un rastro visible en el marcador (un ⚠️ junto a su
-- nombre)— para que salir a "buscar" la respuesta tenga coste reputacional.
--
-- La detección la hace el CLIENTE (visibilitychange durante `playing`) y pasa el
-- resultado a la RPC `submit_vote` en un parámetro NUEVO `p_left_app` (default
-- false). El default mantiene compatibilidad con clientes que aún no lo pasen.
--
-- DATA-PRESERVING: solo añade una columna con default y recrea `submit_vote`
-- copiando EXACTAMENTE la lógica de scoring de la 0010 (distancia haversine,
-- puntos 5000*exp(-km/2000)); no toca votos ni retos existentes.
--
-- NO aplicar a producción desde aquí: lo coordina el orquestador con el usuario.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. votes.left_app — marca de "salió de la app durante la jugada"
-- ════════════════════════════════════════════════════════════════════════════
alter table public.votes add column if not exists left_app boolean not null default false;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. RPC submit_vote — misma lógica de scoring + nuevo parámetro p_left_app
-- ════════════════════════════════════════════════════════════════════════════
-- Recrea la función de la 0010 SIN cambiar el cálculo de distancia/puntos ni el
-- `returns table`. Añade `p_left_app boolean default false` al final de la firma
-- y guarda ese valor en la columna `left_app` del voto (insert + upsert). El
-- default permite que un cliente que aún no pase el parámetro siga funcionando.
--
-- IMPORTANTE: añadir un parámetro crea una FUNCIÓN NUEVA (4 args), no reemplaza la
-- de la 0010 (3 args). Hay que BORRAR la antigua o PostgREST no puede resolver la
-- sobrecarga (PGRST203: "Could not choose the best candidate function").
drop function if exists public.submit_vote(uuid, double precision, double precision);

create or replace function public.submit_vote(
  p_challenge_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_left_app boolean default false
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
  -- reto (no del cliente): no se puede atribuir el voto a otro grupo. `left_app` se
  -- persiste tal cual lo manda el cliente (default false si no lo pasa).
  insert into public.votes (group_id, challenge_id, user_id, guess_lat, guess_lng, distance_km, points, left_app)
  values (v_group, p_challenge_id, v_uid, p_lat, p_lng, v_km, v_pts, coalesce(p_left_app, false))
  on conflict (challenge_id, user_id) do update
    set guess_lat   = excluded.guess_lat,
        guess_lng   = excluded.guess_lng,
        distance_km = excluded.distance_km,
        points      = excluded.points,
        left_app    = excluded.left_app;

  -- Revelado: distancia + puntos + la respuesta (null en timeout: no se revela pin).
  return query select
    v_km,
    v_pts,
    case when p_lat is null then null else v_alat end,
    case when p_lat is null then null else v_alng end;
end;
$$;

-- Solo los usuarios autenticados pueden ejecutar la RPC (no el rol anónimo).
-- Firma NUEVA (con p_left_app): hay que re-otorgar el execute sobre ella.
revoke all on function public.submit_vote(uuid, double precision, double precision, boolean) from public;
grant execute on function public.submit_vote(uuid, double precision, double precision, boolean) to authenticated;
