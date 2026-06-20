-- 0004_cuentas_membresia — identidad real: cuentas, membresía, propiedad y RLS solo-auth
-- Diseño (fuente de verdad): docs/estrategia/cuentas-y-home.md §4 (modelo de datos) y §4.4 (RLS).
--
-- Qué hace esta migración:
--   · profiles (1:1 con auth.users), group_members (membresía), groups.created_by (propiedad)
--   · challenges.created_by pasa de text a uuid; votes pasa de player_name a user_id
--   · elimina la identidad ligera: tabla players (drop) — datos actuales = PRUEBA, se descartan
--   · endurece RLS de público → solo-auth (leer/escribir exige sesión; editar/borrar = dueño)
--
-- DECISIÓN DE DATOS (confirmada por producto): groups/challenges/votes/players actuales son de
-- PRUEBA. No hay mapeo name→user_id fiable, así que se TRUNCAN los datos de juego (el piloto real
-- arranca de cero con cuentas). No se inventa migración de datos. Ver cuentas-y-home.md §5.2.
--
-- CRÍTICO — ORDEN DE DESPLIEGUE: esta migración NO debe aplicarse hasta que el cliente mande
-- sesión autenticada (pieza #2 del hito). Aplicarla antes dejaría el front actual (anónimo) sin
-- poder leer/escribir nada (RLS solo-auth). El orquestador la aplica DESPUÉS de la pieza de auth.

-- ════════════════════════════════════════════════════════════════════════════
-- 0. Limpieza de datos de prueba
-- ════════════════════════════════════════════════════════════════════════════
-- Vaciamos el contenido de juego de prueba antes de cambiar tipos de columna: así no hay que
-- castear player_name (text) → user_id (uuid) sobre filas que de todos modos se descartan.
-- El orden respeta las FKs (votes y challenges cuelgan de groups; players también).
truncate table public.votes, public.challenges, public.players, public.groups restart identity cascade;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. profiles — perfil público del usuario (1:1 con auth.users)
-- ════════════════════════════════════════════════════════════════════════════
-- La identidad real es auth.users (UUID + email, gestionado por Supabase Auth). profiles guarda
-- el display_name GLOBAL (no por grupo) + avatar opcional. display_name NO es único: dos "Lewis"
-- pueden coexistir; se desambigua en UI por avatar. Ver cuentas-y-home.md §4.1.
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

-- Trigger de alta automática en el primer registro: crea la fila de profiles en cuanto nace el
-- auth.users, usando como display_name provisional el que venga en raw_user_meta_data.display_name
-- (lo puede mandar el cliente en signInWithOtp/options.data) o, si no, la parte local del email.
-- El paso de perfil del onboarding (§2) actualiza luego este display_name con un UPDATE.
-- Se deja PREPARADO y ACTIVO: el cliente puede confiar en que la fila existe tras el primer login,
-- y aun así puede hacer upsert defensivo. SECURITY DEFINER porque el trigger corre fuera de RLS.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ════════════════════════════════════════════════════════════════════════════
-- 2. group_members — membresía explícita ("mis grupos")
-- ════════════════════════════════════════════════════════════════════════════
-- "Mis grupos" deja de derivarse de enlaces sueltos: es esta tabla. Auto-join = upsert idempotente
-- de (group_id, user_id) al abrir un link #g=CODE con sesión. El dueño se inserta con role='owner'
-- al crear el grupo. role es redundante con groups.created_by, pero deja la puerta a co-dueños/admin
-- sin tocar el esquema. Ver cuentas-y-home.md §4.2.
create table if not exists public.group_members (
  group_id  text not null references public.groups (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      text not null default 'member', -- 'owner' | 'member'
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on public.group_members (user_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. groups.created_by — propiedad (dueño del grupo)
-- ════════════════════════════════════════════════════════════════════════════
-- El dueño puede editar/borrar el grupo y sus retos; los miembros solo juegan. Ver §4.3/§4.4.
alter table public.groups
  add column if not exists created_by uuid references auth.users (id) on delete set null;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. challenges.created_by — el creador pasa de "nombre de jugador" a user_id
-- ════════════════════════════════════════════════════════════════════════════
-- IMPORTANTE: image_path (nullable) SE MANTIENE — vamos a reactivar la foto opcional por reto.
-- El resto del contenido del reto (sv_pano_id, sv_heading, sv_pitch, deadline_at, guess_seconds)
-- no cambia. Solo cambia created_by: text (nombre) → uuid (auth.users). Como ya truncamos los datos
-- de prueba, no hay que castear valores; recreamos la columna con el tipo correcto.
alter table public.challenges drop column if exists created_by;
alter table public.challenges
  add column created_by uuid not null references auth.users (id) on delete cascade;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. votes — el votante pasa de player_name a user_id (1 voto por reto y usuario)
-- ════════════════════════════════════════════════════════════════════════════
-- Sustituimos player_name (text) por user_id (uuid). El unique pasa de (challenge_id, player_name)
-- a (challenge_id, user_id): un usuario vota como mucho 1 vez por reto. Ranking/histórico por persona
-- se derivan ahora de user_id y se muestran con profiles.display_name. Ver §4.3.
alter table public.votes drop constraint if exists votes_challenge_id_player_name_key;
alter table public.votes drop column if exists player_name;
alter table public.votes
  add column user_id uuid not null references auth.users (id) on delete cascade;
alter table public.votes
  add constraint votes_challenge_id_user_id_key unique (challenge_id, user_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 6. players — se elimina (identidad ligera retirada)
-- ════════════════════════════════════════════════════════════════════════════
-- Su rol (atribuir votos/puntos a una persona estable) lo asume ahora auth.users + profiles.
drop table if exists public.players cascade;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. RLS: de público → solo-auth (con membresía y propiedad)
-- ════════════════════════════════════════════════════════════════════════════
-- Objetivo (cuentas-y-home.md §4.4): leer/escribir EXIGE sesión; editar/borrar grupos y retos solo
-- el dueño (created_by = auth.uid()); votos = el propio usuario, 1 por reto. profiles legible por
-- autenticados, escribible solo por el propio.
--
-- Cerramos además el agujero de "cualquiera con la publishable key ve la respuesta (lat/lng)":
-- ahora hay que SER MIEMBRO autenticado para leer challenges. (Ocultar lat/lng a un miembro ANTES
-- de votar a nivel BD requiere una Edge Function; queda como mejora futura, no la cubre este hito.)
--
-- Helper SECURITY DEFINER para comprobar membresía SIN recursión de RLS: si una policy de groups
-- consultara group_members con un subselect normal, y group_members a su vez consultara groups,
-- Postgres entraría en recursión de policies. Encapsulando la comprobación en una función
-- security definer (que se salta RLS) rompemos ese ciclo y la mantenemos legible.
create or replace function public.is_group_member(gid text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = gid and m.user_id = auth.uid()
  );
$$;

-- Habilitar RLS en todas las tablas (groups/challenges/votes ya lo tenían; profiles/group_members nuevas).
alter table public.profiles       enable row level security;
alter table public.group_members  enable row level security;
alter table public.groups         enable row level security;
alter table public.challenges     enable row level security;
alter table public.votes          enable row level security;

-- Retiramos las policies públicas de v0.1 (las de players se fueron con el drop de la tabla).
drop policy if exists "groups_read"      on public.groups;
drop policy if exists "groups_write"     on public.groups;
drop policy if exists "challenges_read"  on public.challenges;
drop policy if exists "challenges_write" on public.challenges;
drop policy if exists "votes_read"       on public.votes;
drop policy if exists "votes_write"      on public.votes;

-- ── profiles ────────────────────────────────────────────────────────────────
-- SELECT: cualquier autenticado (necesitamos display_name/avatar de los demás para rankings).
-- INSERT/UPDATE: solo el propio usuario (id = auth.uid()). No hay DELETE (cae por cascade con auth.users).
create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);
create policy "profiles_insert_self" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "profiles_update_self" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ── group_members ─────────────────────────────────────────────────────────────
-- SELECT: el usuario ve sus propias filas y las filas de cualquier grupo del que es miembro
--   (para listar la gente del grupo). is_group_member evita la recursión de RLS.
-- INSERT: auto-join — solo puedes darte de alta a TI mismo (user_id = auth.uid()).
-- DELETE: salir tú mismo, o que el dueño del grupo gestione (eche) a alguien.
-- UPDATE: el dueño del grupo gestiona roles (p.ej. promover). El propio usuario no cambia su rol.
create policy "group_members_select" on public.group_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_group_member(group_id));
create policy "group_members_insert_self" on public.group_members
  for insert to authenticated
  with check (user_id = auth.uid());
create policy "group_members_delete" on public.group_members
  for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.groups g where g.id = group_id and g.created_by = auth.uid())
  );
create policy "group_members_update_owner" on public.group_members
  for update to authenticated
  using (exists (select 1 from public.groups g where g.id = group_id and g.created_by = auth.uid()))
  with check (exists (select 1 from public.groups g where g.id = group_id and g.created_by = auth.uid()));

-- ── groups ──────────────────────────────────────────────────────────────────
-- SELECT: el flujo de auto-join (§2) necesita leer el grupo por su código ANTES de ser miembro
--   (para mostrar "Únete a {grupo}"). Por eso lo permitimos a cualquier autenticado: el id es un
--   código que ya tienes del enlace, y solo expone id/name — NO la respuesta del reto, que vive en
--   challenges y sí exige membresía. Así el onboarding es viable sin abrir el contenido del juego.
-- INSERT: cualquier autenticado (te conviertes en dueño marcando created_by = auth.uid()).
-- UPDATE/DELETE: solo el dueño (created_by = auth.uid()).
create policy "groups_select_authenticated" on public.groups
  for select to authenticated using (true);
create policy "groups_insert_owner" on public.groups
  for insert to authenticated with check (created_by = auth.uid());
create policy "groups_update_owner" on public.groups
  for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "groups_delete_owner" on public.groups
  for delete to authenticated using (created_by = auth.uid());

-- ── challenges ────────────────────────────────────────────────────────────────
-- SELECT/INSERT: miembro del grupo. El INSERT exige además que el creador sea uno mismo.
-- UPDATE/DELETE: solo el DUEÑO DEL GRUPO (no basta con ser quien creó el reto): el dueño gobierna
--   los retos de su grupo. Cierra la fuga de lat/lng a no-miembros.
create policy "challenges_select_member" on public.challenges
  for select to authenticated using (public.is_group_member(group_id));
create policy "challenges_insert_member" on public.challenges
  for insert to authenticated
  with check (public.is_group_member(group_id) and created_by = auth.uid());
create policy "challenges_update_owner" on public.challenges
  for update to authenticated
  using (exists (select 1 from public.groups g where g.id = group_id and g.created_by = auth.uid()))
  with check (exists (select 1 from public.groups g where g.id = group_id and g.created_by = auth.uid()));
create policy "challenges_delete_owner" on public.challenges
  for delete to authenticated
  using (exists (select 1 from public.groups g where g.id = group_id and g.created_by = auth.uid()));

-- ── votes ───────────────────────────────────────────────────────────────────
-- SELECT: miembro del grupo (ver el marcador). La ocultación de pines/ubicación ANTES de votar
--   sigue siendo regla de cliente (como hoy); el perímetro ya no es público.
-- INSERT: solo tu propio voto (user_id = auth.uid()) y siendo miembro; el unique (challenge_id,
--   user_id) garantiza 1 por reto.
-- UPDATE/DELETE: solo tu propio voto.
create policy "votes_select_member" on public.votes
  for select to authenticated using (public.is_group_member(group_id));
create policy "votes_insert_self" on public.votes
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_group_member(group_id));
create policy "votes_update_self" on public.votes
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "votes_delete_self" on public.votes
  for delete to authenticated using (user_id = auth.uid());

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Storage bucket `images` — foto opcional del reto, solo autenticados
-- ════════════════════════════════════════════════════════════════════════════
-- Mantenemos el bucket (retos con foto, opcional por reto). Lo cerramos a autenticados: ya no es
-- de lectura pública anónima. Sustituimos las policies públicas de v0.1.
update storage.buckets set public = false where id = 'images';

drop policy if exists "images_read"  on storage.objects;
drop policy if exists "images_write" on storage.objects;

create policy "images_select_authenticated" on storage.objects
  for select to authenticated using (bucket_id = 'images');
create policy "images_insert_authenticated" on storage.objects
  for insert to authenticated with check (bucket_id = 'images');
create policy "images_update_authenticated" on storage.objects
  for update to authenticated using (bucket_id = 'images') with check (bucket_id = 'images');
create policy "images_delete_authenticated" on storage.objects
  for delete to authenticated using (bucket_id = 'images');

-- ════════════════════════════════════════════════════════════════════════════
-- 9. Realtime — añadir group_members; votes/challenges ya están en la publicación
-- ════════════════════════════════════════════════════════════════════════════
-- Realtime respeta RLS: los suscriptores deben estar autenticados y ser miembros (§4.4).
do $$
begin
  alter publication supabase_realtime add table public.group_members;
exception when duplicate_object then null;
end $$;
