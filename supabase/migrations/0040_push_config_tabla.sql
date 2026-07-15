-- 0040_push_config_tabla — el disparo del push lee su config de una TABLA privada,
-- no de GUC. YA APLICADA EN PROD a mano (2026-07-15, SQL Editor); se versiona aquí
-- para que el esquema del repo sea fiel a la realidad.
--
-- POR QUÉ CAMBIA respecto a 0030: Supabase capó `alter database ... set` y
-- `alter role ... set` para parámetros custom (error 42501, comprobado en prod),
-- así que los GUC `app.push_fn_url`/`app.push_send_token` que pedía 0030 ya no se
-- pueden fijar. La config pasa a `private.push_config` (una fila singleton), que
-- solo lee la función del trigger (SECURITY DEFINER) — ni anon ni authenticated
-- tienen acceso.
--
-- ADEMÁS: el gateway de Edge Functions rechaza peticiones sin clave de API
-- ("Missing authorization header", comprobado), y la llamada de pg_net no llevaba
-- ninguna. Se añade `anon_key` (la publishable, PÚBLICA por diseño — es la misma
-- que viaja en el bundle del cliente) y el trigger la manda como Authorization.
-- La autenticación REAL sigue siendo el token compartido X-Push-Token.
--
-- OPERATIVA (docs/operativa.md §6.4): al estrenar proyecto/entorno hay que
-- INSERTAR la fila de config (no va en la migración porque lleva el token):
--
--   insert into private.push_config (id, fn_url, send_token, anon_key) values (
--     true,
--     'https://<ref>.supabase.co/functions/v1/send-push',
--     '<PUSH_SEND_TOKEN, el mismo secret de la Edge Function>',
--     '<publishable key del proyecto>'
--   )
--   on conflict (id) do update
--     set fn_url = excluded.fn_url,
--         send_token = excluded.send_token,
--         anon_key = excluded.anon_key;

create schema if not exists private;

create table if not exists private.push_config (
  id boolean primary key default true check (id),
  fn_url text not null,
  send_token text not null,
  anon_key text not null default ''
);

revoke all on private.push_config from anon, authenticated;

-- La función del trigger (misma firma que 0030; el trigger existente la reusa).
create or replace function public.notify_challenge_created()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_token text;
  v_key text;
begin
  -- Solo RETOS avisan, nunca RECUERDOS (is_challenge=false, 0022).
  if not coalesce(new.is_challenge, true) then
    return new;
  end if;

  -- Sin config completa, no se intenta enviar: el reto se crea igual.
  select fn_url, send_token, anon_key into v_url, v_token, v_key
    from private.push_config where id;
  if coalesce(v_url, '') = '' or coalesce(v_token, '') = '' or coalesce(v_key, '') = '' then
    return new;
  end if;

  -- Asíncrono (pg_net encola): no bloquea el INSERT ni espera respuesta.
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_key,
                 'apikey', v_key,
                 'X-Push-Token', v_token
               ),
    body    := jsonb_build_object('challenge_id', new.id, 'kind', 'created')
  );

  return new;
exception
  when others then
    -- Best-effort: el aviso jamás impide crear el reto (queda en logs de Postgres).
    return new;
end;
$$;
