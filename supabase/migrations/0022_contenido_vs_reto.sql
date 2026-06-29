-- ════════════════════════════════════════════════════════════════════════════
-- 0022 — separar CONTENIDO (recuerdo) de RETO (capa opcional)
-- ════════════════════════════════════════════════════════════════════════════
-- Plan de producto: docs flujos-viaje-po (modelo Contenido≠Reto). Hoy la unidad
-- mínima de compartir ES un reto completo: cada fila de `challenges` conflaciona
-- el RECUERDO (foto, lugar, descripción, fecha) con el JUEGO (respuesta oculta
-- lat/lng + deadline + cronómetro). No se puede subir un recuerdo sin montar un
-- juego. Esta migración separa los dos conceptos con el cambio ADITIVO MÁS
-- PEQUEÑO posible: un flag + columnas nullable. SIN tablas nuevas.
--
--   1) `is_challenge boolean NOT NULL DEFAULT true` — la fila pasa a ser un
--      "momento"; el flag dice si lleva capa de juego encima. Default TRUE => los
--      retos existentes siguen siendo retos: CERO regresión.
--   2) `place_lat`/`place_lng` (double precision NULLABLE) — el lugar VISIBLE de
--      un recuerdo. NO son la respuesta oculta del reto (esa sigue en
--      `challenge_answers`, gobernada por la RLS anti-spoiler de 0010). Son
--      columnas NUEVAS justamente para NO tocar `lat/lng` (cuyo privilegio de
--      columna 0010 revocó): así el lugar de un recuerdo se sirve por la RLS
--      normal de fila, sin abrir ningún hueco en el anti-spoiler de los retos.
--   3) `deadline_at` pasa a NULLABLE — un recuerdo sin reto no tiene cuenta atrás.
--      Los retos existentes ya tienen deadline_at no nulo: nada cambia para ellos.
--   4) El trigger de respuesta (0012) se recrea para que SOLO espeje a
--      `challenge_answers` cuando la fila es un reto con respuesta (is_challenge
--      true y lat/lng presentes). Un recuerdo (is_challenge=false) NO crea
--      respuesta. Los retos existentes siguen espejando EXACTAMENTE igual.
--   5) `submit_vote` se recrea con la MISMA firma de 0020 (5 args) añadiendo una
--      guarda: votar una fila que NO es reto falla. Misma firma => no se crea
--      sobrecarga nueva (evita PGRST203).
--
-- DATA-PRESERVING: no borra ni reescribe ninguna columna ni dato. Todas las
-- altas son `if not exists` / `create or replace` (idempotente). Los retos
-- vivos y cerrados conservan su respuesta, su deadline y su comportamiento.
--
-- NO aplicar a producción a mano: lo aplica el pipeline db-migrate al mergear.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. challenges.is_challenge — ¿la fila lleva capa de juego? (default true)
-- ════════════════════════════════════════════════════════════════════════════
-- Default true => al ejecutar el ALTER, todas las filas existentes (que son
-- retos) quedan is_challenge=true. Comportamiento idéntico al de antes.
alter table public.challenges
  add column if not exists is_challenge boolean not null default true;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. challenges.place_lat / place_lng — lugar VISIBLE del recuerdo (nullable)
-- ════════════════════════════════════════════════════════════════════════════
-- NO son la respuesta del reto (esa vive oculta en challenge_answers). Son el
-- punto visible que un recuerdo enseña en el mapa. Columnas nuevas y nullable:
-- los inserts del cliente actual (que no las manda) siguen funcionando, y NO
-- chocan con el revoke de columna de `lat/lng` de 0010.
alter table public.challenges
  add column if not exists place_lat double precision;
alter table public.challenges
  add column if not exists place_lng double precision;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. challenges.deadline_at — NULLABLE (un recuerdo no caduca)
-- ════════════════════════════════════════════════════════════════════════════
-- 0001 la creó NOT NULL. La hacemos nullable para permitir recuerdos sin reto.
-- DROP NOT NULL es idempotente (re-ejecutarlo sobre una columna ya nullable no
-- falla). Los retos existentes conservan su deadline tal cual.
alter table public.challenges
  alter column deadline_at drop not null;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Trigger de respuesta — solo espejar a challenge_answers si es RETO
-- ════════════════════════════════════════════════════════════════════════════
-- Recrea `sync_challenge_answer` (0012) con una guarda: solo escribe la respuesta
-- en `challenge_answers` cuando la fila es un reto CON respuesta (is_challenge
-- true y lat/lng presentes). Un recuerdo (is_challenge=false, o sin lat/lng) NO
-- crea fila en challenge_answers — no hay nada que adivinar.
--
-- Comportamiento para los retos existentes (is_challenge=true, lat/lng no nulos):
-- EXACTAMENTE igual que antes (mismo UPSERT idempotente por challenge_id). El
-- trigger sigue siendo SECURITY DEFINER + search_path=public (cruza la RLS de
-- challenge_answers; el INSERT/UPDATE del reto ya pasó por su propia RLS).
create or replace function public.sync_challenge_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo los retos con respuesta espejan a challenge_answers. Un recuerdo
  -- (is_challenge=false) o un reto aún sin lat/lng no escribe nada.
  if coalesce(new.is_challenge, true) and new.lat is not null and new.lng is not null then
    insert into public.challenge_answers (challenge_id, lat, lng)
    values (new.id, new.lat, new.lng)
    on conflict (challenge_id) do update
      set lat = excluded.lat,
          lng = excluded.lng;
  end if;
  return new;
end;
$$;

-- El trigger se mantiene igual que en 0012: reacciona al INSERT y a cambios de
-- lat/lng. Lo recreamos también disparándolo ante cambios de `is_challenge` para
-- cubrir la promoción recuerdo→reto que setea lat/lng e is_challenge a la vez.
drop trigger if exists trg_sync_challenge_answer on public.challenges;

create trigger trg_sync_challenge_answer
  after insert or update of lat, lng, is_challenge on public.challenges
  for each row
  execute function public.sync_challenge_answer();

-- ════════════════════════════════════════════════════════════════════════════
-- 5. RLS — place_lat/place_lng NO necesitan policy nueva (confirmación)
-- ════════════════════════════════════════════════════════════════════════════
-- La SELECT de `challenges` la define 0004 (`challenges_select_member`,
-- for select using (is_group_member(group_id))): es a nivel de FILA, no de
-- columna. Por tanto las columnas nuevas `place_lat`/`place_lng` quedan
-- automáticamente visibles para los miembros del grupo del recuerdo, sin tocar
-- nada (igual que `description` en 0021). Son visibles a propósito: el lugar de
-- un recuerdo NO es secreto. La RLS anti-spoiler de `challenge_answers` (0010) NO
-- se toca: la respuesta oculta de los retos sigue protegida exactamente igual.
-- El UPDATE de `challenges` (`challenges_update_owner`, 0004) también es por fila,
-- así que el dueño puede escribir place_lat/place_lng en el mismo UPDATE.

-- ════════════════════════════════════════════════════════════════════════════
-- 6. submit_vote — votar exige que la fila sea un RETO (guarda is_challenge)
-- ════════════════════════════════════════════════════════════════════════════
-- Copia EXACTA de la versión más reciente (0020, 5 args con p_left_app +
-- p_elapsed_seconds). MISMA firma y MISMO `returns table`: usamos create or
-- replace sin DROP => NO se crea una sobrecarga nueva (evita PGRST203). El único
-- cambio frente a 0020 es leer también `is_challenge` y abortar si la fila no es
-- un reto: un recuerdo NO se vota (no tiene respuesta ni deadline). El JOIN con
-- challenge_answers ya garantizaba de hecho que solo se vota lo que tiene
-- respuesta, pero la guarda explícita da un error claro y a prueba de futuro.
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
  v_alat   double precision;
  v_alng   double precision;
  v_km     double precision;
  v_pts    integer;
  -- Constantes que REPLICAN geo.ts (no cambiar sin cambiar el cliente en paralelo).
  c_earth constant double precision := 6371;            -- radio terrestre en km
  c_base  constant double precision := 5000;            -- puntos máximos
  c_decay constant double precision := 2000;            -- escala de caída en km
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  -- Reto + estado abierto + respuesta + estado del grupo (closed_at) + flag de
  -- reto, de una vez. Falla si el reto no existe.
  select c.group_id, (c.deadline_at > now()), a.lat, a.lng, g.closed_at, c.is_challenge
    into v_group, v_open, v_alat, v_alng, v_closed, v_is_ch
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

-- Firma sin cambios (5 args): re-otorgamos el execute por consistencia con 0020.
revoke all on function public.submit_vote(uuid, double precision, double precision, boolean, integer) from public;
grant execute on function public.submit_vote(uuid, double precision, double precision, boolean, integer) to authenticated;
