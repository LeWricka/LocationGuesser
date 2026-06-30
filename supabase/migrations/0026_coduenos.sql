-- ════════════════════════════════════════════════════════════════════════════
-- 0026 — varios dueños (CO-DUEÑOS) de un grupo
-- ════════════════════════════════════════════════════════════════════════════
-- Issue #307. Hoy el dueño es ÚNICO (`groups.created_by`): solo él edita/cierra el
-- grupo, gestiona retos, premios e imágenes. En viajes reales conviene que más de
-- una persona pueda administrar. Esta migración añade un modelo de roles y abre los
-- permisos de dueño a los CO-DUEÑOS, sin romper la RLS ni al dueño actual.
--
-- MODELO (simple y robusto):
--   · `group_members.role` ('owner' | 'member') ya existe desde 0004 (default
--     'member'); aquí lo respaldamos con un CHECK y BACKFILLEAMOS al `created_by`
--     de cada grupo como 'owner' (hoy se inserta así al crear, pero puede haber
--     grupos previos sin la fila o con rol 'member').
--   · El CREADOR (`groups.created_by`) es el dueño RAÍZ: siempre cuenta como owner,
--     no se le puede degradar y el grupo nunca se queda sin ningún owner (lo
--     garantiza la UI + estas reglas; degradar al creador no le quita el poder
--     porque `created_by` sigue mandando en paralelo a `role`).
--   · Helper SECURITY DEFINER `is_group_owner(gid)`: true si hay group_members con
--     user_id = auth.uid(), group_id = gid y role = 'owner'. Mismo patrón que
--     `is_group_member` (0004): se salta la RLS de group_members y evita recursión.
--
-- RLS: las policies que hoy autorizan SOLO al dueño por `created_by` pasan a aceptar
-- TAMBIÉN a los co-dueños vía `is_group_owner`. Afecta a groups (update/delete),
-- challenges (update/delete), group_members (update de roles) y storage.objects
-- (update/delete de imágenes, ampliando 0025). `created_by` se mantiene como dueño
-- raíz (sigue autorizado siempre, aunque su fila no exista o diga 'member').
--
-- DATA-PRESERVING: añade un CHECK, backfillea roles y recrea policies con
-- drop+create. No trunca ni mueve datos.
--
-- NO aplicar a producción a mano: lo aplica el pipeline db-migrate al mergear.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. group_members.role — restringir valores y backfill del creador como 'owner'
-- ════════════════════════════════════════════════════════════════════════════
-- La columna `role` ya existe (0004) con default 'member'. Le añadimos un CHECK
-- para que solo admita 'owner' | 'member' (defensa en BD frente a valores raros).
alter table public.group_members
  drop constraint if exists group_members_role_check;
alter table public.group_members
  add constraint group_members_role_check check (role in ('owner', 'member'));

-- Backfill: el creador de cada grupo debe ser 'owner' en group_members. Cubre dos
-- casos: (a) grupos antiguos donde el creador no tenga fila de membresía (la
-- insertamos como owner); (b) su fila existe pero quedó como 'member' (la
-- promovemos). Idempotente: re-ejecutar no cambia nada.
insert into public.group_members (group_id, user_id, role)
select g.id, g.created_by, 'owner'
from public.groups g
where g.created_by is not null
on conflict (group_id, user_id) do update set role = 'owner';

update public.group_members m
   set role = 'owner'
  from public.groups g
 where g.id = m.group_id
   and g.created_by = m.user_id
   and m.role <> 'owner';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. is_group_owner(gid) — ¿soy co-dueño (role='owner') de este grupo?
-- ════════════════════════════════════════════════════════════════════════════
-- SECURITY DEFINER (igual que is_group_member de 0004): consulta group_members
-- saltándose su RLS, así una policy de groups/challenges puede llamarla sin entrar
-- en recursión de policies. Devuelve true solo si hay una fila con role='owner'
-- para auth.uid(). El dueño raíz (created_by) se sigue comprobando aparte en cada
-- policy con un OR, así que esta función NO necesita conocer created_by.
create or replace function public.is_group_owner(gid text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = gid
      and m.user_id = auth.uid()
      and m.role = 'owner'
  );
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. groups — UPDATE/DELETE: dueño raíz (created_by) O co-dueño (is_group_owner)
-- ════════════════════════════════════════════════════════════════════════════
-- Recreamos las policies de 0004. La edición normal del grupo (nombre, premios,
-- cerrar/abrir vía RPC con su propia comprobación) ahora la permite también un
-- co-dueño. NO tocamos `groups_transfer_owner` (0009): transferir el dueño raíz
-- sigue exigiendo ser el `created_by` actual (no un co-dueño), para no diluir quién
-- puede regalar la raíz. Tampoco tocamos `groups_insert_owner` ni el SELECT.
drop policy if exists "groups_update_owner" on public.groups;
create policy "groups_update_owner" on public.groups
  for update to authenticated
  using (created_by = auth.uid() or public.is_group_owner(id))
  with check (created_by = auth.uid() or public.is_group_owner(id));

drop policy if exists "groups_delete_owner" on public.groups;
create policy "groups_delete_owner" on public.groups
  for delete to authenticated
  using (created_by = auth.uid() or public.is_group_owner(id));

-- ════════════════════════════════════════════════════════════════════════════
-- 4. challenges — UPDATE/DELETE: dueño raíz del grupo O co-dueño
-- ════════════════════════════════════════════════════════════════════════════
-- Recreamos las policies de 0004 (editar/borrar retos lo gobierna el dueño del
-- grupo). Añadimos el OR con is_group_owner para los co-dueños. El INSERT
-- (`challenges_insert_member`, recreado por 0020 con el check de grupo no cerrado)
-- NO cambia: ya basta con ser MIEMBRO para crear retos.
drop policy if exists "challenges_update_owner" on public.challenges;
create policy "challenges_update_owner" on public.challenges
  for update to authenticated
  using (
    public.is_group_owner(group_id)
    or exists (select 1 from public.groups g where g.id = group_id and g.created_by = auth.uid())
  )
  with check (
    public.is_group_owner(group_id)
    or exists (select 1 from public.groups g where g.id = group_id and g.created_by = auth.uid())
  );

drop policy if exists "challenges_delete_owner" on public.challenges;
create policy "challenges_delete_owner" on public.challenges
  for delete to authenticated
  using (
    public.is_group_owner(group_id)
    or exists (select 1 from public.groups g where g.id = group_id and g.created_by = auth.uid())
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 5. group_members — UPDATE de roles: lo hace el dueño raíz O un co-dueño
-- ════════════════════════════════════════════════════════════════════════════
-- Recreamos `group_members_update_owner` (0004) para que un co-dueño también pueda
-- gestionar roles (promover/degradar). Así `setMemberRole` del cliente funciona
-- para cualquier owner. Salvaguarda del dueño RAÍZ: el WITH CHECK impide dejar al
-- creador del grupo en un rol distinto de 'owner' (no se le puede degradar; su rol
-- siempre debe quedar 'owner'). Esto evita que un co-dueño degrade al creador.
drop policy if exists "group_members_update_owner" on public.group_members;
create policy "group_members_update_owner" on public.group_members
  for update to authenticated
  using (
    public.is_group_owner(group_id)
    or exists (select 1 from public.groups g where g.id = group_id and g.created_by = auth.uid())
  )
  with check (
    (
      public.is_group_owner(group_id)
      or exists (select 1 from public.groups g where g.id = group_id and g.created_by = auth.uid())
    )
    -- El creador del grupo no puede acabar con un rol distinto de 'owner'.
    and not exists (
      select 1 from public.groups g
      where g.id = group_id and g.created_by = user_id and role <> 'owner'
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 6. storage.objects (bucket `images`) — UPDATE/DELETE: ampliar a CO-DUEÑOS
-- ════════════════════════════════════════════════════════════════════════════
-- 0025 cerró el UPDATE/DELETE de imágenes al CREADOR del reto o al DUEÑO del grupo
-- (groups.created_by). Recreamos esas dos policies añadiendo
-- `or public.is_group_owner(c.group_id)` en cada rama, para que los co-dueños
-- también puedan reemplazar/borrar la portada del reto y las fotos del recuerdo.
-- SELECT (por membresía) e INSERT (abierto a autenticados) de 0025 NO cambian.
drop policy if exists "images_update_owner" on storage.objects;
create policy "images_update_owner" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'images'
    and (
      exists (
        select 1
        from public.challenges c
        where c.image_path = storage.objects.name
          and (
            c.created_by = auth.uid()
            or public.is_group_owner(c.group_id)
            or exists (
              select 1 from public.groups g
              where g.id = c.group_id and g.created_by = auth.uid()
            )
          )
      )
      or exists (
        select 1
        from public.moment_images mi
        join public.challenges c on c.id = mi.challenge_id
        where mi.image_path = storage.objects.name
          and (
            c.created_by = auth.uid()
            or public.is_group_owner(c.group_id)
            or exists (
              select 1 from public.groups g
              where g.id = c.group_id and g.created_by = auth.uid()
            )
          )
      )
    )
  )
  with check (
    bucket_id = 'images'
    and (
      exists (
        select 1
        from public.challenges c
        where c.image_path = storage.objects.name
          and (
            c.created_by = auth.uid()
            or public.is_group_owner(c.group_id)
            or exists (
              select 1 from public.groups g
              where g.id = c.group_id and g.created_by = auth.uid()
            )
          )
      )
      or exists (
        select 1
        from public.moment_images mi
        join public.challenges c on c.id = mi.challenge_id
        where mi.image_path = storage.objects.name
          and (
            c.created_by = auth.uid()
            or public.is_group_owner(c.group_id)
            or exists (
              select 1 from public.groups g
              where g.id = c.group_id and g.created_by = auth.uid()
            )
          )
      )
    )
  );

drop policy if exists "images_delete_owner" on storage.objects;
create policy "images_delete_owner" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'images'
    and (
      exists (
        select 1
        from public.challenges c
        where c.image_path = storage.objects.name
          and (
            c.created_by = auth.uid()
            or public.is_group_owner(c.group_id)
            or exists (
              select 1 from public.groups g
              where g.id = c.group_id and g.created_by = auth.uid()
            )
          )
      )
      or exists (
        select 1
        from public.moment_images mi
        join public.challenges c on c.id = mi.challenge_id
        where mi.image_path = storage.objects.name
          and (
            c.created_by = auth.uid()
            or public.is_group_owner(c.group_id)
            or exists (
              select 1 from public.groups g
              where g.id = c.group_id and g.created_by = auth.uid()
            )
          )
      )
    )
  );
