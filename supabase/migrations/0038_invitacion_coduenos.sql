-- ════════════════════════════════════════════════════════════════════════════
-- 0038 — INVITACIÓN DE CO-DUEÑO: enlace separado de "ver" vs "administrar"
-- ════════════════════════════════════════════════════════════════════════════
-- Issue #707. Petición literal del dueño: "¿no se le puede mandar un link de
-- dueño? separar las invitaciones: ver vs administrador." Hoy el único camino
-- para que otra persona administre un viaje es invitarla con el enlace normal
-- (entra como miembro, role='member') y luego promoverla a mano en «Miembros»
-- (#690, `setMemberRole`/`group_members_update_owner`, migración 0026). Esta
-- migración añade un enlace de UN SOLO USO que asciende directamente a
-- co-dueño al canjearlo, sin pasar por el paso intermedio de "Miembros".
--
-- MODELO:
--   · Tabla `group_invites`: un TOKEN opaco (uuid, no adivinable) por invitación
--     emitida. `role` está pensado extensible (CHECK a una sola opción hoy:
--     'owner') por si el futuro trae otros tipos de invitación con enlace
--     propio; hoy solo se emite 'owner'. `expires_at` a 7 días (default en BD,
--     no en cliente: no se puede alargar manipulando el reloj del navegador).
--     `used_by`/`used_at` marcan el canje: UN SOLO USO, reintentar con el mismo
--     token tras canjearlo falla explícitamente (ver la RPC).
--   · RPC `redeem_owner_invite(invite_token)` SECURITY DEFINER: valida el token
--     (existe, no usado, no caducado) e inserta — o ASCIENDE si ya era miembro —
--     la membresía de `auth.uid()` a role='owner'. Igual que 0026/0033, el
--     search_path fijo (`set search_path = public`) evita que una función
--     `public` maliciosa creada por otro rol (imposible aquí sin permisos, pero
--     es la disciplina estándar de Postgres para SECURITY DEFINER) intercepte
--     la resolución de `public.group_members`.
--
-- RLS de `group_invites` (por qué es seguro):
--   · INSERT: solo un DUEÑO del grupo (creador raíz o co-dueño, mismo patrón
--     `is_group_owner`/`created_by` que 0026/0033) puede EMITIR un enlace de
--     co-dueño de SU grupo. `created_by` debe ser `auth.uid()` (no se puede
--     emitir un enlace "de parte de" otro).
--   · SELECT: solo dueños del grupo (para listar/revocar EN EL FUTURO; esta
--     migración no añade UI de listado/revocación, pero deja la policy lista).
--     NO hay SELECT público ni para el propio invitado: el token viaja en la
--     URL, nunca se consulta la tabla desde el cliente para "ver si es válido"
--     — el ÚNICO camino de lectura/escritura para alguien sin ser dueño es la
--     RPC `redeem_owner_invite`, que no expone la tabla (SECURITY DEFINER) y
--     solo confirma canjeado/caducado/inválido, nunca lista tokens ajenos. Sin
--     esta restricción, un no-dueño podría hacer `select token from
--     group_invites where group_id = X` y ENUMERAR tokens válidos sin
--     necesitar el enlace real.
--   · Sin UPDATE/DELETE por RLS de cliente: el marcado de uso (`used_by`/
--     `used_at`) lo hace la RPC (SECURITY DEFINER, se salta la RLS), no el
--     cliente directamente — así un dueño no puede "reabrir" su propio enlace
--     ya usado editando la fila a mano desde el cliente.
--
-- Por qué SECURITY DEFINER es seguro aquí: la función NO confía en nada que
-- mande el cliente salvo el token (un uuid aleatorio de 122 bits, no
-- enumerable) y `auth.uid()` (puesto por el JWT, no manipulable). Toda la
-- autorización de "quién puede ascender a quién" está en la lógica de la
-- función (token válido → el group_id que ese token trae, nunca uno elegido
-- por el cliente) + `search_path` fijado (evita shadowing de `public.*`).
--
-- DATA-PRESERVING: tabla nueva, RPC nueva, sin tocar columnas existentes.
-- NO aplicar a producción a mano: lo aplica el pipeline db-migrate al mergear.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. group_invites
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.group_invites (
  token uuid primary key default gen_random_uuid(),
  group_id text not null references public.groups (id) on delete cascade,
  role text not null check (role = 'owner'),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references auth.users (id),
  used_at timestamptz
);

comment on table public.group_invites is
  'Enlaces de invitación de UN SOLO USO que ascienden directamente a un rol '
  '(hoy solo "owner") al canjearse, sin pasar por el alta normal de miembro. '
  'Token opaco (uuid) en la PK: no enumerable, no hay SELECT público. '
  'Migración 0038 (#707).';

create index if not exists group_invites_group_id_idx on public.group_invites (group_id);

alter table public.group_invites enable row level security;

-- INSERT: solo un dueño del grupo (creador raíz o co-dueño), y solo puede
-- emitir el enlace a su propio nombre (created_by = auth.uid()).
drop policy if exists "group_invites_insert_owner" on public.group_invites;
create policy "group_invites_insert_owner" on public.group_invites
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      public.is_group_owner(group_id)
      or exists (select 1 from public.groups g where g.id = group_id and g.created_by = auth.uid())
    )
  );

-- SELECT: solo dueños del grupo (listar/revocar es trabajo futuro; esta
-- policy ya lo deja preparado). Nunca público: el token no se enumera.
drop policy if exists "group_invites_select_owner" on public.group_invites;
create policy "group_invites_select_owner" on public.group_invites
  for select to authenticated
  using (
    public.is_group_owner(group_id)
    or exists (select 1 from public.groups g where g.id = group_id and g.created_by = auth.uid())
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 2. redeem_owner_invite(invite_token) — canjear el enlace, un solo uso
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.redeem_owner_invite(invite_token uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_group   text;
  v_used_at timestamptz;
  v_expires timestamptz;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  select group_id, used_at, expires_at
    into v_group, v_used_at, v_expires
  from public.group_invites
  where token = invite_token;

  if not found then
    raise exception 'Enlace de co-dueño no válido' using errcode = 'P0002';
  end if;

  if v_used_at is not null then
    raise exception 'Este enlace de co-dueño ya se ha usado' using errcode = 'P0001';
  end if;

  if v_expires < now() then
    raise exception 'Este enlace de co-dueño ha caducado' using errcode = 'P0001';
  end if;

  -- RECLAMA el token ANTES de tocar la membresía, de forma atómica (`where
  -- used_at is null`): dos canjes simultáneos del mismo token pasarían ambos
  -- las comprobaciones de arriba (leen el mismo estado), pero solo UNO gana
  -- este update — el otro no encuentra fila y falla como "ya usado". Sin esta
  -- reclamación, un token de un solo uso podría ascender a dos personas.
  update public.group_invites
     set used_by = v_uid, used_at = now()
   where token = invite_token
     and used_at is null;

  if not found then
    raise exception 'Este enlace de co-dueño ya se ha usado' using errcode = 'P0001';
  end if;

  -- Alta o ASCENSO a co-dueño: si ya era miembro, lo promueve; si no, lo da de
  -- alta directamente como owner (evita el paso intermedio de entrar como
  -- miembro y que otro dueño lo promueva a mano).
  insert into public.group_members (group_id, user_id, role)
  values (v_group, v_uid, 'owner')
  on conflict (group_id, user_id) do update set role = 'owner';

  return v_group;
end;
$$;

revoke all on function public.redeem_owner_invite(uuid) from public;
grant execute on function public.redeem_owner_invite(uuid) to authenticated;
