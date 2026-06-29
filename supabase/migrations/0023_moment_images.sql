-- ════════════════════════════════════════════════════════════════════════════
-- 0023 — galería de fotos por MOMENTO (varias imágenes por recuerdo)
-- ════════════════════════════════════════════════════════════════════════════
-- Hoy un momento/reto (`challenges`) tiene UNA sola foto (`image_path`). El
-- producto pide que un RECUERDO pueda llevar VARIAS fotos de galería, con una
-- portada (la 1ª por defecto, cambiable en cualquier momento). El RETO sigue con
-- una sola foto (la que se adivina), así que esto NO le afecta.
--
-- Modelo (cambio aditivo, sin tocar `challenges`):
--   · Tabla nueva `moment_images`: N filas por momento, ordenadas por `sort_order`.
--   · La PORTADA es la imagen de menor `sort_order`; además se SIGUE espejando en
--     `challenges.image_path` (lo hace el cliente al subir / cambiar portada), para
--     que la tarjeta del viaje, el mapamundi y todo lo que ya lee `image_path`
--     funcionen SIN cambios.
--   · Backfill: cada recuerdo con foto existente entra como su 1ª imagen, para que
--     la galería muestre lo que ya había (cero pérdida).
--
-- RLS: mismo perímetro que `challenges` — SELECT para miembros del grupo;
-- INSERT/UPDATE/DELETE para el DUEÑO del grupo (gobierna el contenido). INSERT
-- exige además que el grupo no esté cerrado (paridad con 0020). Las fotos viven en
-- el bucket privado `images` (URLs firmadas), igual que `image_path`.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.moment_images (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  image_path text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Listado de la galería de un momento: por momento, en orden de portada.
create index if not exists moment_images_challenge_idx
  on public.moment_images (challenge_id, sort_order);

-- Backfill: la foto actual de cada RECUERDO pasa a ser su primera imagen (portada).
-- Solo recuerdos (is_challenge = false); el reto se queda con su única foto.
insert into public.moment_images (challenge_id, image_path, sort_order)
select id, image_path, 0
from public.challenges
where is_challenge = false
  and image_path is not null
  and not exists (
    select 1 from public.moment_images mi where mi.challenge_id = challenges.id
  );

alter table public.moment_images enable row level security;

-- SELECT: miembro del grupo del momento (mismo perímetro que challenges_select_member).
create policy "moment_images_select_member" on public.moment_images
  for select to authenticated using (
    exists (
      select 1 from public.challenges c
      where c.id = challenge_id and public.is_group_member(c.group_id)
    )
  );

-- INSERT: dueño del grupo y grupo no cerrado (paridad con challenges_insert_member, 0020).
create policy "moment_images_insert_owner" on public.moment_images
  for insert to authenticated with check (
    exists (
      select 1 from public.challenges c
      join public.groups g on g.id = c.group_id
      where c.id = challenge_id
        and g.created_by = auth.uid()
        and g.closed_at is null
    )
  );

-- UPDATE/DELETE: solo el dueño del grupo (reordenar, cambiar portada, quitar fotos).
create policy "moment_images_update_owner" on public.moment_images
  for update to authenticated
  using (
    exists (
      select 1 from public.challenges c
      join public.groups g on g.id = c.group_id
      where c.id = challenge_id and g.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.challenges c
      join public.groups g on g.id = c.group_id
      where c.id = challenge_id and g.created_by = auth.uid()
    )
  );

create policy "moment_images_delete_owner" on public.moment_images
  for delete to authenticated
  using (
    exists (
      select 1 from public.challenges c
      join public.groups g on g.id = c.group_id
      where c.id = challenge_id and g.created_by = auth.uid()
    )
  );

-- Realtime: la galería se actualiza en vivo (subir/reordenar) sin recargar.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'moment_images'
  ) then
    alter publication supabase_realtime add table public.moment_images;
  end if;
end $$;
