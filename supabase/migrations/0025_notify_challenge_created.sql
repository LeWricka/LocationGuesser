-- 0025_notify_challenge_created — disparo de Web Push al crear un reto (PWA Fase 2).
-- Diseño (fuente de verdad): docs/estrategia/pwa-push.md §1.3.
--
-- Qué hace:
--   · trigger AFTER INSERT on challenges que invoca la Edge Function `send-push`
--     vía pg_net (net.http_post), pasando { challenge_id, kind: 'created' }.
--   · Así el aviso "Ana ha creado un reto" es consecuencia de la fila insertada,
--     NO una acción del cliente: web/src/features/create y lib/challenges.ts NO
--     cambian ni una línea (la feature queda casi-100% aditiva — §4 del diseño).
--
-- ADITIVA Y A PRUEBA DE "NO CONFIGURADO":
--   · Si la extensión pg_net no está, o no están puestos los GUC con la URL/token
--     de la función, el trigger NO hace nada y, sobre todo, NO bloquea ni rompe el
--     INSERT del reto (todo va dentro de un EXCEPTION que se traga el fallo). El
--     bucle de creación sigue funcionando exactamente igual con o sin push.
--
-- REQUISITOS para que el envío real ocurra (ver docs/operativa.md §6):
--   1. Extensión pg_net habilitada (Dashboard → Database → Extensions, o
--      `create extension if not exists pg_net;`).
--   2. GUC con la URL de la función y el token compartido (X-Push-Token):
--        alter database postgres set app.push_fn_url   = 'https://<ref>.functions.supabase.co/send-push';
--        alter database postgres set app.push_send_token = '<PUSH_SEND_TOKEN>';
--      (El token debe coincidir con el secret PUSH_SEND_TOKEN de la Edge Function.)
--   ALTERNATIVA equivalente: un Database Webhook del dashboard (AFTER INSERT on
--   challenges → POST a send-push). Si se usa el webhook, NO crear este trigger
--   (no dupliques el aviso). Aquí dejamos la variante SQL versionada.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Extensión pg_net (idempotente). En Supabase suele vivir en el esquema `extensions`.
-- ════════════════════════════════════════════════════════════════════════════
create extension if not exists pg_net with schema extensions;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Función del trigger
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.notify_challenge_created()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  fn_url text := current_setting('app.push_fn_url', true);
  fn_token text := current_setting('app.push_send_token', true);
begin
  -- Sin URL/token configurados, no intentamos enviar (Fase 1 sin emisor): el reto
  -- se crea igual. Cuando el operador ponga los GUC, los avisos empiezan solos.
  if fn_url is null or fn_url = '' or fn_token is null or fn_token = '' then
    return new;
  end if;

  -- net.http_post es asíncrono (encola la petición): NO bloquea el INSERT ni espera
  -- la respuesta de la función. Si pg_net no estuviera, el EXCEPTION de abajo evita
  -- que un fallo del aviso tumbe la creación del reto.
  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'X-Push-Token', fn_token
               ),
    body    := jsonb_build_object('challenge_id', new.id, 'kind', 'created')
  );

  return new;
exception
  when others then
    -- El aviso es best-effort: nunca debe impedir crear el reto. Tragamos el error
    -- (queda en los logs de Postgres) y devolvemos new para que el INSERT prospere.
    return new;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Trigger AFTER INSERT
-- ════════════════════════════════════════════════════════════════════════════
drop trigger if exists trg_notify_challenge_created on public.challenges;
create trigger trg_notify_challenge_created
  after insert on public.challenges
  for each row execute function public.notify_challenge_created();
