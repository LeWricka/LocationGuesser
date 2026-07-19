-- 0042_push_prefs_fin_reto — preferencias de notificación por tipo + dos avisos
-- nuevos: FIN DE RETO (`closed`) y FIN DE VIAJE (`trip_closed`). Issue #857.
--
-- QUÉ CAMBIA respecto a 0040/0041 (que son la base — TODO lo de ahí se
-- mantiene: config en `private.push_config`, cabeceras Authorization/apikey
-- (gateway) + X-Push-Token (auth real), best-effort con EXCEPTION):
--
--   1. `profiles.push_prefs` (jsonb, default '{}') — contrato de preferencias:
--      claves `created` | `memory` | `closed` | `trip_closed`, valor boolean.
--      CLAVE AUSENTE = true (activada): un perfil recién creado ('{}') recibe
--      todo, igual que hoy. `send-push` (Edge Function) filtra destinatarios
--      leyendo esta columna — no hay policy nueva de RLS: "profiles_update_self"
--      (0004) ya cubre la fila entera por `id = auth.uid()`, sin restricción de
--      columnas, así que el propio usuario ya puede escribir push_prefs.
--
--   2. FIN DE RETO (`closed`): a diferencia de "reto creado"/"recuerdo nuevo",
--      no hay una fila nueva que dispare un trigger — el reto "cierra solo"
--      cuando `deadline_at` pasa, sin ninguna escritura en ese instante. Por
--      eso este aviso NO puede ser un trigger de BD: hace falta un POLL
--      periódico (`pg_cron`, cada 5 min) que busque retos recién cerrados.
--      `challenges.closed_notified_at` es el marcador anti-duplicados (una vez
--      notificado, el siguiente tick del cron lo salta).
--
--      DECISIÓN DE PRODUCTO: solo se avisa si el reto tuvo ≥1 voto. Un reto sin
--      jugadas no tiene "resultados ni ganador" que enseñar (el copy de
--      `closed` es literalmente "mira los resultados y quién ha ganado"); avisar
--      igualmente sería ruido vacío. Si en el futuro se quiere avisar también de
--      los retos sin jugar (p.ej. para recordar que existió), es un `exists`
--      menos en la condición de abajo — cambio de una línea.
--
--   3. FIN DE VIAJE (`trip_closed`): SÍ es un trigger (a diferencia de #2),
--      porque el cierre de viaje es una escritura real y detectable:
--      `groups.closed_at` pasa de NULL a NOT NULL vía `close_group()` (0020).
--      El `WHEN` del trigger exige justo esa transición (`old is null and new is
--      not null`), así que un UPDATE que no toque closed_at, o un update que ya
--      estaba cerrado, no dispara nada. Un reopen (`reopen_group`, closed_at ->
--      null) seguido de un recierre SÍ vuelve a avisar — es la lectura que pidió
--      producto ("un recierre legítimo puede volver a avisar"); no hace falta
--      columna de marcador aparte porque el propio `WHEN` ya es el candado.
--
--      Exclusión de quien cierra: igual que `created`/`memory` excluyen al
--      creador de la fila, `trip_closed` excluye a quien ejecutó el cierre (ya
--      lo está viendo en pantalla). El trigger lee `auth.uid()` en el momento
--      del UPDATE (funciona igual que dentro de `close_group`, que ya lo usa) y
--      lo manda en el body como `excluded_user_id`; si el cierre no vino de una
--      sesión de usuario (auth.uid() null, p.ej. un ajuste manual en el SQL
--      Editor), no se excluye a nadie.
--
-- NO aplicar a producción desde aquí: lo aplica el orquestador (pipeline de
-- `db push`, ver docs/migraciones-automaticas.md) o a mano si hiciera falta.
-- pg_cron: ver aviso de permisos en la sección 4.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. profiles.push_prefs — preferencias de notificación por tipo
-- ════════════════════════════════════════════════════════════════════════════
alter table public.profiles
  add column if not exists push_prefs jsonb not null default '{}'::jsonb;

-- Sin policy nueva: "profiles_update_self" (0004) ya permite al dueño de la
-- fila (id = auth.uid()) actualizar CUALQUIER columna, push_prefs incluida.

-- ════════════════════════════════════════════════════════════════════════════
-- 2. FIN DE RETO — marcador anti-duplicados + función de poll + pg_cron
-- ════════════════════════════════════════════════════════════════════════════
alter table public.challenges
  add column if not exists closed_notified_at timestamptz;

-- Acelera el poll del cron: solo interesan los retos (is_challenge) sin avisar
-- aún, ordenados/filtrados por su plazo. Parcial porque la mayoría de filas ya
-- tendrán closed_notified_at puesto tras su primer ciclo.
create index if not exists challenges_pending_closed_notify_idx
  on public.challenges (deadline_at)
  where is_challenge and closed_notified_at is null;

-- SECURITY DEFINER: la llama pg_cron como `postgres`, pero necesita saltarse
-- RLS para leer todos los retos/votos de todos los grupos y escribir
-- closed_notified_at. Mismo contrato de config y patrón best-effort que
-- `notify_challenge_created` (0040/0041): si `private.push_config` no está
-- completa, no hace nada (no revienta el cron).
create or replace function public.notify_closed_challenges()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url   text;
  v_token text;
  v_key   text;
  r       record;
begin
  select fn_url, send_token, anon_key into v_url, v_token, v_key
    from private.push_config where id;
  if coalesce(v_url, '') = '' or coalesce(v_token, '') = '' or coalesce(v_key, '') = '' then
    return;
  end if;

  -- Retos (no recuerdos) cuyo plazo ya pasó, sin avisar todavía, y con al
  -- menos 1 voto (decisión de producto documentada arriba).
  for r in
    select c.id
    from public.challenges c
    where c.is_challenge
      and c.deadline_at is not null
      and c.deadline_at <= now()
      and c.closed_notified_at is null
      and exists (select 1 from public.votes v where v.challenge_id = c.id)
    order by c.deadline_at
  loop
    -- Marcamos ANTES de disparar el aviso: pg_net solo ENCOLA la petición (no
    -- espera respuesta), así que si esto se ejecuta es porque el encolado no
    -- lanzó excepción; el siguiente tick del cron no debe reintentar esta fila
    -- aunque la entrega real (asíncrona) falle más tarde.
    update public.challenges set closed_notified_at = now() where id = r.id;

    begin
      perform net.http_post(
        url     := v_url,
        headers := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'Authorization', 'Bearer ' || v_key,
                     'apikey', v_key,
                     'X-Push-Token', v_token
                   ),
        body    := jsonb_build_object('challenge_id', r.id, 'kind', 'closed')
      );
    exception
      when others then
        -- Best-effort por fila: un fallo al encolar esta no debe abortar el
        -- resto del lote (queda en logs de Postgres).
        null;
    end;
  end loop;
end;
$$;

revoke all on function public.notify_closed_challenges() from public, anon, authenticated;

-- ── Programación (cada 5 min) ─────────────────────────────────────────────
-- ⚠️ AVISO OPERATIVO: si `create extension pg_cron` falla en prod con
-- "permission denied" (posible: Supabase capó ya `alter database/role set` en
-- 0040, y algunos proyectos exigen activar pg_cron una vez desde el Dashboard
-- → Database → Extensions antes de poder crearlo por SQL), el orquestador debe
-- activarlo ahí manualmente y volver a aplicar SOLO estas 2 líneas siguientes
-- (son idempotentes: `if not exists` + `cron.schedule` re-programa el job
-- existente por nombre en vez de duplicarlo, desde pg_cron 1.4+).
create extension if not exists pg_cron;

select cron.schedule(
  'notify-closed-challenges',
  '*/5 * * * *',
  $$select public.notify_closed_challenges()$$
);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. FIN DE VIAJE — trigger sobre groups.closed_at (NULL -> NOT NULL)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.notify_group_closed()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url    text;
  v_token  text;
  v_key    text;
begin
  -- Redundante con el WHEN del trigger (abajo), pero se repite aquí por si la
  -- función se recrea/reusa desde otro trigger en el futuro sin ese WHEN.
  if old.closed_at is not null or new.closed_at is null then
    return new;
  end if;

  select fn_url, send_token, anon_key into v_url, v_token, v_key
    from private.push_config where id;
  if coalesce(v_url, '') = '' or coalesce(v_token, '') = '' or coalesce(v_key, '') = '' then
    return new;
  end if;

  -- Asíncrono (pg_net encola): no bloquea el UPDATE ni espera respuesta.
  -- `excluded_user_id`: quien ejecutó el cierre (auth.uid() en el momento del
  -- UPDATE, funciona igual que dentro de close_group) — send-push no le avisa
  -- a él (ya lo está viendo). Null si el cierre no vino de una sesión de
  -- usuario (p.ej. ajuste manual en el SQL Editor): entonces no se excluye a
  -- nadie.
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_key,
                 'apikey', v_key,
                 'X-Push-Token', v_token
               ),
    body    := jsonb_build_object(
                 'group_id', new.id,
                 'kind', 'trip_closed',
                 'excluded_user_id', auth.uid()
               )
  );

  return new;
exception
  when others then
    -- Best-effort: el aviso jamás impide cerrar el viaje (queda en logs).
    return new;
end;
$$;

drop trigger if exists trg_notify_group_closed on public.groups;
create trigger trg_notify_group_closed
  after update of closed_at on public.groups
  for each row
  when (old.closed_at is null and new.closed_at is not null)
  execute function public.notify_group_closed();
