-- 0012 — garantía anti-huérfanos: la respuesta del reto SIEMPRE existe
-- ════════════════════════════════════════════════════════════════════════════
-- Contexto: desde la 0010 la respuesta (lat/lng) vive en `challenge_answers`
-- (gobernada por RLS), no en `challenges`. El cliente la espeja tras crear/editar
-- el reto. Si ese segundo escritura no llega (ventana de despliegue, fallo de red,
-- desajuste de RLS), el reto queda HUÉRFANO: la RPC `submit_vote` hace JOIN con
-- `challenge_answers` y devuelve "Reto no encontrado" (ya pasó; lo arregló la 0011
-- con un backfill puntual).
--
-- Esta migración lo previene DE RAÍZ: un trigger escribe (o actualiza) la
-- respuesta en la MISMA transacción del INSERT/UPDATE del reto. Así la respuesta
-- existe siempre, sin depender de una segunda llamada del cliente.
--
-- El cliente sigue espejando la respuesta con UPSERT idempotente
-- (onConflict: challenge_id), así que NO choca con el trigger en ningún orden de
-- despliegue (deploy-safe): da igual quién escriba primero, el resultado es el mismo.

-- Función del trigger: refleja challenges.lat/lng en challenge_answers.
-- SECURITY DEFINER + search_path=public: corre con privilegios del dueño (se salta
-- la RLS de challenge_answers), igual de seguro que submit_vote — el INSERT/UPDATE
-- del reto ya pasó por su propia RLS (challenges_insert_member / _update_owner).
create or replace function public.sync_challenge_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.challenge_answers (challenge_id, lat, lng)
  values (new.id, new.lat, new.lng)
  on conflict (challenge_id) do update
    set lat = excluded.lat,
        lng = excluded.lng;
  return new;
end;
$$;

-- Se dispara al crear el reto y al cambiar su ubicación (lat/lng). No reacciona a
-- ediciones de título/duración/foto (no tocan la respuesta), para no escribir de más.
drop trigger if exists trg_sync_challenge_answer on public.challenges;

create trigger trg_sync_challenge_answer
  after insert or update of lat, lng on public.challenges
  for each row
  execute function public.sync_challenge_answer();
