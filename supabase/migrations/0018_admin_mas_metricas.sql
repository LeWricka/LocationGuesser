-- ════════════════════════════════════════════════════════════════════════════
-- 0018 — ampliar las RPCs de admin con más métricas (issue #220)
-- ════════════════════════════════════════════════════════════════════════════
-- Amplía admin_groups(), admin_group_challenges(text) y admin_analytics() con
-- columnas nuevas (engagement, dispersión de distancias, tiempos, salir-de-app,
-- timeouts, autoría, tipo y estado del reto). Mantiene TODA la lógica previa:
-- comprobación is_admin() como primera línea, security definer + search_path, y
-- la exclusión de las cuentas de prueba (iker@540deg.com / icka69@gmail.com).
--
-- POR QUÉ DROP + CREATE (no create or replace): las tres funciones cambian su
-- `returns table` (añaden columnas). Postgres no permite cambiar el tipo de
-- retorno con `create or replace`; hay que DROP de la firma exacta y CREATE de
-- nuevo. Por eso re-aplicamos también revoke/grant al final de cada una.
--
-- POR QUÉ TANTOS ::double precision: avg(), percentile_cont() y las divisiones
-- sobre columnas integer/numeric (points, elapsed_seconds, distance_km) devuelven
-- numeric. Si la columna del returns table es double precision, sin cast explícito
-- Postgres aborta con 42804 ("structure of query does not match result type").
-- Los conteos se castean a ::integer por la misma razón (count() devuelve bigint).
--
-- POR QUÉ MEDIANAS (percentile_cont 0.5) en vez de solo medias: la distribución de
-- distancias y tiempos tiene cola larga (un voto malísimo dispara la media). La
-- mediana resume mejor el comportamiento típico. Se calcula solo sobre filas con
-- el dato presente (elapsed/guess no nulos) para no sesgar con histórico vacío.
--
-- NO aplicar a producción desde aquí: lo coordina el orquestador con el usuario.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. admin_groups() — resumen por grupo (real, no de prueba) + métricas nuevas
-- ════════════════════════════════════════════════════════════════════════════
drop function if exists public.admin_groups();

create function public.admin_groups()
returns table (
  group_id                   text,
  name                       text,
  owner_email                text,
  created_at                 timestamptz,
  member_count               integer,
  challenge_count            integer,
  vote_count                 integer,
  participant_count          integer,
  active_member_pct          double precision,
  lurker_count               integer,
  coverage_pct               double precision,
  avg_distance_km            double precision,
  top_player                 text,
  last_activity_at           timestamptz,
  is_active                  boolean,
  avg_days_between_challenges double precision,
  left_app_count             integer,
  left_app_pct               double precision,
  timeout_count              integer,
  median_response_seconds    double precision,
  median_time_consumed_pct   double precision
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
  with base as (
    select
      g.id                                                  as group_id,
      g.name                                                as name,
      u.email::text                                         as owner_email,
      g.created_at                                          as created_at,
      -- Subconsultas escalares: evitan multiplicar filas al combinar miembros,
      -- retos y votos del mismo grupo (cada métrica cuenta sobre su tabla).
      (select count(*) from public.group_members m where m.group_id = g.id)::integer  as member_count,
      (select count(*) from public.challenges c where c.group_id = g.id)::integer     as challenge_count,
      (select count(*) from public.votes v where v.group_id = g.id)::integer          as vote_count,
      (select count(distinct v.user_id) from public.votes v where v.group_id = g.id)::integer as participant_count
    from public.groups g
    left join auth.users u on u.id = g.created_by
    -- Excluir grupos de cuentas de prueba (por email del dueño).
    where coalesce(u.email, '') not in ('iker@540deg.com', 'icka69@gmail.com')
  )
  select
    b.group_id,
    b.name,
    b.owner_email,
    b.created_at,
    b.member_count,
    b.challenge_count,
    b.vote_count,
    b.participant_count,
    -- % de miembros que han participado (votado) al menos una vez. Null si el
    -- grupo no tiene miembros (no se divide por cero).
    case when b.member_count > 0
      then b.participant_count::double precision / b.member_count * 100
      else null end                                                     as active_member_pct,
    -- "Lurkers": miembros del grupo que NO han votado nunca en él. Restamos los
    -- participantes a los miembros (clamp a 0 por si hubiera votos de ex-miembros).
    greatest(0, b.member_count - b.participant_count)::integer           as lurker_count,
    -- Cobertura: votos emitidos / votos posibles (miembros × retos), en %. Mide
    -- cuánto del potencial de juego se ha cubierto. Null si no hay miembros o retos.
    case when b.member_count > 0 and b.challenge_count > 0
      then b.vote_count::double precision / (b.member_count * b.challenge_count) * 100
      else null end                                                     as coverage_pct,
    -- Media de distancia de los votos del grupo (avg numeric → double precision).
    (select avg(v.distance_km)::double precision
       from public.votes v where v.group_id = b.group_id)               as avg_distance_km,
    -- Jugador con más puntos TOTALES en el grupo. Desempata por display_name asc
    -- para que el resultado sea determinista (limit 1 sobre el orden total).
    (select p.display_name
       from public.votes v
       join public.profiles p on p.id = v.user_id
      where v.group_id = b.group_id
      group by p.id, p.display_name
      order by sum(v.points) desc, p.display_name asc
      limit 1)                                                          as top_player,
    -- Última actividad del grupo: el más reciente entre el último reto creado y el
    -- último voto emitido. Null si no hay ni retos ni votos.
    greatest(
      (select max(c.created_at) from public.challenges c where c.group_id = b.group_id),
      (select max(v.created_at) from public.votes v where v.group_id = b.group_id)
    )                                                                   as last_activity_at,
    -- Activo = ha habido actividad en los últimos 14 días.
    (greatest(
      (select max(c.created_at) from public.challenges c where c.group_id = b.group_id),
      (select max(v.created_at) from public.votes v where v.group_id = b.group_id)
    ) >= now() - interval '14 days')                                    as is_active,
    -- Cadencia PROPIA del grupo: media de los huecos (en días) entre retos
    -- consecutivos. Null si el grupo tiene menos de 2 retos (no hay hueco).
    (select avg(gap)::double precision
       from (
         select extract(epoch from (
                  c.created_at - lag(c.created_at) over (order by c.created_at)
                )) / 86400.0 as gap
         from public.challenges c
         where c.group_id = b.group_id
       ) gaps
      where gap is not null)                                            as avg_days_between_challenges,
    -- Votos en los que el jugador salió de la app (left_app = true).
    (select count(*) from public.votes v
      where v.group_id = b.group_id and v.left_app is true)::integer    as left_app_count,
    -- % de esos votos sobre el total del grupo. Null si el grupo no tiene votos.
    case when b.vote_count > 0
      then (select count(*) from public.votes v
              where v.group_id = b.group_id and v.left_app is true)::double precision
           / b.vote_count * 100
      else null end                                                     as left_app_pct,
    -- Timeouts: jugó pero no marcó pin (guess_lat null → voto de timeout, 0007).
    (select count(*) from public.votes v
      where v.group_id = b.group_id and v.guess_lat is null)::integer   as timeout_count,
    -- Mediana de tiempo de respuesta (segundos) sobre votos con elapsed no nulo.
    -- percentile_cont devuelve double precision aquí, pero casteamos por claridad.
    (select percentile_cont(0.5) within group (order by v.elapsed_seconds)::double precision
       from public.votes v
      where v.group_id = b.group_id and v.elapsed_seconds is not null)  as median_response_seconds,
    -- Mediana del % de cuenta atrás consumido (elapsed / guess_seconds), sobre
    -- votos con ambos datos y guess_seconds > 0 (sin límite o sin dato → fuera).
    (select percentile_cont(0.5) within group (
              order by v.elapsed_seconds::double precision / c.guess_seconds * 100)
       from public.votes v
       join public.challenges c on c.id = v.challenge_id
      where v.group_id = b.group_id
        and v.elapsed_seconds is not null
        and c.guess_seconds is not null
        and c.guess_seconds > 0)                                        as median_time_consumed_pct
  from base b
  order by b.created_at desc;
end;
$$;

revoke all on function public.admin_groups() from public;
grant execute on function public.admin_groups() to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. admin_group_challenges(p_group_id) — resumen por reto de un grupo + métricas
-- ════════════════════════════════════════════════════════════════════════════
drop function if exists public.admin_group_challenges(text);

create function public.admin_group_challenges(p_group_id text)
returns table (
  challenge_id             uuid,
  title                    text,
  created_at               timestamptz,
  deadline_at              timestamptz,
  guess_seconds            integer,
  has_image                boolean,
  lat                      double precision,
  lng                      double precision,
  vote_count               integer,
  participation_pct        double precision,
  avg_distance_km          double precision,
  avg_points               double precision,
  avg_elapsed_seconds      double precision,
  avg_time_consumed_pct    double precision,
  non_voter_count          integer,
  timeout_count            integer,
  min_distance_km          double precision,
  median_distance_km       double precision,
  max_distance_km          double precision,
  max_points               integer,
  best_player              text,
  worst_player             text,
  median_elapsed_seconds   double precision,
  median_time_consumed_pct double precision,
  kind                     text,
  author                   text,
  status                   text,
  left_app_count           integer
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

  -- Miembros del grupo: base para participación y para los que NO votaron.
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
    -- avg() sobre integer/numeric devuelve numeric → cast explícito a double precision.
    (select avg(v.distance_km)::double precision from public.votes v where v.challenge_id = c.id) as avg_distance_km,
    (select avg(v.points)::double precision from public.votes v where v.challenge_id = c.id)      as avg_points,
    (select avg(v.elapsed_seconds)::double precision from public.votes v where v.challenge_id = c.id) as avg_elapsed_seconds,
    (select avg(v.elapsed_seconds::double precision / c.guess_seconds * 100)
       from public.votes v
      where v.challenge_id = c.id
        and v.elapsed_seconds is not null
        and c.guess_seconds is not null
        and c.guess_seconds > 0)                   as avg_time_consumed_pct,
    -- Miembros que NO votaron este reto. clamp a 0 por si hubiera votos de gente
    -- que ya no es miembro (votantes distintos > miembros actuales).
    greatest(0, v_members
      - (select count(distinct v.user_id) from public.votes v where v.challenge_id = c.id))::integer as non_voter_count,
    -- Timeouts: votos sin pin (guess_lat null).
    (select count(*) from public.votes v
      where v.challenge_id = c.id and v.guess_lat is null)::integer    as timeout_count,
    -- Dispersión de distancias (solo votos con pin: guess no nulo).
    (select min(v.distance_km)::double precision from public.votes v
      where v.challenge_id = c.id and v.guess_lat is not null)         as min_distance_km,
    (select percentile_cont(0.5) within group (order by v.distance_km)::double precision
       from public.votes v
      where v.challenge_id = c.id and v.guess_lat is not null)         as median_distance_km,
    (select max(v.distance_km)::double precision from public.votes v
      where v.challenge_id = c.id and v.guess_lat is not null)         as max_distance_km,
    -- Máximo de puntos del reto (mejor acierto en puntos).
    (select max(v.points) from public.votes v where v.challenge_id = c.id)::integer as max_points,
    -- Mejor jugador: el del voto con MENOR distancia (más cerca). Desempata por
    -- nombre asc para ser determinista. Solo votos con pin.
    (select p.display_name
       from public.votes v
       join public.profiles p on p.id = v.user_id
      where v.challenge_id = c.id and v.guess_lat is not null
      order by v.distance_km asc, p.display_name asc
      limit 1)                                                         as best_player,
    -- Peor jugador: el del voto con MAYOR distancia (más lejos). Solo votos con pin.
    (select p.display_name
       from public.votes v
       join public.profiles p on p.id = v.user_id
      where v.challenge_id = c.id and v.guess_lat is not null
      order by v.distance_km desc, p.display_name asc
      limit 1)                                                         as worst_player,
    -- Mediana del tiempo de respuesta (segundos) sobre votos con elapsed no nulo.
    (select percentile_cont(0.5) within group (order by v.elapsed_seconds)::double precision
       from public.votes v
      where v.challenge_id = c.id and v.elapsed_seconds is not null)   as median_elapsed_seconds,
    -- Mediana del % de cuenta atrás consumido (elapsed / guess_seconds).
    (select percentile_cont(0.5) within group (
              order by v.elapsed_seconds::double precision / c.guess_seconds * 100)
       from public.votes v
      where v.challenge_id = c.id
        and v.elapsed_seconds is not null
        and c.guess_seconds is not null
        and c.guess_seconds > 0)                   as median_time_consumed_pct,
    -- Tipo de contenido del reto según qué medios tiene (foto y/o Street View).
    case
      when c.image_path is not null and c.sv_pano_id is not null then 'foto_sv'
      when c.image_path is not null then 'foto'
      when c.sv_pano_id is not null then 'sv'
      else 'ninguno'
    end                                            as kind,
    -- Autor del reto (display_name de created_by). Null si el perfil no existe.
    (select p.display_name from public.profiles p where p.id = c.created_by) as author,
    -- Estado del reto. Convención: deadline muy lejana (>1 año) = reto de práctica
    -- "siempre abierto"; deadline pasada = cerrado; en medio = abierto en curso.
    case
      when c.deadline_at > now() + interval '365 days' then 'practica'
      when c.deadline_at <= now() then 'cerrado'
      else 'abierto'
    end                                            as status,
    -- Votos del reto en los que el jugador salió de la app.
    (select count(*) from public.votes v
      where v.challenge_id = c.id and v.left_app is true)::integer     as left_app_count
  from public.challenges c
  where c.group_id = p_group_id
  order by c.created_at desc;
end;
$$;

revoke all on function public.admin_group_challenges(text) from public;
grant execute on function public.admin_group_challenges(text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. admin_analytics() — agregados globales (solo grupos reales) + métricas nuevas
-- ════════════════════════════════════════════════════════════════════════════
drop function if exists public.admin_analytics();

create function public.admin_analytics()
returns table (
  groups_count                integer,
  challenges_count            integer,
  participants_count          integer,
  votes_count                 integer,
  avg_challenges_per_group    double precision,
  avg_days_between_challenges double precision,
  avg_votes_per_challenge     double precision,
  avg_participation_pct       double precision,
  avg_response_seconds        double precision,
  avg_time_consumed_pct       double precision,
  avg_left_app_pct            double precision,
  timeout_pct                 double precision,
  median_response_seconds     double precision
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
  cadence as (
    select extract(epoch from (
             c.created_at - lag(c.created_at) over (partition by c.group_id order by c.created_at)
           )) / 86400.0 as days_gap
    from real_challenges c
  ),
  -- Participación por reto: votantes distintos / miembros del grupo (en %).
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
    case when (select count(*) from real_groups) > 0
      then (select count(*) from real_challenges)::double precision
           / (select count(*) from real_groups)
      else null end                                                      as avg_challenges_per_group,
    -- avg(days_gap) es numeric → cast a double precision.
    (select avg(days_gap)::double precision from cadence where days_gap is not null) as avg_days_between_challenges,
    case when (select count(*) from real_challenges) > 0
      then (select count(*) from real_votes)::double precision
           / (select count(*) from real_challenges)
      else null end                                                      as avg_votes_per_challenge,
    (select avg(pct) from per_challenge_part where pct is not null)      as avg_participation_pct,
    -- avg(elapsed_seconds) (integer) es numeric → cast a double precision.
    (select avg(v.elapsed_seconds)::double precision from real_votes v)  as avg_response_seconds,
    (select avg(v.elapsed_seconds::double precision / c.guess_seconds * 100)
       from real_votes v
       join public.challenges c on c.id = v.challenge_id
      where v.elapsed_seconds is not null
        and c.guess_seconds is not null
        and c.guess_seconds > 0)                                         as avg_time_consumed_pct,
    -- % global de votos en los que el jugador salió de la app (sobre total de votos
    -- reales). Null si no hay votos. count(*) filtrado → numeric, casteamos.
    case when (select count(*) from real_votes) > 0
      then (select count(*) from real_votes v where v.left_app is true)::double precision
           / (select count(*) from real_votes) * 100
      else null end                                                      as avg_left_app_pct,
    -- % global de timeouts: votos sin pin (guess_lat null) sobre total de votos.
    case when (select count(*) from real_votes) > 0
      then (select count(*) from real_votes v where v.guess_lat is null)::double precision
           / (select count(*) from real_votes) * 100
      else null end                                                      as timeout_pct,
    -- Mediana global del tiempo de respuesta (segundos) sobre votos con elapsed no
    -- nulo. La mediana resiste mejor la cola larga que avg_response_seconds.
    (select percentile_cont(0.5) within group (order by v.elapsed_seconds)::double precision
       from real_votes v where v.elapsed_seconds is not null)            as median_response_seconds;
end;
$$;

revoke all on function public.admin_analytics() from public;
grant execute on function public.admin_analytics() to authenticated;
