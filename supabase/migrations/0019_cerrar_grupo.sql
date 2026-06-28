-- ════════════════════════════════════════════════════════════════════════════
-- 0019 — cerrar / archivar grupo (fin de temporada) + ganadores
-- ════════════════════════════════════════════════════════════════════════════
-- Issue #236 (Fase 1). El dueño puede CERRAR el grupo ("fin de temporada"):
-- congela la clasificación y deja el grupo en modo solo-lectura, con el podio
-- final y el ganador destacado. También puede REABRIRLO.
--
-- Modelo: una sola columna `groups.closed_at`. null = activo; con fecha =
-- archivado/cerrado (y la fecha sirve para el banner "Temporada cerrada · {fecha}").
--
-- DATA-PRESERVING: añade una columna nullable y recrea `submit_vote` SIN cambiar
-- su firma (5 args, igual que la 0016) para no crear una sobrecarga que rompa
-- PostgREST (PGRST203). Solo añade un check de "grupo cerrado" dentro. No toca
-- votos ni retos existentes.
--
-- Integridad de "solo lectura" en SERVIDOR (no se confía en el cliente):
--   1) votar en un grupo cerrado → falla en submit_vote.
--   2) crear retos en un grupo cerrado → falla por una RLS de challenges (la
--      policy de INSERT exige que el grupo NO esté cerrado).
-- El borrado de retos/grupo y la edición de premios siguen siendo del dueño:
-- archivar no impide gestionar (p.ej. corregir un reto antes de reabrir).
--
-- NO aplicar a producción desde aquí: lo coordina el orquestador con el usuario.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. groups.closed_at — marca de archivado (null = activo)
-- ════════════════════════════════════════════════════════════════════════════
alter table public.groups add column if not exists closed_at timestamptz;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. close_group(p_group_id) — cerrar la temporada (solo el dueño)
-- ════════════════════════════════════════════════════════════════════════════
-- SECURITY DEFINER: cruza la RLS para escribir closed_at, pero como PRIMERA línea
-- comprueba que quien llama es el DUEÑO del grupo (created_by = auth.uid() o un
-- group_members.role = 'owner'). Idempotente: si ya está cerrado, no toca la fecha.
create or replace function public.close_group(p_group_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  -- Dueño = creador del grupo o miembro con rol 'owner'. Si no, 42501 (no autorizado).
  if not exists (
    select 1 from public.groups g
    where g.id = p_group_id and g.created_by = v_uid
  ) and not exists (
    select 1 from public.group_members m
    where m.group_id = p_group_id and m.user_id = v_uid and m.role = 'owner'
  ) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  -- Solo marca si estaba activo (no re-pisa la fecha de un cierre previo).
  update public.groups
     set closed_at = now()
   where id = p_group_id and closed_at is null;
end;
$$;

revoke all on function public.close_group(text) from public;
grant execute on function public.close_group(text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. reopen_group(p_group_id) — reabrir la temporada (solo el dueño)
-- ════════════════════════════════════════════════════════════════════════════
-- Misma comprobación de dueño que close_group; pone closed_at = null (vuelve a
-- activo: se puede crear retos y votar de nuevo).
create or replace function public.reopen_group(p_group_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.groups g
    where g.id = p_group_id and g.created_by = v_uid
  ) and not exists (
    select 1 from public.group_members m
    where m.group_id = p_group_id and m.user_id = v_uid and m.role = 'owner'
  ) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  update public.groups
     set closed_at = null
   where id = p_group_id;
end;
$$;

revoke all on function public.reopen_group(text) from public;
grant execute on function public.reopen_group(text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. submit_vote — bloquear el voto si el grupo del reto está cerrado
-- ════════════════════════════════════════════════════════════════════════════
-- Copia EXACTA de la versión más reciente (0016, 5 args con p_left_app +
-- p_elapsed_seconds). MISMA firma y MISMO `returns table`: usamos create or
-- replace sin DROP, así NO se crea una sobrecarga nueva (evita PGRST203). El único
-- cambio es leer también `closed_at` del grupo y abortar si está cerrado (P0001).
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

  -- Reto + estado abierto + respuesta + estado del grupo (closed_at), de una vez.
  -- Falla si el reto no existe.
  select c.group_id, (c.deadline_at > now()), a.lat, a.lng, g.closed_at
    into v_group, v_open, v_alat, v_alng, v_closed
  from public.challenges c
  join public.challenge_answers a on a.challenge_id = c.id
  join public.groups g on g.id = c.group_id
  where c.id = p_challenge_id;

  if not found then
    raise exception 'Reto no encontrado' using errcode = 'P0002';
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

-- Firma sin cambios (5 args): re-otorgamos el execute por consistencia con 0016.
revoke all on function public.submit_vote(uuid, double precision, double precision, boolean, integer) from public;
grant execute on function public.submit_vote(uuid, double precision, double precision, boolean, integer) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. challenges — impedir crear retos en un grupo cerrado (RLS)
-- ════════════════════════════════════════════════════════════════════════════
-- Recreamos la policy de INSERT (0004) añadiendo la condición de que el grupo NO
-- esté cerrado. Así el solo-lectura del grupo archivado se respalda en servidor,
-- no solo en la UI. Mantiene lo demás: ser miembro y crear el reto como uno mismo.
drop policy if exists "challenges_insert_member" on public.challenges;
create policy "challenges_insert_member" on public.challenges
  for insert to authenticated
  with check (
    public.is_group_member(group_id)
    and created_by = auth.uid()
    and exists (
      select 1 from public.groups g
      where g.id = group_id and g.closed_at is null
    )
  );
