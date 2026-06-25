-- 0014_push_subscriptions — suscripciones Web Push (PWA Fase 1)
-- Diseño (fuente de verdad): docs/estrategia/pwa-push.md §1.2.
--
-- Qué hace esta migración:
--   · crea public.push_subscriptions (una fila por dispositivo/navegador del usuario)
--   · RLS estricta: cada usuario gestiona EXCLUSIVAMENTE sus propias suscripciones
--
-- ADITIVA: tabla 100% nueva, no toca nada del esquema de juego. El cliente
-- (lib/push.ts) solo inserta/borra aquí cuando el usuario activa/desactiva avisos;
-- si no hay clave VAPID, el cliente no escribe nada y la tabla queda vacía.
--
-- El ENVÍO de push (Edge Function que lee estas filas con service_role saltándose
-- RLS) es la Fase 2 — NO entra en esta migración.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Tabla push_subscriptions
-- ════════════════════════════════════════════════════════════════════════════
-- Un usuario puede tener N suscripciones (una por dispositivo/navegador). El
-- endpoint es único por suscripción del push service (FCM/Apple/Mozilla); el
-- unique(endpoint) + upsert por endpoint evita duplicados al re-suscribir en el
-- mismo dispositivo. p256dh/auth son las claves de cifrado del payload que da el
-- navegador en pushManager.subscribe().toJSON().keys.
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. RLS — cada usuario gestiona SOLO las suyas
-- ════════════════════════════════════════════════════════════════════════════
-- El usuario inserta/lee/borra únicamente filas con user_id = auth.uid(). La Edge
-- Function de envío (Fase 2) NO usa estas policies: corre con service_role y se
-- salta RLS para leer las suscripciones de todos los miembros del grupo.
alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_self" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
create policy "push_subscriptions_insert_self" on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());
create policy "push_subscriptions_delete_self" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());
