-- 0041_push_recuerdos — el aviso push deja de ser solo-retos: los RECUERDOS
-- (momentos sin capa de juego, `is_challenge = false`, 0022) también avisan al
-- resto del viaje. Issue #775: "el recuerdo es el corazón del diario — avisar
-- también".
--
-- QUÉ CAMBIA respecto a 0040 (que es la base — TODO lo de ahí se mantiene: config
-- en `private.push_config`, envío de `Authorization`/`apikey` (gateway) + el
-- secreto real `X-Push-Token`, y el best-effort con EXCEPTION):
--
--   1. La función deja de filtrar por `is_challenge` — antes devolvía sin más si
--      la fila era un recuerdo; ahora calcula el `kind` a partir de la fila:
--      `'created'` (reto) o `'memory'` (recuerdo), y lo manda en el body para que
--      `send-push` decida el copy (sin spoiler en ningún caso: ni lat/lng de reto
--      ni contenido completo de recuerdo más allá de su propio título público).
--   2. El TRIGGER pierde el `WHEN (new.is_challenge is true)` que puso 0030 — si
--      no, el recuerdo nunca llegaría a invocar la función. Sin este cambio, el
--      punto 1 sería papel mojado: el WHEN filtra ANTES de que la función se
--      ejecute.
--
-- NO aplicar a producción desde aquí: requiere login del dueño (SQL Editor).
-- Checklist de despliegue completa en el body del PR de la issue #775.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Función del trigger — mismo contrato de config que 0040, kind derivado de
--    `is_challenge` en vez de fijo a 'created'.
-- ════════════════════════════════════════════════════════════════════════════
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
  v_kind text;
begin
  -- Reto (is_challenge=true, default histórico) -> 'created'; recuerdo -> 'memory'.
  -- A diferencia de 0030/0040, aquí SÍ avisamos en ambos casos: `send-push`
  -- decide el copy (sin spoiler) según `kind`.
  v_kind := case when coalesce(new.is_challenge, true) then 'created' else 'memory' end;

  -- Sin config completa, no se intenta enviar: la fila se crea igual.
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
    body    := jsonb_build_object('challenge_id', new.id, 'kind', v_kind)
  );

  return new;
exception
  when others then
    -- Best-effort: el aviso jamás impide crear el reto/recuerdo (queda en logs).
    return new;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Trigger AFTER INSERT — sin el WHEN de solo-retos (0030): ahora dispara para
--    cualquier fila nueva de `challenges`, sea reto o recuerdo. La función decide
--    el `kind`; si la config no está puesta, no se envía nada igualmente (§1).
-- ════════════════════════════════════════════════════════════════════════════
drop trigger if exists trg_notify_challenge_created on public.challenges;
create trigger trg_notify_challenge_created
  after insert on public.challenges
  for each row
  execute function public.notify_challenge_created();
