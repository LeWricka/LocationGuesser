-- ════════════════════════════════════════════════════════════════════════════
-- 0028 — PRECISIÓN DEL RETO: calibrar cómo de estricto es el conteo de distancia
-- ════════════════════════════════════════════════════════════════════════════
-- Motivo: no es lo mismo "estoy en algún lugar del mundo" que "estoy en Madrid".
-- Si el reto está acotado (una ciudad, un barrio) hay que ser MÁS estricto al
-- puntuar. Hoy la puntuación es `5000 · e^(−km / D)` con D = 2000 km FIJO para
-- todos los retos. D es la "distancia característica": a menor D, la puntuación
-- cae más rápido con los km (más estricto).
--
-- Añadimos `challenges.score_scale` (mundo|pais|ciudad|barrio) que elige D:
--   · mundo  → D = 2000 km  (indulgente: acertar el continente/país lejano)
--   · pais   → D =  300 km  (acertar el país / la región)
--   · ciudad → D =   25 km  (acertar la ciudad)
--   · barrio → D =    2 km  (muy estricto: casi la calle)
--
-- DATA-PRESERVING y BACKWARD-COMPATIBLE: la columna nace con DEFAULT 'mundo', así
-- que TODOS los retos existentes (y los nuevos que no elijan) quedan en 'mundo' =
-- D = 2000 = el comportamiento EXACTO de hoy. `submit_vote` se recrea SIN cambiar
-- nada más (anti-trampa, validaciones, firma de 5 args, returns table): el único
-- cambio es leer `score_scale` del reto y derivar D de él en vez de la constante
-- 2000 fija. Para 'mundo' y para null (defensivo) D = 2000 → mismo número de
-- puntos al km que antes (cero regresión en los datos ya guardados y en el cálculo).

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Columna score_scale — la precisión del reto (default = comportamiento actual)
-- ────────────────────────────────────────────────────────────────────────────
alter table public.challenges
  add column if not exists score_scale text not null default 'mundo'
    check (score_scale in ('mundo', 'pais', 'ciudad', 'barrio'));

comment on column public.challenges.score_scale is
  'Precisión del reto: calibra la distancia característica D de la puntuación '
  '5000·e^(−km/D). mundo=2000km (default, comportamiento histórico), pais=300km, '
  'ciudad=25km, barrio=2km. A menor D, más estricto (la puntuación cae más rápido).';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. submit_vote — usar el D del reto (score_scale) en vez de 2000 fijo
-- ────────────────────────────────────────────────────────────────────────────
-- Copia EXACTA de la versión vigente (0022, 5 args con p_left_app +
-- p_elapsed_seconds). MISMA firma y MISMO `returns table`: usamos create or
-- replace sin DROP => NO se crea una sobrecarga nueva (evita PGRST203). El ÚNICO
-- cambio frente a 0022 es: (a) leer `c.score_scale` en el SELECT del reto, y (b)
-- derivar `c_decay` (la D de la fórmula) de esa escala con un CASE en vez de la
-- constante fija de 2000. Para 'mundo' (y null, defensivo) D = 2000 → puntuación
-- IDÉNTICA a la de hoy. Toda la lógica anti-trampa, de membresía, de grupo
-- cerrado, de plazo, el haversine y el upsert idempotente quedan intactos.
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
  v_uid    uuid := auth.uid();
  v_group  text;
  v_open   boolean;
  v_closed timestamptz;
  v_is_ch  boolean;
  v_scale  text;
  v_alat   double precision;
  v_alng   double precision;
  v_km     double precision;
  v_pts    integer;
  -- Constantes que REPLICAN geo.ts (no cambiar sin cambiar el cliente en paralelo).
  c_earth constant double precision := 6371;            -- radio terrestre en km
  c_base  constant double precision := 5000;            -- puntos máximos
  -- Distancia característica D (escala de caída en km): se DERIVA de score_scale
  -- más abajo (antes era la constante fija 2000; ahora 'mundo' = 2000 = igual).
  c_decay double precision;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  -- Reto + estado abierto + respuesta + estado del grupo (closed_at) + flag de
  -- reto + precisión (score_scale), de una vez. Falla si el reto no existe.
  select c.group_id, (c.deadline_at > now()), a.lat, a.lng, g.closed_at,
         c.is_challenge, c.score_scale
    into v_group, v_open, v_alat, v_alng, v_closed, v_is_ch, v_scale
  from public.challenges c
  join public.challenge_answers a on a.challenge_id = c.id
  join public.groups g on g.id = c.group_id
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

  -- D según la precisión del reto. 'mundo' y null (defensivo, retos previos sin
  -- valor) = 2000 → puntuación IDÉNTICA a la histórica. A menor D, más estricto.
  c_decay := case coalesce(v_scale, 'mundo')
               when 'mundo'  then 2000
               when 'pais'   then 300
               when 'ciudad' then 25
               when 'barrio' then 2
               else 2000
             end;

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
    -- Puntos (idéntico a geo.scoreFor): max(0, round(5000*exp(-km/D))). D = c_decay.
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

-- Firma sin cambios (5 args): re-otorgamos el execute por consistencia con 0022.
revoke all on function public.submit_vote(uuid, double precision, double precision, boolean, integer) from public;
grant execute on function public.submit_vote(uuid, double precision, double precision, boolean, integer) to authenticated;
