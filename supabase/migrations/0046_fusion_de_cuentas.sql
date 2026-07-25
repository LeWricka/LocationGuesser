-- ════════════════════════════════════════════════════════════════════════════
-- 0046 — FUSIÓN DE CUENTAS: absorber una sesión de INVITADO en una cuenta ya
--        existente, de forma SEGURA (server = autoridad, token anti-robo)
-- ════════════════════════════════════════════════════════════════════════════
-- Issue #944. Caso real de prod: alguien se registró hace un mes (creó su viaje),
-- luego jugó como INVITADO anónimo (otro viaje + votos + fotos) y, al intentar
-- "registrarse" con su propio gmail, chocó con su cuenta vieja
-- (`updateUser({email})` → "email already registered"). Ninguna cuenta se puede
-- borrar (ambas tienen contenido). Antes se resolvía A MANO; esto lo automatiza.
--
-- FLUJO (cliente, ver web/src/features/auth/useAccountUpgrade.ts):
--   1) El INVITADO (sesión ANÓNIMA) intenta el upgrade normal (updateUser email).
--      Si el email YA existe, en vez de morir con el error:
--   2) El invitado —AÚN en su sesión anónima— llama `request_account_merge()`,
--      que le devuelve un TOKEN de un solo uso (caduca a 15 min). Ese token es la
--      PRUEBA de que quien pide la fusión controla la sesión anónima de origen; se
--      queda SOLO en el dispositivo (memoria del cliente), nunca viaja a otro sitio.
--   3) El invitado hace login en la cuenta EXISTENTE (signInWithOtp + verifyOtp
--      'email'). Su sesión pasa a ser la cuenta DESTINO (auth.uid() = target).
--   4) Ya como destino, llama `complete_account_merge(source_uid, token)`, que
--      valida el token y REASIGNA todo lo del invitado (source) a la cuenta destino.
--
-- ────────────────────────────────────────────────────────────────────────────
-- MODELO DE SEGURIDAD DEL TOKEN (CRÍTICO — un fallo aquí = robo de cuenta / de
-- datos; ver §Seguridad de la issue):
--   · `request_account_merge` SOLO la puede llamar una sesión ANÓNIMA (is_anonymous
--     del JWT). El token se emite para `auth.uid()` = la propia sesión anónima: no
--     se puede pedir un token "a nombre de" otra sesión. Prueba de posesión del
--     origen.
--   · El token es un uuid aleatorio (gen_random_uuid), NO enumerable, de un solo
--     uso (se borra al completar) y con caducidad de 15 min.
--   · `complete_account_merge` exige, TODAS a la vez:
--       (a) existe fila en `pending_account_merges` con (source_uid, token) exactos
--           y `created_at > now() - 15 min` (token válido y fresco);
--       (b) `p_source_uid <> auth.uid()` (no fusionarse consigo mismo);
--       (c) el source sigue siendo ANÓNIMO (auth.users.is_anonymous) — así NUNCA se
--           puede usar este mecanismo para absorber una cuenta PERMANENTE ajena
--           (que sería el robo de cuenta que hay que impedir): solo se absorbe una
--           sesión de invitado, que por definición no tiene dueño con email.
--   · El DESTINO se demuestra por estar LOGUEADO en él (verifyOtp ya ocurrió):
--     auth.uid() es la cuenta destino. No se puede fusionar hacia una cuenta en la
--     que no hayas iniciado sesión.
--   Combinado: para robar datos harían falta a la vez el token (que solo produce el
--   propio invitado desde su sesión anónima) y el login en la cuenta destino. Un
--   atacante con solo lo uno o lo otro no puede.
--
-- ────────────────────────────────────────────────────────────────────────────
-- REASIGNACIÓN CON SEGURIDAD DE CONFLICTOS:
--   El invitado y la cuenta destino pueden coincidir en el MISMO viaje/reto (p.ej.
--   ambos miembros del grupo, o ambos votaron). En las tablas con unicidad por
--   usuario NO se puede "mover" la fila del source encima de la del target (violaría
--   la unique). Regla: si el target YA tiene fila, se CONSERVA la del target y se
--   DESCARTA la del source; si no, se REASIGNA la del source al target. Enumeramos
--   TODAS las columnas que referencian a un usuario (auditadas sobre el esquema a
--   fecha de esta migración): challenges.created_by, groups.created_by,
--   group_invites.created_by, group_invites.used_by, group_members(user_id),
--   votes(user_id), play_starts(user_id), push_subscriptions(user_id), profiles.id.
--   (`group_invites.used_by` no lo listaba la issue; apareció en la auditoría del
--   esquema y se incluye por completitud — es historial de quién canjeó el enlace.)
--
-- NO se borra el auth.user anónimo de origen: queda huérfano y VACÍO (todas sus
-- filas ya se movieron o descartaron). Borrar usuarios de auth requiere privilegios
-- que no queremos meter aquí; un usuario anónimo sin datos no molesta.
--
-- DATA-PRESERVING para la cuenta DESTINO: nunca se pisa su nombre ni sus votos ni su
-- membresía; solo se AÑADE lo que el invitado tenía y el destino no.
--
-- NO aplicar a producción a mano: lo aplica el orquestador tras revisar (es auth).

-- ════════════════════════════════════════════════════════════════════════════
-- 1. pending_account_merges — el token pendiente (server-only, sin RLS abierta)
-- ════════════════════════════════════════════════════════════════════════════
-- Una fila por sesión anónima que ha pedido fusión. `source_uid` es PK: pedir de
-- nuevo RENUEVA el token (on conflict). RLS activada SIN policies: ningún rol de
-- cliente (authenticated/anon) lee ni escribe aquí por REST — el único acceso es
-- server-side, dentro de las RPC SECURITY DEFINER de abajo (mismo patrón que
-- `play_starts`, migración 0034).
create table if not exists public.pending_account_merges (
  source_uid uuid primary key references auth.users (id) on delete cascade,
  token      uuid not null,
  created_at timestamptz not null default now()
);

alter table public.pending_account_merges enable row level security;

comment on table public.pending_account_merges is
  'Token de un solo uso (caduca 15 min) que prueba que quien pide fusionar una '
  'cuenta controla la sesión anónima de origen (issue #944). RLS sin policies: '
  'solo lo tocan request_account_merge / complete_account_merge (SECURITY '
  'DEFINER). El token nunca sale del dispositivo del invitado.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. request_account_merge — la llama el INVITADO anónimo; devuelve el token
-- ════════════════════════════════════════════════════════════════════════════
-- Exige que el llamante sea ANÓNIMO (is_anonymous del JWT): solo una sesión de
-- invitado puede pedir ser absorbida. Emite/renueva el token para auth.uid() (la
-- propia sesión) y lo devuelve. SECURITY DEFINER para escribir en la tabla
-- server-only; search_path fijado (buena práctica en DEFINER, evita secuestro de
-- nombres). auth.users/auth.jwt se cualifican de forma explícita.
create or replace function public.request_account_merge()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_token uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  -- Solo un INVITADO (sesión anónima) puede pedir la fusión. coalesce(...,false):
  -- si la claim no viniera, tratamos como NO anónimo y rechazamos (conservador:
  -- una cuenta permanente no debe poder marcarse como "origen" de una fusión).
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false then
    raise exception 'Solo una sesión de invitado puede pedir la fusión'
      using errcode = '42501';
  end if;

  v_token := gen_random_uuid();

  insert into public.pending_account_merges (source_uid, token, created_at)
  values (v_uid, v_token, now())
  on conflict (source_uid) do update
    set token = excluded.token,
        created_at = excluded.created_at;

  return v_token;
end;
$$;

revoke all on function public.request_account_merge() from public;
grant execute on function public.request_account_merge() to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. complete_account_merge — la llama la cuenta DESTINO ya logueada
-- ════════════════════════════════════════════════════════════════════════════
-- Contrato: complete_account_merge(p_source_uid, p_token) -> void. La llama la
-- cuenta destino (auth.uid() = target) tras haber iniciado sesión en ella. Valida
-- el token (ver MODELO DE SEGURIDAD arriba) y reasigna todo lo del source al
-- target con seguridad de conflictos. SECURITY DEFINER: se salta la RLS para poder
-- mover filas de otras tablas y leer auth.users; la autorización REAL la hace la
-- validación del token dentro de la función, no la RLS.
create or replace function public.complete_account_merge(
  p_source_uid uuid,
  p_token uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target   uuid := auth.uid();
  v_src_anon boolean;
begin
  if v_target is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  -- (b) No fusionarse consigo mismo.
  if p_source_uid = v_target then
    raise exception 'El origen y el destino no pueden ser la misma cuenta'
      using errcode = '22023';
  end if;

  -- (a) Token válido, exacto y fresco (< 15 min). Un mensaje genérico a propósito:
  -- no distinguimos "no existe" de "caducado" para no dar pistas a un atacante.
  if not exists (
    select 1 from public.pending_account_merges m
    where m.source_uid = p_source_uid
      and m.token = p_token
      and m.created_at > now() - interval '15 minutes'
  ) then
    raise exception 'Solicitud de fusión inválida o caducada' using errcode = 'P0001';
  end if;

  -- (c) El origen sigue siendo ANÓNIMO. Es la salvaguarda contra el robo de una
  -- cuenta PERMANENTE ajena: solo se absorbe una sesión de invitado.
  select u.is_anonymous into v_src_anon from auth.users u where u.id = p_source_uid;
  if not coalesce(v_src_anon, false) then
    raise exception 'El origen no es una sesión de invitado' using errcode = '42501';
  end if;

  -- ──────────────────────────────────────────────────────────────────────────
  -- Reasignación. Toda la función es UNA transacción: si algo falla, no queda a
  -- medias. Las tablas SIN unicidad por usuario → update directo. Las que tienen
  -- unicidad → mover solo lo que el target no tenga ya y descartar el resto.
  -- ──────────────────────────────────────────────────────────────────────────

  -- Sin unicidad por usuario: reasignación directa.
  update public.challenges set created_by = v_target where created_by = p_source_uid;
  update public.groups      set created_by = v_target where created_by = p_source_uid;
  update public.group_invites set created_by = v_target where created_by = p_source_uid;
  update public.group_invites set used_by   = v_target where used_by   = p_source_uid;

  -- group_members: unique (group_id, user_id). Si el source era co-dueño ('owner')
  -- de un grupo en el que el target ya está, PROMOVEMOS al target a 'owner' antes de
  -- descartar la fila del source, para no perder la propiedad al fusionar.
  update public.group_members t
    set role = 'owner'
    from public.group_members s
    where s.user_id = p_source_uid and s.role = 'owner'
      and t.user_id = v_target and t.group_id = s.group_id
      and t.role <> 'owner';
  -- Mover las membresías del source a grupos donde el target aún no está.
  update public.group_members m
    set user_id = v_target
    where m.user_id = p_source_uid
      and not exists (
        select 1 from public.group_members t
        where t.group_id = m.group_id and t.user_id = v_target
      );
  -- Descartar las membresías restantes del source (el target ya era miembro).
  delete from public.group_members where user_id = p_source_uid;

  -- votes: unique (challenge_id, user_id). Se CONSERVA el voto del target; se
  -- mueve el del source solo en retos donde el target no votó.
  update public.votes v
    set user_id = v_target
    where v.user_id = p_source_uid
      and not exists (
        select 1 from public.votes t
        where t.challenge_id = v.challenge_id and t.user_id = v_target
      );
  delete from public.votes where user_id = p_source_uid;

  -- play_starts: unique (challenge_id, user_id). Efímera (arranques a medias); se
  -- reasigna con la misma regla por completitud y se limpia el resto.
  update public.play_starts p
    set user_id = v_target
    where p.user_id = p_source_uid
      and not exists (
        select 1 from public.play_starts t
        where t.challenge_id = p.challenge_id and t.user_id = v_target
      );
  delete from public.play_starts where user_id = p_source_uid;

  -- push_subscriptions: unique (endpoint) GLOBAL. Un endpoint pertenece a una sola
  -- fila, así que en la práctica no colisiona; aun así, reasignamos solo si el
  -- target no tiene ya ese endpoint y descartamos cualquier resto (belt & braces).
  update public.push_subscriptions s
    set user_id = v_target
    where s.user_id = p_source_uid
      and not exists (
        select 1 from public.push_subscriptions t
        where t.endpoint = s.endpoint and t.user_id = v_target
      );
  delete from public.push_subscriptions where user_id = p_source_uid;

  -- profiles: NO se toca el nombre del target. Si el target NO tiene avatar y el
  -- source SÍ, se copia (para no perder la foto que el invitado hubiera puesto).
  -- La fila de profiles del source se queda huérfana con su auth.user vacío.
  update public.profiles t
    set avatar_url = s.avatar_url
    from public.profiles s
    where t.id = v_target
      and s.id = p_source_uid
      and t.avatar_url is null
      and s.avatar_url is not null;

  -- Token consumido: un solo uso.
  delete from public.pending_account_merges where source_uid = p_source_uid;
end;
$$;

revoke all on function public.complete_account_merge(uuid, uuid) from public;
grant execute on function public.complete_account_merge(uuid, uuid) to authenticated;
