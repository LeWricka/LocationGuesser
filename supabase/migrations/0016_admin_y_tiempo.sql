-- ════════════════════════════════════════════════════════════════════════════
-- 0016 — cimientos de la vista de admin + tiempo de respuesta del jugador
-- ════════════════════════════════════════════════════════════════════════════
-- Issue #212. Sienta la base de datos para una pantalla de administración (solo
-- para el dueño del producto) que cruza la frontera de la RLS estricta. NINGÚN
-- acceso de admin confía en el cliente: todo va por funciones SECURITY DEFINER
-- que comprueban `is_admin()` (allowlist por email del JWT) como PRIMERA línea.
--
-- Además añade `votes.elapsed_seconds` (cuánto tardó el jugador en votar) para
-- poder medir tiempos de respuesta y consumo de la cuenta atrás en la analítica.
--
-- DATA-PRESERVING: solo añade una columna nullable y recrea `submit_vote` con un
-- parámetro nuevo (con DROP de la firma vieja para no dejar una sobrecarga que
-- rompa PostgREST con PGRST203). No toca votos ni retos existentes.
--
-- CUENTAS DE PRUEBA: los listados/analíticas de admin EXCLUYEN los grupos cuyo
-- dueño (groups.created_by) sea una cuenta de prueba (iker@540deg.com /
-- icka69@gmail.com), resolviendo esos emails a user_id leyendo auth.users.
--
-- NO aplicar a producción desde aquí: lo coordina el orquestador con el usuario.
-- IMPORTANTE: esta migración BORRA la sobrecarga vieja de submit_vote (4 args).

-- ════════════════════════════════════════════════════════════════════════════
-- 1. is_admin() — allowlist de administradores por email del JWT
-- ════════════════════════════════════════════════════════════════════════════
-- El admin se identifica por el email de su sesión (claim `email` del JWT), no por
-- ningún flag en BD que el cliente pueda tocar. La allowlist es un array para
-- ampliarla fácil (añadir más emails separados por coma). STABLE: depende del JWT
-- de la petición, no muta datos. SECURITY DEFINER por consistencia con el resto de
-- RPCs de admin (la lectura del JWT no lo exige, pero mantiene el patrón).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'email', '') = any (array[
    'iker@540deg.com'
  ])
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. votes.elapsed_seconds — segundos que tardó el jugador en votar
-- ════════════════════════════════════════════════════════════════════════════
-- Nullable: el histórico previo a esta migración no lo tiene, y un cliente que aún
-- no lo mande dejará la columna null. Se interpreta como "tiempo de respuesta del
-- jugador desde que empieza la jugada hasta que vota".
alter table public.votes add column if not exists elapsed_seconds integer;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. submit_vote v3 — misma lógica de scoring + nuevo parámetro p_elapsed_seconds
-- ════════════════════════════════════════════════════════════════════════════
-- Copia EXACTA de la lógica de la 0015 (haversine + puntos 5000*exp(-km/2000) +
-- upsert idempotente). Solo añade `p_elapsed_seconds` al final de la firma y lo
-- guarda en la columna nueva. El `returns table` no cambia.
--
-- CUIDADO SOBRECARGA (PGRST203): añadir un parámetro crea una función NUEVA (5
-- args), no reemplaza la de la 0015 (4 args). Hay que BORRAR la firma de 4 args o
-- PostgREST no puede resolver la sobrecarga.
drop function if exists public.submit_vote(uuid, double precision, double precision, boolean);

create or replace function public.submit_vote(
  p_challenge_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_left_app boolean default false,
  p_elapsed_seconds integer default null
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
  -- reto (no del cliente): no se puede atribuir el voto a otro grupo. `left_app` y
  -- `elapsed_seconds` se persisten tal cual los manda el cliente (defaults si no).
  insert into public.votes (
    group_id, challenge_id, user_id, guess_lat, guess_lng,
    distance_km, points, left_app, elapsed_seconds
  )
  values (
    v_group, p_challenge_id, v_uid, p_lat, p_lng,
    v_km, v_pts, coalesce(p_left_app, false), p_elapsed_seconds
  )
  on conflict (challenge_id, user_id) do update
    set guess_lat       = excluded.guess_lat,
        guess_lng       = excluded.guess_lng,
        distance_km     = excluded.distance_km,
        points          = excluded.points,
        left_app        = excluded.left_app,
        elapsed_seconds = excluded.elapsed_seconds;

  -- Revelado: distancia + puntos + la respuesta (null en timeout: no se revela pin).
  return query select
    v_km,
    v_pts,
    case when p_lat is null then null else v_alat end,
    case when p_lat is null then null else v_alng end;
end;
$$;

-- Solo los usuarios autenticados pueden ejecutar la RPC (no el rol anónimo).
-- Firma NUEVA (5 args, con p_elapsed_seconds): hay que re-otorgar el execute.
revoke all on function public.submit_vote(uuid, double precision, double precision, boolean, integer) from public;
grant execute on function public.submit_vote(uuid, double precision, double precision, boolean, integer) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. RPCs de admin (SECURITY DEFINER, primera línea: comprobar is_admin())
-- ════════════════════════════════════════════════════════════════════════════
-- Todas cruzan la RLS (security definer) pero la abren SOLO al admin: si no lo es,
-- abortan con 42501. Excluyen los grupos de las cuentas de prueba resolviendo sus
-- emails a user_id desde auth.users (legible desde SECURITY DEFINER).

-- ── admin_groups() — un resumen por grupo (real, no de prueba) ────────────────
create or replace function public.admin_groups()
returns table (
  group_id          text,
  name              text,
  owner_email       text,
  created_at        timestamptz,
  member_count      integer,
  challenge_count   integer,
  vote_count        integer,
  participant_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return query
  select
    g.id                                                  as group_id,
    g.name                                                as name,
    u.email::text                                         as owner_email,
    g.created_at                                          as created_at,
    -- Subconsultas escalares: evitan multiplicar filas al combinar miembros, retos
    -- y votos en un mismo grupo (cada métrica cuenta sobre su propia tabla).
    (select count(*) from public.group_members m where m.group_id = g.id)::integer  as member_count,
    (select count(*) from public.challenges c where c.group_id = g.id)::integer     as challenge_count,
    (select count(*) from public.votes v where v.group_id = g.id)::integer          as vote_count,
    (select count(distinct v.user_id) from public.votes v where v.group_id = g.id)::integer as participant_count
  from public.groups g
  left join auth.users u on u.id = g.created_by
  -- Excluir grupos de cuentas de prueba (por email del dueño).
  where coalesce(u.email, '') not in ('iker@540deg.com', 'icka69@gmail.com')
  order by g.created_at desc;
end;
$$;

revoke all on function public.admin_groups() from public;
grant execute on function public.admin_groups() to authenticated;

-- ── admin_group_challenges(p_group_id) — un resumen por reto de un grupo ───────
create or replace function public.admin_group_challenges(p_group_id text)
returns table (
  challenge_id          uuid,
  title                 text,
  created_at            timestamptz,
  deadline_at           timestamptz,
  guess_seconds         integer,
  has_image             boolean,
  lat                   double precision,
  lng                   double precision,
  vote_count            integer,
  participation_pct     double precision,
  avg_distance_km       double precision,
  avg_points            double precision,
  avg_elapsed_seconds   double precision,
  avg_time_consumed_pct double precision
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_members integer;
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  -- Miembros del grupo: base para el % de participación por reto. Si es 0, dejamos
  -- la participación en null (no se puede dividir por cero / no tiene sentido).
  select count(*) into v_members from public.group_members m where m.group_id = p_group_id;

  return query
  select
    c.id                                          as challenge_id,
    c.title                                        as title,
    c.created_at                                   as created_at,
    c.deadline_at                                  as deadline_at,
    c.guess_seconds                                as guess_seconds,
    (c.image_path is not null)                     as has_image,
    c.lat                                          as lat,  -- la respuesta; el admin puede verla
    c.lng                                          as lng,
    (select count(*) from public.votes v where v.challenge_id = c.id)::integer as vote_count,
    -- % de votantes sobre miembros del grupo (null si el grupo no tiene miembros).
    case when v_members > 0
      then (select count(distinct v.user_id) from public.votes v where v.challenge_id = c.id)::double precision
           / v_members * 100
      else null end                                as participation_pct,
    (select avg(v.distance_km) from public.votes v where v.challenge_id = c.id) as avg_distance_km,
    (select avg(v.points) from public.votes v where v.challenge_id = c.id)      as avg_points,
    (select avg(v.elapsed_seconds) from public.votes v where v.challenge_id = c.id) as avg_elapsed_seconds,
    -- Media del % de cuenta atrás consumido: solo sobre votos con elapsed y reto
    -- con guess_seconds > 0 (sin límite o sin dato → no entra en la media).
    (select avg(v.elapsed_seconds::double precision / c.guess_seconds * 100)
       from public.votes v
      where v.challenge_id = c.id
        and v.elapsed_seconds is not null
        and c.guess_seconds is not null
        and c.guess_seconds > 0)                   as avg_time_consumed_pct
  from public.challenges c
  where c.group_id = p_group_id
  order by c.created_at desc;
end;
$$;

revoke all on function public.admin_group_challenges(text) from public;
grant execute on function public.admin_group_challenges(text) to authenticated;

-- ── admin_analytics() — agregados globales (solo grupos reales) ────────────────
-- Devuelve UNA fila. Donde no hay datos (p.ej. elapsed nulo en el histórico) los
-- promedios salen null por naturaleza de avg(); los conteos salen 0. Las medias de
-- "por grupo" / "por reto" se calculan sobre los grupos no-test.
create or replace function public.admin_analytics()
returns table (
  groups_count             integer,
  challenges_count         integer,
  participants_count       integer,
  votes_count              integer,
  avg_challenges_per_group double precision,
  avg_days_between_challenges double precision,
  avg_votes_per_challenge  double precision,
  avg_participation_pct    double precision,
  avg_response_seconds     double precision,
  avg_time_consumed_pct    double precision
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_test_ids uuid[];
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  -- user_id de las cuentas de prueba (para excluir sus grupos en todo el cálculo).
  select coalesce(array_agg(u.id), '{}')
    into v_test_ids
  from auth.users u
  where u.email in ('iker@540deg.com', 'icka69@gmail.com');

  return query
  with
  -- Grupos reales (no de cuentas de prueba). created_by null = no excluido.
  real_groups as (
    select g.id, g.created_at
    from public.groups g
    where g.created_by is null or g.created_by <> all (v_test_ids)
  ),
  real_challenges as (
    select c.*
    from public.challenges c
    join real_groups rg on rg.id = c.group_id
  ),
  real_votes as (
    select v.*
    from public.votes v
    join real_groups rg on rg.id = v.group_id
  ),
  -- Cadencia: días entre retos consecutivos dentro de cada grupo (lag por grupo).
  -- Solo grupos con ≥2 retos aportan diferencias; la media es sobre esas diferencias.
  cadence as (
    select extract(epoch from (
             c.created_at - lag(c.created_at) over (partition by c.group_id order by c.created_at)
           )) / 86400.0 as days_gap
    from real_challenges c
  ),
  -- Participación por reto: votantes distintos / miembros del grupo (en %). Solo
  -- entran retos cuyo grupo tiene ≥1 miembro (si no, no se puede calcular).
  per_challenge_part as (
    select
      (select count(distinct v.user_id) from public.votes v where v.challenge_id = c.id)::double precision
        / nullif((select count(*) from public.group_members m where m.group_id = c.group_id), 0) * 100
        as pct
    from real_challenges c
  )
  select
    (select count(*) from real_groups)::integer                          as groups_count,
    (select count(*) from real_challenges)::integer                      as challenges_count,
    (select count(distinct v.user_id) from real_votes v)::integer        as participants_count,
    (select count(*) from real_votes)::integer                           as votes_count,
    -- Retos por grupo: total de retos / total de grupos (null si no hay grupos).
    case when (select count(*) from real_groups) > 0
      then (select count(*) from real_challenges)::double precision
           / (select count(*) from real_groups)
      else null end                                                      as avg_challenges_per_group,
    (select avg(days_gap) from cadence where days_gap is not null)       as avg_days_between_challenges,
    -- Votos por reto: total de votos / total de retos (null si no hay retos).
    case when (select count(*) from real_challenges) > 0
      then (select count(*) from real_votes)::double precision
           / (select count(*) from real_challenges)
      else null end                                                      as avg_votes_per_challenge,
    (select avg(pct) from per_challenge_part where pct is not null)      as avg_participation_pct,
    (select avg(v.elapsed_seconds) from real_votes v)                    as avg_response_seconds,
    -- Media global del % de cuenta atrás consumido (solo votos con elapsed y reto
    -- con guess_seconds > 0).
    (select avg(v.elapsed_seconds::double precision / c.guess_seconds * 100)
       from real_votes v
       join public.challenges c on c.id = v.challenge_id
      where v.elapsed_seconds is not null
        and c.guess_seconds is not null
        and c.guess_seconds > 0)                                         as avg_time_consumed_pct;
end;
$$;

revoke all on function public.admin_analytics() from public;
grant execute on function public.admin_analytics() to authenticated;
