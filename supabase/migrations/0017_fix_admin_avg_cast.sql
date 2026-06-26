-- ════════════════════════════════════════════════════════════════════════════
-- 0017 — fix: castear avg() a double precision en las RPCs de admin (42804)
-- ════════════════════════════════════════════════════════════════════════════
-- admin_analytics() y admin_group_challenges() fallaban con 400 / PostgREST
-- error=42804 ("structure of query does not match function result type"): varias
-- columnas se declaran `double precision` pero `avg()` sobre columnas `integer`
-- (points, elapsed_seconds) y sobre `days_gap` (numeric) devuelve `numeric`, que
-- no coincide. Solución: castear esos avg a `::double precision`. El `returns
-- table` NO cambia, así que `create or replace` basta (sin drop → sin PGRST203).
-- admin_groups() no se toca (solo conteos, ya casteados a integer).

-- ── admin_group_challenges(text) — retos de un grupo con métricas ─────────────
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

  select count(*) into v_members from public.group_members m where m.group_id = p_group_id;

  return query
  select
    c.id                                          as challenge_id,
    c.title                                        as title,
    c.created_at                                   as created_at,
    c.deadline_at                                  as deadline_at,
    c.guess_seconds                                as guess_seconds,
    (c.image_path is not null)                     as has_image,
    c.lat                                          as lat,
    c.lng                                          as lng,
    (select count(*) from public.votes v where v.challenge_id = c.id)::integer as vote_count,
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
        and c.guess_seconds > 0)                   as avg_time_consumed_pct
  from public.challenges c
  where c.group_id = p_group_id
  order by c.created_at desc;
end;
$$;

revoke all on function public.admin_group_challenges(text) from public;
grant execute on function public.admin_group_challenges(text) to authenticated;

-- ── admin_analytics() — agregados globales ────────────────────────────────────
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

  select coalesce(array_agg(u.id), '{}')
    into v_test_ids
  from auth.users u
  where u.email in ('iker@540deg.com', 'icka69@gmail.com');

  return query
  with
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
  cadence as (
    select extract(epoch from (
             c.created_at - lag(c.created_at) over (partition by c.group_id order by c.created_at)
           )) / 86400.0 as days_gap
    from real_challenges c
  ),
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
        and c.guess_seconds > 0)                                         as avg_time_consumed_pct;
end;
$$;

revoke all on function public.admin_analytics() from public;
grant execute on function public.admin_analytics() to authenticated;
