-- ════════════════════════════════════════════════════════════════════════════
-- 0047 — EL TIEMPO QUE SE VE ES EL TIEMPO QUE PUNTÚA (fin del empate falso)
-- ════════════════════════════════════════════════════════════════════════════
-- Issue #946. El tiempo que se PINTA en el marcador (`elapsed_seconds`, medido
-- en cliente, entero) no es el que PUNTÚA (servidor: `now() − play_started_at`,
-- continuo, migración 0034). Además redondear a segundos enteros hace que dos
-- personas con 33,2 s y 33,7 s salgan ambas como "33 s" con distinta nota →
-- parece un bug. Decisión: el número que se muestra = el que se usa para
-- calcular, y con 1 decimal.
--
-- CAMBIO (copia de `submit_vote` de 0034 que solo toca la rama de velocidad):
--   1) `votes.scored_seconds` — el tiempo EXACTO (acotado a [0, límite],
--      redondeado a 1 decimal) que el servidor usó para el factor de
--      velocidad. NULL cuando el factor no aplicó (Libre, time_scoring OFF,
--      sin arranque registrado, legacy) o en voto de timeout.
--   2) El redondeo a 1 decimal pasa a ocurrir ANTES de calcular el factor
--      (`v_elapsed` ahora es `numeric`, no `double precision`, para no perder
--      el decimal limpio en un ida-y-vuelta de coma flotante) — el factor usa
--      ESE valor redondeado, así que el mismo número que se guarda en
--      `scored_seconds` es el que puntuó.
--   3) El RETURN gana `scored_seconds` para pintar la nota del revelado con la
--      verdad del servidor al instante, sin esperar a releer `votes`.
-- NO se toca `submit_number_vote` (los retos de número no puntúan por
-- velocidad), ni la lógica de distancia, ni la firma de argumentos de
-- `submit_vote`. El RETURN TABLE cambia (columna nueva) → hace falta DROP +
-- CREATE (un CREATE OR REPLACE no permite cambiar el tipo de retorno).
--
-- NO aplicar a producción a mano: lo aplica el orquestador.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. votes.scored_seconds — el tiempo EXACTO que usó el factor de velocidad
-- ════════════════════════════════════════════════════════════════════════════
alter table public.votes
  add column if not exists scored_seconds numeric;

comment on column public.votes.scored_seconds is
  'Tiempo de respuesta EXACTO (acotado a [0, guess_seconds], redondeado a 1 '
  'decimal) que el servidor usó para el factor de velocidad (issue #628). Es '
  'el MISMO número que se muestra en el marcador (issue #946): así el tiempo '
  'que se ve es siempre el que puntuó, sin el falso empate del redondeo a '
  'segundos enteros de `elapsed_seconds`. NULL cuando el factor no aplicó '
  '(Libre, time_scoring OFF, sin arranque registrado, legacy) o en voto de '
  'timeout. Migración 0047.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. submit_vote — redondea el elapsed a 1 decimal ANTES del factor y lo guarda
-- ════════════════════════════════════════════════════════════════════════════
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
  scored_seconds numeric
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
  v_scale          text;
  v_time_sc        boolean;
  v_limit          integer;
  v_alat           double precision;
  v_alng           double precision;
  v_started        timestamptz;
  v_km             double precision;
  v_pts_raw        double precision;
  v_pts            integer;
  v_factor         double precision := 1;
  -- `numeric` (no `double precision`, issue #946): el redondeo a 1 decimal se
  -- hace en `numeric` y se queda ahí hasta guardarlo en `scored_seconds` — un
  -- ida-y-vuelta por `double precision` puede devolver algo como
  -- 33.4000000000000057 en vez de un 33,4 limpio.
  v_elapsed        numeric;
  -- El mismo valor que `v_elapsed` cuando el factor de velocidad SÍ aplicó;
  -- NULL en cualquier otro caso (Libre, time_scoring OFF, sin arranque, legacy,
  -- o voto de timeout). Es lo que se guarda en `votes.scored_seconds` y se
  -- devuelve al cliente para el revelado.
  v_scored_seconds numeric;
  -- Constantes que REPLICAN geo.ts (no cambiar sin cambiar el cliente en paralelo).
  c_earth constant double precision := 6371;            -- radio terrestre en km
  c_base  constant double precision := 5000;            -- puntos máximos
  c_decay double precision;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  -- Reto + estado abierto + respuesta + estado del grupo + flag de reto +
  -- precisión + velocidad (time_scoring, límite) + arranque registrado (si lo
  -- hay), de una vez. Falla si el reto no existe.
  select c.group_id, (c.deadline_at > now()), a.lat, a.lng, g.closed_at,
         c.is_challenge, c.score_scale, c.time_scoring, c.guess_seconds,
         ps.started_at
    into v_group, v_open, v_alat, v_alng, v_closed,
         v_is_ch, v_scale, v_time_sc, v_limit,
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

  -- La fila debe ser un RETO: un recuerdo (is_challenge=false) no se vota.
  if not coalesce(v_is_ch, true) then
    raise exception 'Este contenido no es un reto' using errcode = 'P0001';
  end if;

  -- Membresía: solo un miembro del grupo del reto puede votar.
  if not public.is_group_member(v_group) then
    raise exception 'No eres miembro del grupo de este reto' using errcode = '42501';
  end if;

  -- Grupo cerrado (fin de temporada): solo-lectura, no se admiten votos nuevos.
  if v_closed is not null then
    raise exception 'El grupo está cerrado' using errcode = 'P0001';
  end if;

  -- El reto debe seguir abierto para votar (con pin o por timeout).
  if not v_open then
    raise exception 'El reto ya está cerrado' using errcode = 'P0001';
  end if;

  -- D según la precisión del reto. 'mundo' y null (defensivo) = 2000 → puntuación
  -- IDÉNTICA a la histórica. A menor D, más estricto.
  c_decay := case coalesce(v_scale, 'mundo')
               when 'mundo'  then 2000
               when 'pais'   then 300
               when 'ciudad' then 25
               when 'barrio' then 2
               else 2000
             end;

  if p_lat is null or p_lng is null then
    -- Voto de TIMEOUT: jugó pero no marcó → 0 puntos, sin pin (compatible con
    -- 0007). El factor de velocidad no aplica aquí (0 puntos siguen siendo 0);
    -- `scored_seconds` se queda NULL (nada que puntuar por tiempo).
    v_km  := null;
    v_pts := 0;
  else
    -- Haversine (idéntica a geo.haversine): dLat/dLng en radianes; clamp en sqrt.
    v_km := 2 * c_earth * asin(least(1, sqrt(
      power(sin(radians(v_alat - p_lat) / 2), 2)
      + cos(radians(p_lat)) * cos(radians(v_alat))
        * power(sin(radians(v_alng - p_lng) / 2), 2)
    )));
    -- Puntos BASE sin redondear (antes se redondeaba aquí; ahora el redondeo se
    -- retrasa al final para no acumular error con el factor de velocidad).
    v_pts_raw := c_base * exp(-v_km / c_decay);

    -- LA VELOCIDAD PUNTÚA (issue #628): solo con time_scoring ON, límite por
    -- jugada (guess_seconds no null; en 'Libre' no hay nada que medir) y un
    -- arranque registrado por start_play. Sin alguna de las tres → factor 1 y
    -- `scored_seconds` NULL (cero regresión: legacy, 'Libre', toggle apagado o
    -- start_play caído).
    -- `v_elapsed` ACOTADO a [0, límite] y redondeado a 1 decimal ANTES del
    -- factor (issue #946): ni un reloj adelantado da más del máximo (100%), ni
    -- tardar más que el límite penaliza más allá del mínimo (50%), y el número
    -- que puntúa es EXACTAMENTE el que se guarda/muestra.
    if coalesce(v_time_sc, true) and v_limit is not null and v_started is not null then
      v_elapsed        := round(greatest(0, least(v_limit::numeric, extract(epoch from (now() - v_started))::numeric)), 1);
      v_scored_seconds := v_elapsed;
      v_factor         := 0.5 + 0.5 * (1 - v_elapsed / v_limit);
    end if;

    -- Puntos finales: factor sobre los puntos base, redondeo entero UNA vez.
    v_pts := greatest(0, round(v_pts_raw * v_factor))::integer;
  end if;

  -- UPSERT idempotente: revotar no duplica ni cambia un voto ya emitido a otra
  -- cosa. El group_id se toma del reto (no del cliente). `play_started_at` deja
  -- constancia PERMANENTE del arranque (null si no hubo); `scored_seconds` deja
  -- constancia PERMANENTE del tiempo que puntuó (null si el factor no aplicó).
  insert into public.votes (
    group_id, challenge_id, user_id, guess_lat, guess_lng,
    distance_km, points, left_app, elapsed_seconds, play_started_at, scored_seconds
  )
  values (
    v_group, p_challenge_id, v_uid, p_lat, p_lng,
    v_km, v_pts, coalesce(p_left_app, false), p_elapsed_seconds, v_started, v_scored_seconds
  )
  on conflict (challenge_id, user_id) do update
    set guess_lat       = excluded.guess_lat,
        guess_lng       = excluded.guess_lng,
        distance_km     = excluded.distance_km,
        points          = excluded.points,
        left_app        = excluded.left_app,
        elapsed_seconds = excluded.elapsed_seconds,
        play_started_at = excluded.play_started_at,
        scored_seconds  = excluded.scored_seconds;

  -- Limpieza del arranque efímero: ya quedó constancia en votes.play_started_at.
  delete from public.play_starts where challenge_id = p_challenge_id and user_id = v_uid;

  -- Revelado: distancia + puntos + la respuesta (null en timeout) + el factor de
  -- velocidad REALMENTE aplicado (1 si no aplicó) + el tiempo EXACTO que puntuó
  -- (null si no aplicó), para que el cliente pinte la nota del revelado con la
  -- verdad del servidor, sin esperar a releer `votes`.
  return query select
    v_km,
    v_pts,
    case when p_lat is null then null else v_alat end,
    case when p_lat is null then null else v_alng end,
    v_factor,
    v_scored_seconds;
end;
$$;

revoke all on function public.submit_vote(uuid, double precision, double precision, boolean, integer) from public;
grant execute on function public.submit_vote(uuid, double precision, double precision, boolean, integer) to authenticated;
