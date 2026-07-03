-- ════════════════════════════════════════════════════════════════════════════
-- 0034 — LA VELOCIDAD PUNTÚA: responder rápido premia, tarde penaliza
-- ════════════════════════════════════════════════════════════════════════════
-- Issue #628. Petición de los dos usuarios principales del reto de LUGAR
-- ("¿Dónde es?"): con límite de tiempo por jugada, responder rápido debe sumar
-- y responder tarde debe restar. Los retos de NÚMERO ("¿Cuánto?") NO cambian
-- (`submit_number_vote` no se toca).
--
-- DISEÑO (autoridad de servidor, igual que 0010/0028/0029 — no fiarse del reloj
-- del cliente):
--   1) `challenges.time_scoring` (default true = ON): el creador puede apagar la
--      bonificación/penalización por reto. Solo tiene efecto con límite por
--      jugada (`guess_seconds` no null); en "Libre" no hay nada que medir.
--   2) Al pulsar Empezar, el cliente llama a la nueva RPC `start_play`, que dice
--      al servidor "este jugador arrancó AHORA" — el cliente ya no puede
--      inventarse un arranque más temprano para fingir una respuesta instantánea.
--   3) `submit_vote` calcula `elapsed = now() − arranque` (ACOTADO a [0, límite])
--      y un factor `0.5 + 0.5·(1 − elapsed/límite)` (instantáneo ≈100%, al límite
--      = 50%) que multiplica los puntos base de distancia. El timeout SIGUE
--      dando 0 (el factor no cambia nada ahí). Sin arranque registrado (legacy,
--      o si `start_play` falló — degradación honesta) el factor es 1: cero
--      regresión en retos/jugadas de antes de esta migración.
--
-- ────────────────────────────────────────────────────────────────────────────
-- POR QUÉ EL ARRANQUE NO VIVE COMO UNA FILA "A MEDIAS" EN `votes`:
-- Si `start_play` insertara directamente en `votes` (guess_lat/lng null, points
-- 0) para guardar el arranque, esa fila sería INDISTINGUIBLE de un voto de
-- TIMEOUT ya comprometido (mismo guess null, mismos puntos 0) para el resto de
-- la app: el marcador (`getVotes`), las vistas de admin y — el bug real — el
-- propio `PlayChallenge`, que trata "existe un voto con guess null" como "ya
-- jugaste y no diste a tiempo". Un jugador que pulsa Empezar y cierra la pestaña
-- ANTES de responder (con margen de sobra en el reloj) volvería a encontrarse
-- con "No diste a tiempo" en vez de poder retomar su jugada — una regresión del
-- flujo de "reanudar" que ya existe y está muy cuidado (ver comentarios de
-- `PlayChallenge.tsx`).
--
-- Por eso el arranque vive en una tabla EFÍMERA propia (`play_starts`), que solo
-- tocan `start_play` (escribe) y `submit_vote` (lee y limpia). Nadie más la
-- consulta, así que no hay riesgo de contaminar marcador/admin con jugadas a
-- medias. `votes.play_started_at` (la columna que pide el issue) SÍ se rellena,
-- pero solo en el mismo INSERT/UPDATE que ya confirma el voto (real o timeout):
-- queda como constancia histórica del arranque, nunca como una fila fantasma.
--
-- RLS / ANTI-TRAMPA ("no re-armable"): `play_starts` tiene RLS activada SIN
-- ninguna policy — ningún cliente lee ni escribe ahí por REST bajo ningún
-- concepto; el ÚNICO camino es la RPC `start_play` (SECURITY DEFINER), que hace
-- `insert ... on conflict do nothing`: la primera llamada fija el arranque,
-- cualquier llamada posterior para el mismo (reto, jugador) es una operación
-- vacía. Un jugador no puede reiniciar su propio cronómetro.
--
-- NO aplicar a producción a mano: lo aplica el orquestador.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. challenges.time_scoring — ¿la velocidad puntúa en ESTE reto? (default ON)
-- ════════════════════════════════════════════════════════════════════════════
-- DEFAULT true → todos los retos existentes (y los nuevos que no elijan) llevan
-- la bonificación activada, tal como pide el issue ("activada por defecto"). Sin
-- límite por jugada (`guess_seconds` null) no tiene efecto (ver `submit_vote`).
alter table public.challenges
  add column if not exists time_scoring boolean not null default true;

comment on column public.challenges.time_scoring is
  'La velocidad puntúa en este reto de LUGAR (issue #628): responder rápido suma, '
  'tarde resta, sobre los puntos de distancia. Default true (ON). Solo tiene efecto '
  'con límite por jugada (guess_seconds no null); en "Libre" no aplica. No es '
  'spoiler: se sirve al jugar para que el cliente sepa qué mecánica montar.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. votes.play_started_at — constancia del arranque en el voto ya confirmado
-- ════════════════════════════════════════════════════════════════════════════
-- Se rellena SOLO al confirmar el voto (real o timeout) en `submit_vote`, con el
-- valor leído de `play_starts` en ese instante. Null si no hubo arranque
-- registrado (legacy, reto sin límite, o `start_play` falló). Ver nota de diseño
-- arriba: nunca se escribe aquí ANTES de que el voto esté completo.
alter table public.votes
  add column if not exists play_started_at timestamptz;

comment on column public.votes.play_started_at is
  'Instante en que el servidor registró el arranque de esta jugada (RPC '
  'start_play), copiado aquí al confirmar el voto. Null = sin arranque registrado '
  '(legacy, reto sin límite, o start_play falló — degradación honesta, factor 1). '
  'Migración 0034 (issue #628).';

-- ════════════════════════════════════════════════════════════════════════════
-- 3. play_starts — arranque EFÍMERO del cronómetro, solo servidor
-- ════════════════════════════════════════════════════════════════════════════
-- Una fila por (reto, jugador) mientras la jugada está en curso; `submit_vote` la
-- borra al confirmar el voto (ya quedó constancia en votes.play_started_at). RLS
-- activada SIN policies: ningún rol de cliente (authenticated/anon) puede leer ni
-- escribir aquí por REST — el único acceso es server-side, dentro de las RPC
-- SECURITY DEFINER `start_play` (escribe) y `submit_vote` (lee + borra).
create table if not exists public.play_starts (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

alter table public.play_starts enable row level security;

comment on table public.play_starts is
  'Arranque efímero del cronómetro de una jugada (issue #628): lo escribe '
  'start_play al pulsar Empezar y lo consume/borra submit_vote al confirmar el '
  'voto. RLS sin policies (server-only, vía RPC SECURITY DEFINER). No confundir '
  'con votes.play_started_at, que es la constancia PERMANENTE tras confirmar.';

-- ════════════════════════════════════════════════════════════════════════════
-- 4. RPC start_play — registra el arranque, NO re-armable (anti-trampa)
-- ════════════════════════════════════════════════════════════════════════════
-- Contrato: start_play(p_challenge_id) -> void. Lo llama el cliente al pulsar
-- Empezar, justo antes de la cuenta atrás 3·2·1 (best-effort, con un reintento
-- corto en el cliente; si falla, el juego sigue igual — sin arranque registrado,
-- submit_vote aplicará factor 1, degradación honesta).
--
-- Mismas validaciones anti-trampa que submit_vote (reto existe, es un RETO,
-- eres miembro, el grupo no está cerrado, el reto sigue abierto). El upsert usa
-- `on conflict do nothing`: la PRIMERA llamada fija el arranque; una llamada
-- posterior (recarga, doble tap, reintento) es una operación vacía — el jugador
-- no puede reiniciar su propio cronómetro para fingir una respuesta instantánea.
create or replace function public.start_play(p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_group  text;
  v_is_ch  boolean;
  v_open   boolean;
  v_closed timestamptz;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  select c.group_id, c.is_challenge, (c.deadline_at > now()), g.closed_at
    into v_group, v_is_ch, v_open, v_closed
  from public.challenges c
  join public.groups g on g.id = c.group_id
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

  -- NO re-armable: si ya había un arranque para este (reto, jugador), se queda
  -- tal cual (ON CONFLICT DO NOTHING).
  insert into public.play_starts (challenge_id, user_id, started_at)
  values (p_challenge_id, v_uid, now())
  on conflict (challenge_id, user_id) do nothing;
end;
$$;

revoke all on function public.start_play(uuid) from public;
grant execute on function public.start_play(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. submit_vote — aplica el factor de velocidad sobre los puntos de distancia
-- ════════════════════════════════════════════════════════════════════════════
-- Copia de la versión vigente (0028, is_challenge + score_scale) que AÑADE:
--   · lee `c.time_scoring`, `c.guess_seconds` (el límite por jugada YA existía)
--     y `ps.started_at` (LEFT JOIN a `play_starts`, puede no haber fila);
--   · con reto acertado (no timeout) + time_scoring + límite + arranque
--     registrado: `elapsed` = now()−arranque, ACOTADO a [0, límite]; factor =
--     0.5 + 0.5·(1 − elapsed/límite). Se aplica sobre los puntos BASE (antes de
--     redondear) y se redondea UNA sola vez al final — evita doble redondeo.
--   · sin alguna de esas condiciones → factor 1 (comportamiento histórico, cero
--     regresión: incluye 'Libre', time_scoring=false, legacy y start_play caído).
--   · el voto confirmado copia el arranque a `votes.play_started_at` (constancia
--     permanente) y `play_starts` se limpia (ya no hace falta).
--   · el RETURN gana `speed_factor` (el factor realmente aplicado, 1 si no
--     aplicó) para que el cliente pinte la nota del revelado con la verdad del
--     servidor, no con una estimación del reloj local.
-- El RETURN TABLE cambia (columna nueva) → hace falta DROP + CREATE (un simple
-- CREATE OR REPLACE no permite cambiar el tipo de retorno).
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
  speed_factor double precision
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_group     text;
  v_open      boolean;
  v_closed    timestamptz;
  v_is_ch     boolean;
  v_scale     text;
  v_time_sc   boolean;
  v_limit     integer;
  v_alat      double precision;
  v_alng      double precision;
  v_started   timestamptz;
  v_km        double precision;
  v_pts_raw   double precision;
  v_pts       integer;
  v_factor    double precision := 1;
  v_elapsed   double precision;
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
    -- 0007). El factor de velocidad no aplica aquí (0 puntos siguen siendo 0).
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
    -- arranque registrado por start_play. Sin alguna de las tres → factor 1
    -- (cero regresión: legacy, 'Libre', toggle apagado o start_play caído).
    -- `elapsed` ACOTADO a [0, límite]: ni un reloj adelantado da más del máximo
    -- (100%), ni tardar más que el límite penaliza más allá del mínimo (50%).
    if coalesce(v_time_sc, true) and v_limit is not null and v_started is not null then
      v_elapsed := greatest(0, least(v_limit::double precision, extract(epoch from (now() - v_started))));
      v_factor  := 0.5 + 0.5 * (1 - v_elapsed / v_limit);
    end if;

    -- Puntos finales: factor sobre los puntos base, redondeo entero UNA vez.
    v_pts := greatest(0, round(v_pts_raw * v_factor))::integer;
  end if;

  -- UPSERT idempotente: revotar no duplica ni cambia un voto ya emitido a otra
  -- cosa. El group_id se toma del reto (no del cliente). `play_started_at` deja
  -- constancia PERMANENTE del arranque (null si no hubo).
  insert into public.votes (
    group_id, challenge_id, user_id, guess_lat, guess_lng,
    distance_km, points, left_app, elapsed_seconds, play_started_at
  )
  values (
    v_group, p_challenge_id, v_uid, p_lat, p_lng,
    v_km, v_pts, coalesce(p_left_app, false), p_elapsed_seconds, v_started
  )
  on conflict (challenge_id, user_id) do update
    set guess_lat       = excluded.guess_lat,
        guess_lng       = excluded.guess_lng,
        distance_km     = excluded.distance_km,
        points          = excluded.points,
        left_app        = excluded.left_app,
        elapsed_seconds = excluded.elapsed_seconds,
        play_started_at = excluded.play_started_at;

  -- Limpieza del arranque efímero: ya quedó constancia en votes.play_started_at.
  delete from public.play_starts where challenge_id = p_challenge_id and user_id = v_uid;

  -- Revelado: distancia + puntos + la respuesta (null en timeout) + el factor de
  -- velocidad REALMENTE aplicado (1 si no aplicó), para que el cliente pinte la
  -- nota del revelado con la verdad del servidor.
  return query select
    v_km,
    v_pts,
    case when p_lat is null then null else v_alat end,
    case when p_lat is null then null else v_alng end,
    v_factor;
end;
$$;

revoke all on function public.submit_vote(uuid, double precision, double precision, boolean, integer) from public;
grant execute on function public.submit_vote(uuid, double precision, double precision, boolean, integer) to authenticated;
