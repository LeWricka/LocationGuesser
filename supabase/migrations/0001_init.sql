-- 0001_init — esquema inicial de LocationGuesser v0.2
-- Diseño completo: docs/estrategia/prueba-de-un-dia.md

-- Grupos ("el viaje"). El id es el código corto que viaja en el enlace (#g=).
create table if not exists public.groups (
  id text primary key,
  created_at timestamptz not null default now()
);

-- Jugadores: identidad por (grupo, nombre). client_id + pin son candado blando.
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references public.groups (id) on delete cascade,
  name text not null,
  client_id text not null,
  pin_hash text not null,
  created_at timestamptz not null default now(),
  unique (group_id, name)
);

-- Retos.
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references public.groups (id) on delete cascade,
  title text not null,
  lat double precision not null,
  lng double precision not null,
  image_path text,
  guess_seconds int,                 -- null = sin límite de tiempo por jugada
  deadline_at timestamptz not null,  -- plazo del reto (absoluto)
  created_by text not null,          -- nombre del jugador creador
  created_at timestamptz not null default now()
);
create index if not exists challenges_group_idx on public.challenges (group_id, created_at desc);

-- Votos: un voto por (reto, nombre).
create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references public.groups (id) on delete cascade,
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  player_name text not null,
  guess_lat double precision not null,
  guess_lng double precision not null,
  distance_km double precision not null,
  points int not null,
  created_at timestamptz not null default now(),
  unique (challenge_id, player_name)
);
create index if not exists votes_challenge_idx on public.votes (challenge_id);
create index if not exists votes_group_idx on public.votes (group_id);

-- RLS: candado blando (lectura/escritura pública). Sin Auth real en v0.2.
alter table public.groups enable row level security;
alter table public.players enable row level security;
alter table public.challenges enable row level security;
alter table public.votes enable row level security;

do $$
begin
  create policy "groups_read" on public.groups for select using (true);
  create policy "groups_write" on public.groups for insert with check (true);

  create policy "players_read" on public.players for select using (true);
  create policy "players_write" on public.players for insert with check (true);
  create policy "players_update" on public.players for update using (true) with check (true);

  create policy "challenges_read" on public.challenges for select using (true);
  create policy "challenges_write" on public.challenges for insert with check (true);

  create policy "votes_read" on public.votes for select using (true);
  create policy "votes_write" on public.votes for insert with check (true);
exception when duplicate_object then null;
end $$;

-- Storage: bucket público para las imágenes de los retos.
insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do nothing;

do $$
begin
  create policy "images_read" on storage.objects for select using (bucket_id = 'images');
  create policy "images_write" on storage.objects for insert with check (bucket_id = 'images');
exception when duplicate_object then null;
end $$;

-- Realtime: emitir cambios de votos y retos para el histórico/marcador en vivo.
do $$
begin
  alter publication supabase_realtime add table public.votes;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.challenges;
exception when duplicate_object then null;
end $$;
