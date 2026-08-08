-- 0052 — SCORING AUTO-CALIBRADO POR VIAJE (issue #994, estilo GeoGuessr)
--
-- Problemas reales que resuelve (grupo real jugando, ago-2026):
--   1. El selector de precisión (mundo/país/ciudad/barrio) confundía a los
--      creadores (y cuando la app forzaba 'ciudad' hubo un reto con casi todos
--      a 0). Fuera el selector: la exigencia se deriva SOLA del tamaño del
--      viaje, como GeoGuessr deriva la suya del mapa que juegas
--      (S = 5000·e^(−10·d/D_mapa); fuente: latb.io/geoguessr/articles/the-maths).
--   2. El factor de velocidad multiplicativo (×0.5–×1.0) dominaba demasiado:
--      ser lento partía la nota por la mitad e invertía rankings ("estoy más
--      cerca pero gano menos"). En el GeoGuessr clásico el tiempo NO puntúa;
--      aquí se queda como BONUS ADITIVO pequeño (hasta +250, 5% del máximo):
--      desempata entre adivinanzas parecidas, jamás voltea una diferencia real
--      de distancia.
--
-- CÓMO SE AUTO-CALIBRA (validado por experto con simulaciones):
--   puntos_ubicados = del grupo del reto: momentos con place_lat/lng + las
--     RESPUESTAS (challenge_answers) de sus retos de ubicación — incluida la
--     del reto que se está puntuando. SECURITY DEFINER puede leerlas.
--   centroide: lat = media aritmética; lng = atan2(media(sin), media(cos))
--     (seguro cruzando el antimeridiano, p.ej. Filipinas↔Pacífico).
--   diagonal_efectivo = 2 × percentil-85 de las distancias al centroide.
--     NO un bounding box min/max: UN momento outlier (la foto del vuelo a
--     800 km) infla un bbox ×29 y trivializa el reto; el percentil lo ignora
--     (inflación ×1,02 medida).
--   decay_km = clamp(diagonal_efectivo / 6, 25, 2000)   [<2 puntos → 300]
--     · /6 y no el /10 literal de GeoGuessr: su D es un mapa curado (generoso);
--       el nuestro es data-driven de fotos reales (más compacto) — con /10 todo
--       fallo >550 km caía al suelo sin discriminar (simulado con datos reales).
--     · mínimo 25 = la vieja 'ciudad' (viajes urbanos siguen siendo jugables);
--       máximo 2000 = la vieja 'mundo' (continuidad con lo validado en prod);
--       respaldo 300 = la vieja 'país' (primer reto de un viaje sin puntos:
--       el caso núcleo del producto es un viaje por un país).
--
--   puntos = max(250, round(5000·e^(−km/decay))) + bonus_tiempo
--   bonus_tiempo = round(250 · tiempo_restante/límite)  [mismas condiciones que
--     el factor viejo: time_scoring ON + límite + arranque registrado]
--   Timeout (sin pin) sigue a 0 (ni suelo ni bonus). Máximo teórico: 5250.
--
-- CONTRATO: misma firma de argumentos; el RETURN gana `speed_bonus integer` y
-- `speed_factor` se mantiene devolviendo 1.0 fijo (compatibilidad con bundles
-- viejos durante la ventana de deploy: leían ese campo para la nota del
-- revelado; 1.0 = "sin nota", que es lo correcto porque ya no multiplica).
-- Cambia el TIPO de retorno → hace falta DROP + CREATE (no create or replace).
--
-- `challenges.score_scale` queda como columna LEGACY (no se escribe más).
-- `submit_number_vote` NO se toca (los retos de número no puntúan por tiempo
-- ni por distancia geográfica).
--
-- ESPEJO EXACTO en el cliente: `computeTripDecay`/`scoreFor`/`speedBonusFor`
-- en web/src/lib/geo.ts — cambiar una constante implica cambiar la otra. Los
-- mismos 9 casos numéricos del experto validan ambos lados.
--
-- NO aplicar a producción a mano: lo aplica el orquestador ANTES del deploy
-- del front (el front nuevo lee `speed_bonus`).

-- 1. votes.decay_km — constancia del decay usado al puntuar (transparencia/depuración).
alter table public.votes
  add column if not exists decay_km numeric;

comment on column public.votes.decay_km is
  'Constante de caída (km) usada al puntuar este voto: auto-calibrada por el '
  'tamaño del viaje (issue #994). NULL en votos anteriores a la 0052 y timeouts.';

-- 2. submit_vote v7 — auto-calibración + bonus aditivo de tiempo.
drop function if exists public.submit_vote(uuid, double precision, double precision, boolean, integer);

create function public.submit_vote(
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
  answer_lng double precision,
  speed_factor double precision,
  scored_seconds numeric,
  speed_bonus integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid            uuid := auth.uid();
  v_group          text;
  v_open           boolean;
  v_closed         timestamptz;
  v_is_ch          boolean;
  v_time_sc        boolean;
  v_limit          integer;
  v_alat           double precision;
  v_alng           double precision;
  v_started        timestamptz;
  v_km             double precision;
  v_pts            integer;
  v_elapsed        numeric;
  v_scored_seconds numeric;
  v_bonus          integer := 0;
  -- Auto-calibración (issue #994).
  v_n              integer;
  v_diag           double precision;
  v_decay          double precision;
  -- Constantes que REPLICAN geo.ts (no cambiar sin cambiar el cliente en paralelo).
  c_earth constant double precision := 6371;
  c_base  constant double precision := 5000;
  c_min_guess_points constant integer := 250;
  c_speed_bonus_max  constant integer := 250;
  c_decay_min      constant double precision := 25;
  c_decay_max      constant double precision := 2000;
  c_decay_divisor  constant double precision := 6;
  c_decay_fallback constant double precision := 300;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  select c.group_id, (c.deadline_at > now()), a.lat, a.lng, g.closed_at,
         c.is_challenge, c.time_scoring, c.guess_seconds,
         ps.started_at
    into v_group, v_open, v_alat, v_alng, v_closed,
         v_is_ch, v_time_sc, v_limit,
         v_started
  from public.challenges c
  join public.challenge_answers a on a.challenge_id = c.id
  join public.groups g on g.id = c.group_id
  left join public.play_starts ps
    on ps.challenge_id = c.id and ps.user_id = v_uid
  where c.id = p_challenge_id;

  if not found then
    raise exception 'Reto no encontrado' using errcode = 'P0002';
  end if;

  if not coalesce(v_is_ch, true) then
    raise exception 'Este contenido no es un reto' using errcode = 'P0001';
  end if;

  if not public.is_group_member(v_group) then
    raise exception 'No eres miembro del grupo de este reto' using errcode = '42501';
  end if;

  if v_closed is not null then
    raise exception 'El grupo está cerrado' using errcode = 'P0001';
  end if;

  if not v_open then
    raise exception 'El reto ya está cerrado' using errcode = 'P0001';
  end if;

  -- Decay auto-calibrado por el viaje (ver cabecera). Se calcula SIEMPRE (aun
  -- en timeout no hace falta, pero simplifica y el coste es mínimo: un grupo
  -- tiene decenas de puntos como mucho).
  with pts as (
    select c.place_lat as lat, c.place_lng as lng
    from public.challenges c
    where c.group_id = v_group
      and c.place_lat is not null and c.place_lng is not null
    union all
    select a.lat, a.lng
    from public.challenge_answers a
    join public.challenges c2 on c2.id = a.challenge_id
    where c2.group_id = v_group
      and coalesce(c2.challenge_kind, 'location') = 'location'
      and a.lat is not null and a.lng is not null
  ),
  cen as (
    select count(*)::integer as n,
           avg(lat) as clat,
           degrees(atan2(avg(sin(radians(lng))), avg(cos(radians(lng))))) as clng
    from pts
  ),
  rad as (
    select 2 * c_earth * asin(least(1, sqrt(
             power(sin(radians(p.lat - cen.clat) / 2), 2)
             + cos(radians(cen.clat)) * cos(radians(p.lat))
               * power(sin(radians(p.lng - cen.clng) / 2), 2)
           ))) as r
    from pts p, cen
  )
  select cen.n,
         2 * (select (array_agg(r order by r))[floor(0.85 * (cen.n - 1))::integer + 1] from rad)
    into v_n, v_diag
  from cen;

  v_decay := case
               when coalesce(v_n, 0) < 2 then c_decay_fallback
               else greatest(c_decay_min, least(c_decay_max, v_diag / c_decay_divisor))
             end;

  if p_lat is null or p_lng is null then
    -- Voto de TIMEOUT: 0 puntos, sin pin, sin suelo ni bonus (como siempre).
    v_km  := null;
    v_pts := 0;
  else
    v_km := 2 * c_earth * asin(least(1, sqrt(
      power(sin(radians(v_alat - p_lat) / 2), 2)
      + cos(radians(p_lat)) * cos(radians(v_alat))
        * power(sin(radians(v_alng - p_lng) / 2), 2)
    )));

    -- BONUS de tiempo (aditivo, issue #994): mismas condiciones de aplicación
    -- que el factor viejo (time_scoring ON + límite + arranque registrado);
    -- `scored_seconds` conserva su semántica (el tiempo EXACTO que puntuó, a
    -- 1 decimal, issue #946).
    if coalesce(v_time_sc, true) and v_limit is not null and v_started is not null then
      v_elapsed        := round(greatest(0, least(v_limit::numeric, extract(epoch from (now() - v_started))::numeric)), 1);
      v_scored_seconds := v_elapsed;
      v_bonus          := round(c_speed_bonus_max * (v_limit - v_elapsed) / v_limit)::integer;
    end if;

    -- Distancia con suelo + bonus aditivo. Mismo orden que el espejo cliente:
    -- max(250, round(5000·e^(−km/decay))) + bonus.
    v_pts := greatest(c_min_guess_points, round(c_base * exp(-v_km / v_decay)))::integer + v_bonus;
  end if;

  insert into public.votes (
    group_id, challenge_id, user_id, guess_lat, guess_lng,
    distance_km, points, left_app, elapsed_seconds, play_started_at, scored_seconds, decay_km
  )
  values (
    v_group, p_challenge_id, v_uid, p_lat, p_lng,
    v_km, v_pts, coalesce(p_left_app, false), p_elapsed_seconds, v_started, v_scored_seconds,
    case when p_lat is null then null else round(v_decay::numeric, 1) end
  )
  on conflict (challenge_id, user_id) do update
    set guess_lat       = excluded.guess_lat,
        guess_lng       = excluded.guess_lng,
        distance_km     = excluded.distance_km,
        points          = excluded.points,
        left_app        = excluded.left_app,
        elapsed_seconds = excluded.elapsed_seconds,
        play_started_at = excluded.play_started_at,
        scored_seconds  = excluded.scored_seconds,
        decay_km        = excluded.decay_km;

  delete from public.play_starts where challenge_id = p_challenge_id and user_id = v_uid;

  -- `speed_factor` = 1.0 fijo: compat con bundles viejos durante el deploy (ya
  -- no hay factor multiplicativo). El cliente nuevo usa `speed_bonus`.
  return query select
    v_km,
    v_pts,
    case when p_lat is null then null else v_alat end,
    case when p_lat is null then null else v_alng end,
    1.0::double precision,
    v_scored_seconds,
    v_bonus;
end;
$$;

revoke all on function public.submit_vote(uuid, double precision, double precision, boolean, integer) from public;
grant execute on function public.submit_vote(uuid, double precision, double precision, boolean, integer) to authenticated;
