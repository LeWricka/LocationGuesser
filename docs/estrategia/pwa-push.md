# PWA + Web Push — exploracion tecnica

**Fecha:** 24 junio 2026 · **Estado:** documento de exploracion (arquitectura, NO implementacion) · **Origen:** OP1/I1-I2 de [propuestas-mejoras.md §7](propuestas-mejoras.md) (ola 3) y aterrizaje del bucle asincrono.
**Frameworks:** Kernel de Rumelt (diagnostico → politica guia → acciones) · OST (Outcome → Oportunidad → Iniciativa) · priorizacion Impacto × Apetito (Shape Up).

> **Que resolvemos:** hoy el bucle asincrono **no se cierra solo**. Un reto se crea y se queda esperando a que alguien reenvie el enlace por WhatsApp a mano. Falta el latido "te toca jugar" / "Ana ha creado un reto" / "quedan 3h para que cierre". En los juegos por turnos que funcionan, esa notificacion ES el motor de re-enganche [[Words With Friends](https://en.wikipedia.org/wiki/Words_with_Friends)].
> **Que NO hacemos aqui:** esto es solo el plano. NO se toca `web/src/**` ni `supabase/**`. El codigo SQL/TS que aparece es **a alto nivel**, para dimensionar el trabajo y las colisiones, no para copiar-pegar.

---

## 0. Diagnostico (Rumelt) — por que PWA + Web Push y por que ahora no es trivial

1. **El canal de re-enganche hoy es manual y fragil.** WhatsApp funciona pero depende de que un humano reenvie el enlace. No hay forma de que la app, sola, traiga de vuelta al jugador cuando le toca.
2. **No hay infraestructura de notificacion.** No existe PWA, ni service worker, ni `manifest.webmanifest`, ni suscripcion push, ni claves VAPID, ni tabla de suscripciones, ni Edge Function de envio. Es construccion **desde cero** (lo cual, paradojicamente, es bueno para paralelizar: casi todo es fichero nuevo — ver §5).
3. **El gran condicionante es iOS.** Web Push en Safari iOS **solo funciona si el usuario instala la PWA** (iOS/iPadOS 16.4+). Sin instalacion, en iPhone no hay push posible por estandar web. Esto condiciona el alcance y obliga a una estrategia de instalacion (§3) y a mantener WhatsApp como fallback (§8).

**Politica guia:** *construir la capa de notificacion como una pieza desacoplada y aditiva — disparada por la BASE DE DATOS, no por el cliente — de modo que no toque el bucle de juego existente, degrade con elegancia donde no hay soporte (iOS sin instalar, permiso denegado), y conviva con WhatsApp-first en vez de sustituirlo de golpe.*

---

## 1. Arquitectura completa en ESTE stack

El stack real (verificado): React 19 + Vite 8 (`web/vite.config.ts` es minimo: solo `react()`), estatico en Vercel (Root = `web`), Supabase (Postgres + RLS + Realtime + Storage + Edge Functions Deno), auth passwordless magic link (`web/src/lib/auth.ts`), `user.id` = uuid que ya usan `created_by`/`user_id` en todo el esquema. Hay precedente de **Edge Function Deno** (`supabase/functions/resolve-maps-url`), de **RPC SECURITY DEFINER** (`submit_vote`, migracion 0010) y de **trigger** (`handle_new_user` en 0004). Reusamos esos patrones.

```
                        NAVEGADOR (PWA instalable)
   ┌──────────────────────────────────────────────────────────────┐
   │  manifest.webmanifest  ─ hace la app instalable               │
   │  service worker (sw.js) ─ recibe 'push', muestra notificacion │
   │  lib/push.ts (NUEVO) ─ pide permiso, pushManager.subscribe,   │
   │     guarda la suscripcion en Supabase (tabla push_subscriptions)│
   │  UI "activar avisos" (NUEVO) ─ en perfil/home                 │
   └───────────────┬──────────────────────────────┬───────────────┘
                   │ insert suscripcion (RLS self) │ recibe push (cifrado VAPID)
                   ▼                               ▲
   ┌──────────────────────────────────────────────┴───────────────┐
   │                         SUPABASE                              │
   │  tabla push_subscriptions (NUEVA) + RLS (cada user las suyas) │
   │  trigger AFTER INSERT on challenges ──▶ pg_net / webhook ──┐  │
   │  pg_cron (recordatorios de cierre) ───────────────────────┤  │
   │                                                           ▼  │
   │  Edge Function send-push (NUEVA, Deno + web-push/VAPID)       │
   │   · lee miembros del grupo y sus push_subscriptions          │
   │   · firma con VAPID (privada = secret de Supabase)           │
   │   · POST a cada endpoint push (FCM/Apple/Mozilla)            │
   └──────────────────────────────────────────────────────────────┘
```

### 1.1 PWA instalable — `manifest.webmanifest` + service worker

Dos piezas obligatorias para que el navegador ofrezca "Instalar" y para recibir push:

- **`manifest.webmanifest`**: `name`, `short_name`, `start_url` (`/`), `display: standalone`, `theme_color`, `background_color`, e **iconos** 192/512 px (incluido un `maskable` para Android). Se enlaza desde `web/index.html` con `<link rel="manifest" href="/manifest.webmanifest">`.
- **Service worker**: script que el navegador registra y que vive aunque la pestaña este cerrada. Es **obligatorio** para Web Push (el evento `push` se entrega al SW, no a la pagina). Tambien habilita instalabilidad y, opcionalmente, cache offline.

**Decision: `vite-plugin-pwa` vs SW a mano.**

| Criterio | `vite-plugin-pwa` (Workbox) | Service worker a mano |
|---|---|---|
| Manifest | Lo genera desde config + revisiona iconos | A mano en `public/` |
| Registro del SW | Automatico (`registerSW`) | A mano en `main.tsx` |
| Cache offline / precache | Workbox lo da hecho (revision hashing, cleanup) | Hay que escribirlo y mantenerlo |
| **Custom `push`/`notificationclick`** | Soporta `injectManifest` (SW propio + precache inyectado): **lo que necesitamos** | Control total, mas codigo |
| Impacto en build Vercel | **Plugin de Vite estandar**, build sigue 100% estatico; emite `sw.js` + manifest a `dist/`. Cero backend. | Igual de estatico, pero el precache/versionado es manual |
| Coste de mantenimiento | Bajo (Workbox absorbe los gotchas de SW) | Medio-alto (versionado de SW es delicado) |
| Riesgo | Una dep mas; tocar `vite.config.ts` (1 fichero) | Mas superficie propia de bugs de SW |

**Veredicto:** **`vite-plugin-pwa` en modo `injectManifest`**. Nos da manifest + registro + precache de Workbox (build sigue estatico en Vercel, sin backend), pero con **nuestro propio service worker** para manejar `push` y `notificationclick` (abrir el reto al tocar la notificacion). El SW a mano puro no aporta nada que justifique reescribir lo que Workbox ya resuelve, y el versionado manual de SW es una fuente clasica de bugs ("usuarios con SW viejo cacheado").

> **Impacto en el build estatico de Vercel:** ninguno problematico. `vite-plugin-pwa` corre en `vite build` y emite `sw.js`, `manifest.webmanifest` e iconos en `dist/`. Vercel sigue sirviendo estatico; **no** se introduce servidor. Unico cuidado: el SW debe servirse con scope raiz y sin cache agresiva (cabeceras de Vercel para `sw.js`: `Cache-Control: no-cache` para que el navegador detecte versiones nuevas).

### 1.2 Suscripcion Web Push — claves VAPID + flujo + tabla

**VAPID** (Voluntary Application Server Identification) es el par de claves que identifica a NUESTRO servidor ante los push services del navegador (FCM de Google, Apple, Mozilla). Se genera **una vez** (p.ej. `npx web-push generate-vapid-keys`).

- **Clave PUBLICA:** va al **cliente** como env `VITE_VAPID_PUBLIC_KEY` (es publica por diseno, como la publishable de Supabase o la de Maps). El cliente la pasa a `pushManager.subscribe`.
- **Clave PRIVADA:** **secret de Supabase** (`supabase secrets set VAPID_PRIVATE_KEY=...`), accesible **solo** desde la Edge Function de envio. **NUNCA** en git, en `web/`, ni en el cliente. Si se filtra: regenerar el par y re-suscribir a todos (las suscripciones viejas quedan invalidas).

**Flujo de suscripcion (cliente, en `lib/push.ts` nuevo):**

```ts
// alto nivel — NO implementar aqui
async function subscribeToPush(userId: string) {
  // 1. soporte + permiso (ver §4 para el "cuando")
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission // 'denied' | 'default'

  // 2. obtener el SW ya registrado por vite-plugin-pwa
  const reg = await navigator.serviceWorker.ready

  // 3. suscribir contra el push service del navegador con la VAPID publica
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true, // obligatorio: todo push muestra notificacion (no push silencioso)
    applicationServerKey: urlBase64ToUint8Array(VITE_VAPID_PUBLIC_KEY),
  })

  // 4. persistir la suscripcion en Supabase (RLS: solo la propia — ver tabla)
  //    sub.toJSON() = { endpoint, keys: { p256dh, auth } }
  await supabase.from('push_subscriptions').upsert({
    user_id: userId, // = auth.uid()
    endpoint: sub.endpoint,
    p256dh: sub.toJSON().keys.p256dh,
    auth: sub.toJSON().keys.auth,
    user_agent: navigator.userAgent, // para depurar/limpiar por dispositivo
  })
}
```

**Tabla nueva `push_subscriptions` (propuesta de esquema + RLS):**

```sql
-- migracion NUEVA (p.ej. 0012_push_subscriptions.sql) — alto nivel
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  endpoint    text not null unique,          -- el endpoint del push service (unico por dispositivo)
  p256dh      text not null,                 -- clave publica del cliente (cifrado del payload)
  auth        text not null,                 -- secreto de autenticacion del cliente
  user_agent  text,                          -- diagnostico / limpieza por dispositivo
  created_at  timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- RLS: cada usuario gestiona EXCLUSIVAMENTE sus propias suscripciones.
-- (La Edge Function de envio NO usa estas policies: corre con service_role
--  y se salta RLS para poder leer las suscripciones de TODOS los miembros del grupo.)
create policy "push_subscriptions_select_self" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
create policy "push_subscriptions_insert_self" on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());
create policy "push_subscriptions_update_self" on public.push_subscriptions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "push_subscriptions_delete_self" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());
```

> **Por que `endpoint unique` y `upsert`:** un mismo usuario puede tener varios dispositivos (cada uno con su endpoint). El `unique(endpoint)` evita duplicados si re-suscribe en el mismo dispositivo; el `upsert` por endpoint refresca claves sin crear basura. Un usuario = N filas (una por dispositivo/navegador).

### 1.3 Envio — Edge Function (Deno) con VAPID + como se DISPARA

**Edge Function nueva `send-push`** (patron identico a `resolve-maps-url`: `Deno.serve`, sin estado). Recibe "manda push del reto X" o "recuerda el cierre del reto X", resuelve los destinatarios y firma los push.

```ts
// supabase/functions/send-push/index.ts — alto nivel, NO implementar
import webpush from 'npm:web-push' // libreria estandar de Web Push para Deno/Node

webpush.setVapidDetails(
  'mailto:Iker@540deg.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!, // SECRET — solo aqui
)

Deno.serve(async (req) => {
  // Cliente con service_role (secret): se salta RLS para leer suscripciones de
  // TODOS los miembros del grupo. NO exponer service_role al cliente jamas.
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { challenge_id, kind } = await req.json() // kind: 'created' | 'closing'

  // 1. reto -> grupo -> miembros (excepto el creador en 'created')
  // 2. miembros -> push_subscriptions (1..N por miembro)
  // 3. construir payload SIN spoiler (titulo del reto, no la ubicacion)
  const payload = JSON.stringify({
    title: kind === 'created' ? 'Nuevo reto en tu grupo' : 'Un reto esta por cerrar',
    body: '...', // "Ana te reta en Interrail '26" / "Quedan 3h para el reto de Ana"
    url: `/#g=${groupCode}&c=${challengeId}`, // deep-link al reto (notificationclick lo abre)
  })

  // 4. enviar a cada endpoint; 404/410 => suscripcion muerta => borrarla
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(toPushSub(sub), payload)
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await admin
        .from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    }
  }
  return new Response(null, { status: 204 })
})
```

**Como se DISPARA (clave del desacople — esto es lo que evita tocar `features/create`):**

- **Al crear un reto → trigger/webhook de BD, NO el cliente.** Un `AFTER INSERT` sobre `public.challenges` dispara el envio. Asi el cliente (`lib/challenges.ts` / `features/create/CreateChallenge.tsx`) **no cambia ni una linea**: crea el reto como hoy y la BD se encarga del aviso. Dos formas de cablearlo:
  - **Database Webhook de Supabase** (recomendado): en el dashboard, un webhook `AFTER INSERT on challenges` que hace `POST` a la Edge Function `send-push` con `{ challenge_id, kind: 'created' }`. Es config, no codigo de cliente.
  - **Trigger SQL + `pg_net`**: `create trigger ... after insert on challenges` que llama una funcion que hace `net.http_post(...)` a la Edge Function. Mismo efecto, todo en SQL.

  ```sql
  -- variante trigger + pg_net (alto nivel)
  create or replace function public.notify_challenge_created()
  returns trigger language plpgsql security definer set search_path = public as $$
  begin
    perform net.http_post(
      url     := 'https://ykquigyjvgxisgdxryxr.functions.supabase.co/send-push',
      headers := jsonb_build_object('Content-Type','application/json',
                   'Authorization','Bearer '||current_setting('app.push_fn_token', true)),
      body    := jsonb_build_object('challenge_id', new.id, 'kind', 'created')
    );
    return new;
  end; $$;
  create trigger on_challenge_created
    after insert on public.challenges
    for each row execute function public.notify_challenge_created();
  ```

- **Recordatorios de cierre → `pg_cron`.** Un job periodico (p.ej. cada 15 min) busca retos que cierran pronto y a los que aun les faltan votantes, y llama a `send-push` con `kind: 'closing'`. No depende del cliente ni de que nadie tenga la app abierta.

  ```sql
  -- pg_cron (alto nivel): cada 15 min, retos que cierran en ~3h y aun sin avisar
  select cron.schedule('push-closing', '*/15 * * * *', $$
    select net.http_post(
      url  := 'https://ykquigyjvgxisgdxryxr.functions.supabase.co/send-push',
      body := jsonb_build_object('challenge_id', c.id, 'kind', 'closing'))
    from public.challenges c
    where c.deadline_at between now() + interval '2h45m' and now() + interval '3h15m'
      and not c.closing_notified  -- flag para no repetir (columna nueva)
  $$);
  ```

  > Para no repetir el aviso de cierre, anadir una columna/flag (`closing_notified boolean` o una tabla `push_log`) que la Edge Function marque tras enviar. Detalle de implementacion, no de arquitectura.

**Deploy** (igual que `resolve-maps-url`, ver [operativa.md §4](../operativa.md)):
```bash
npx supabase functions deploy send-push --project-ref ykquigyjvgxisgdxryxr
supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=...
# SUPABASE_SERVICE_ROLE_KEY ya esta disponible para las functions del proyecto
```
A diferencia de `resolve-maps-url` (`--no-verify-jwt` porque la llama el front), `send-push` la llama **solo la BD** (webhook/cron), asi que se protege con un token compartido en la cabecera (no es endpoint publico para usuarios).

---

## 2. El gran condicionante iOS

**Hecho de plataforma:** en iPhone/iPad, **Web Push solo funciona si el usuario ha INSTALADO la PWA en la pantalla de inicio** ("Anadir a pantalla de inicio"), y requiere **iOS/iPadOS 16.4 o superior** (marzo 2023). En Safari de iOS sin instalar, `Notification.requestPermission()` / `PushManager` **no estan disponibles**: no hay push posible por el estandar web. Ademas, en iOS solo se puede instalar **desde Safari** (no desde Chrome/Firefox iOS, que son cascarones de WebKit).

**Impacto en alcance:** el publico objetivo (grupo de viaje de WhatsApp) tiene **mucho iPhone**. Sin instalacion previa, ese segmento **no recibe push**. Es la diferencia entre "push para todos" y "push para los que instalaron". Por eso el push **no puede ser el unico canal**: WhatsApp sigue siendo la red de seguridad (§8).

**Mitigaciones:**
1. **Prompt de instalacion contextual** (§4): tras un momento de valor (acaba de jugar/revelar un reto), invitar a "Anadir a pantalla de inicio para que te avisemos cuando te toque". En iOS hay que **explicar el gesto manual** (Compartir → Anadir a pantalla de inicio) porque iOS **no** dispara el evento `beforeinstallprompt` (eso es solo Android/desktop Chromium).
2. **Deteccion de plataforma y estado:** distinguir (a) iOS sin instalar → mostrar instrucciones de instalacion; (b) iOS instalada (standalone) → ofrecer activar avisos; (c) no-iOS → flujo normal. `window.navigator.standalone` / `display-mode: standalone` detectan si ya esta instalada.
3. **Fallback a WhatsApp-first** (§8): mientras el usuario no tenga push (iOS sin instalar, permiso denegado, navegador sin soporte), el aviso "te toca jugar" sigue siendo el **mensaje compartible de WhatsApp** que ya esta en el roadmap (I1 barato). Push y WhatsApp **conviven**; push es la mejora progresiva.

**Android / desktop (mejor soporte):**
- **Android Chrome:** soporte completo. Dispara `beforeinstallprompt` → se puede ofrecer un **boton de instalacion in-app** real. Push funciona incluso sin instalar (con SW registrado), aunque instalar mejora la experiencia.
- **Desktop (Chrome/Edge/Firefox):** Web Push funciona sin instalar. Instalable como app de escritorio. Safari macOS soporta Web Push (16+) tambien.
- **Conclusion:** en Android/desktop el push es viable "de serie"; el cuello de botella real es iOS. La arquitectura es la misma; cambia solo el **prompt de activacion** por plataforma.

---

## 3. UX de permisos — no quemar el permiso

El permiso de notificaciones del navegador se pide **una vez**: si el usuario lo **deniega**, no se puede volver a pedir por API (tiene que ir a ajustes del navegador a mano). Por eso **nunca** se pide en frio al cargar la app.

**Patron recomendado (pre-prompt / "permission priming"):**
1. **No pedir al entrar.** Pedirlo en frio es el clasico error que quema el permiso.
2. **Pedirlo tras un momento de valor:** justo despues de que el usuario **revele un resultado** o **cree su primer reto** — cuando ya entendio el bucle y el aviso tiene sentido ("para que no te pierdas el proximo reto de tu grupo, activa los avisos").
3. **Pre-prompt propio primero:** mostrar una tarjeta/UI **nuestra** ("¿Te avisamos cuando te toque jugar?") con un boton. Solo si el usuario pulsa "Si", llamar a `Notification.requestPermission()`. Asi el prompt nativo (irreversible) solo aparece para quien ya dijo que si → casi nunca se deniega.
4. **Respetar el "no".** Si declina nuestro pre-prompt, no insistir; reintentar como mucho tras otro momento de valor, con tope.

**Estados a contemplar en la UI (`lib/push.ts` + UI de perfil/home):**

| Estado | Como se detecta | Que mostrar |
|---|---|---|
| **No soportado** | sin `PushManager`/`serviceWorker`, o iOS Safari sin instalar | iOS: instrucciones de "Anadir a pantalla de inicio". Otros: nada o "tu navegador no soporta avisos". Fallback WhatsApp. |
| **Permiso `default`** (aun no pedido) | `Notification.permission === 'default'` | Pre-prompt: "Activar avisos". |
| **Permiso `granted`** + suscrito | permiso + fila en `push_subscriptions` | "Avisos activados" + opcion de desactivar (borra la suscripcion). |
| **Permiso `granted`** sin suscripcion | permiso pero sin fila (p.ej. dispositivo nuevo) | Re-suscribir silenciosamente. |
| **Permiso `denied`** | `Notification.permission === 'denied'` | "Has bloqueado los avisos. Actívalos en los ajustes del navegador." (no se puede re-pedir por API). |

**Donde vive el control:** un toggle "Avisos del grupo" en **perfil** y/o un CTA contextual en **home** ("Activa los avisos para no perderte los retos"). Ambos son **UI nueva**, sin colision con lo existente.

---

## 4. ¿Se puede hacer EN PARALELO con el resto del trabajo?

**Analisis de colisiones de ficheros** (areas del playbook [.claude/rules/always.md §1](../../.claude/rules/always.md)):

| Pieza | Fichero | Nuevo / Toca existente | Colision con otro trabajo |
|---|---|---|---|
| Manifest | `web/public/manifest.webmanifest` + iconos | **100% NUEVO** | Ninguna |
| Service worker | `web/src/sw.ts` (injectManifest) | **100% NUEVO** | Ninguna |
| Lib de suscripcion | `web/src/lib/push.ts` (+ test) | **100% NUEVO** | Ninguna (area `lib/`) |
| Tabla + RLS | `supabase/migrations/0012_push_subscriptions.sql` | **100% NUEVO** | Ninguna (numero de migracion nuevo) |
| Edge Function | `supabase/functions/send-push/**` | **100% NUEVO** | Ninguna (carpeta nueva, no toca `resolve-maps-url`) |
| Trigger / webhook / cron | migracion nueva + config dashboard | **100% NUEVO** | Ninguna (no toca el insert del cliente) |
| UI "activar avisos" | componente nuevo en perfil/home | **NUEVO** (+ un punto de montaje) | Bajo: anadir un bloque en perfil/home; coordinar si otro agente reescribe esas pantallas a la vez |
| **Config de build** | `web/vite.config.ts` | **TOCA EXISTENTE** (anadir plugin) | **Punto unico de colision.** Hoy es `plugins: [react()]`; pasa a `[react(), VitePWA({...})]` |
| Enlace manifest + registro | `web/index.html` (1 linea `<link rel=manifest>`) | TOCA EXISTENTE (trivial) | Bajisima |
| Env | `web/.env.example` (+ Vercel) | TOCA EXISTENTE (anadir `VITE_VAPID_PUBLIC_KEY`) | Bajisima |

**Por que disparar por TRIGGER DE BD evita tocar `features/create`:** el camino obvio e ingenuo seria "al crear el reto, el cliente tambien llama a la Edge Function". Eso **obligaria a editar** `features/create/CreateChallenge.tsx` y/o `lib/challenges.ts` (`createChallenge`) — precisamente el codigo que otro agente podria estar tocando (editar reto, modos de juego, etc.) y que es **critico** (el bucle de creacion). Al disparar desde un **`AFTER INSERT on challenges`** (webhook o trigger+pg_net), el aviso es una **consecuencia de la fila insertada**, no una accion del cliente: `features/create` y `lib/challenges.ts` **quedan intactos**. Esto es lo que convierte la feature en casi-100%-aditiva.

**Veredicto: SI, paralelizable.** Es de las features mas paralelizables del roadmap porque ~90% es fichero nuevo en areas que no se pisan (`lib/`, `supabase/migrations/`, `supabase/functions/`, `public/`). **Cuidados:**
1. **`vite.config.ts` es el unico fichero de codigo compartido que se toca** — coordinar con cualquier agente que toque config de build (raro). Es una adicion de plugin, no un refactor: conflicto de merge trivial si lo hubiera.
2. **UI de "activar avisos"**: si otro agente reescribe perfil/home en paralelo, acordar el punto de montaje (o montarlo despues). El componente en si es aislado.
3. **Generacion de claves VAPID** (operativa) es prerequisito del envio, no del cliente: la Fase 1 (instalable + suscripcion) puede empezar **sin** la privada.
4. **No tocar `resolve-maps-url`** ni el `submit_vote`/RLS de 0010 — la Edge Function y la migracion nuevas son independientes.

---

## 5. Plan por fases (Shape Up — impacto × apetito)

Apetito en escala Shape Up (XS≈dias, S≈≤1 sem, M≈1–2 sem). Cada fase entrega valor por si sola y desbloquea la siguiente.

### Fase 1 — Instalable + suscripcion (sin enviar nada todavia)
**Que:** `vite-plugin-pwa` (injectManifest), `manifest.webmanifest` + iconos, service worker propio, `lib/push.ts` (permiso + `pushManager.subscribe` + persistir), tabla `push_subscriptions` + RLS, UI de "activar avisos" con todos los estados (§3). Generar el par VAPID (publica al cliente).
**Resultado:** la app se instala y un usuario puede activar avisos y queda suscrito en BD. **Aun no llega ningun push** (no hay emisor) — pero es verificable (hay fila en `push_subscriptions`).
**Impacto:** medio (habilitador). **Apetito: M.** **Dependencias:** ninguna (arranca ya, en paralelo).

### Fase 2 — Envio + webhook al crear reto ("Ana ha creado un reto")
**Que:** Edge Function `send-push` (VAPID privada como secret, `web-push`, service_role para leer miembros), webhook/trigger `AFTER INSERT on challenges`, manejo de `notificationclick` en el SW (abrir el deep-link al reto), limpieza de suscripciones muertas (404/410).
**Resultado:** crear un reto avisa por push a los miembros del grupo (los que tengan push activo). **El bucle empieza a cerrarse solo.**
**Impacto:** **alto** (es el latido "te toca jugar"). **Apetito: M.** **Dependencias:** Fase 1 (necesita suscripciones) + claves VAPID.

### Fase 3 — Recordatorios de cierre con `pg_cron` ("quedan 3h")
**Que:** job `pg_cron` periodico que detecta retos por cerrar con votantes pendientes y llama a `send-push` con `kind: 'closing'`; flag anti-repeticion (`closing_notified` o `push_log`).
**Resultado:** los rezagados reciben "quedan 3h para el reto de Ana". Cierra el bucle tambien para quien no abrio el primer aviso.
**Impacto:** medio-alto. **Apetito: S.** **Dependencias:** Fase 2 (reusa la Edge Function y el payload).

### Fase 4 — Empuje de instalacion iOS
**Que:** prompt de instalacion contextual por plataforma (instrucciones manuales en iOS, `beforeinstallprompt` en Android/desktop), deteccion standalone/iOS, medicion del % que instala y activa.
**Resultado:** crece el alcance del push en el segmento iPhone (el mas grande del publico objetivo).
**Impacto:** medio (multiplica el alcance de lo construido en 1–3). **Apetito: S.** **Dependencias:** Fase 1 (instalable). Se puede solapar con Fase 3.

**Camino critico:** Fase 1 → Fase 2 (las dos M, el grueso). Fases 3 y 4 (S) son incrementales y solapables. Total realista: **~3–4 semanas** de un agente dedicado, o menos repartido.

---

## 6. Operativa / coste / seguridad

**Secrets y config (ver [operativa.md](../operativa.md) y [always.md §6/§7](../../.claude/rules/always.md)):**
- **VAPID privada** → `supabase secrets set VAPID_PRIVATE_KEY=...`. **Nunca** en git ni en `web/`. Si se filtra: regenerar par y forzar re-suscripcion (las viejas dejan de validar).
- **VAPID publica** → env del front `VITE_VAPID_PUBLIC_KEY` en `web/.env.local`, `web/.env.example` y **Vercel** (Production + Preview). Publica por diseno.
- **`SUPABASE_SERVICE_ROLE_KEY`** → ya disponible para las Edge Functions del proyecto; la usa `send-push` para leer suscripciones de todos los miembros (se salta RLS). **Jamas** al cliente.
- **Token del webhook/cron** → secret compartido para que solo la BD pueda invocar `send-push` (no es endpoint publico de usuario, a diferencia de `resolve-maps-url`).
- **En Supabase:** habilitar extensiones `pg_cron` y `pg_net` (o usar Database Webhooks del dashboard). Crear el webhook `AFTER INSERT on challenges`.
- **En Vercel:** anadir `VITE_VAPID_PUBLIC_KEY` y redeploy. Cabecera `Cache-Control: no-cache` para `sw.js`.

**Coste:** Web Push es **gratis** (los push services de Google/Apple/Mozilla no cobran por volumen de notificaciones de un grupo de amigos). `pg_cron`/`pg_net`/Edge Functions estan en el plan de Supabase ya en uso. **Coste marginal ~0** para la escala objetivo. No anade dependencia de proveedor de pago (a diferencia de un FCM gestionado o un OneSignal).

**Privacidad:** `push_subscriptions` contiene el endpoint del dispositivo y claves de cifrado del cliente — datos personales ligeros. RLS estricta (solo el propio usuario los ve/gestiona). El payload del push **no debe llevar la respuesta del reto** (lat/lng) — coherente con 0010, que justo cerro la fuga de la respuesta. Notificacion = "hay reto" / "cierra pronto", nunca el spoiler.

**Limites / robustez:** manejar `404/410` (suscripcion muerta) borrando la fila; reintentos con tope; no bloquear el insert del reto si el push falla (el envio es asincrono, post-commit). Respetar `userVisibleOnly: true` (obligatorio: nada de push silencioso).

---

## 7. Comparativa honesta — WhatsApp-first vs Web Push

| Dimension | **WhatsApp-first** (I1 barato, casi montado) | **Web Push** (PWA + VAPID) |
|---|---|---|
| Coste de construir | **XS** — un mensaje compartible con preview al crear reto | **M+M+S+S** — toda la pila de §5 |
| Alcance | **Universal** — todos tienen WhatsApp; cero fricción de soporte | **Parcial** — Android/desktop bien; **iOS solo si instalan** la PWA |
| Cierra el bucle solo | **No** — depende de que un humano reenvie | **Si** — la app avisa sola (creado + cierre), sin intervencion |
| Recordatorio de cierre ("3h") | Manual / improbable | **Automatico** (pg_cron) — su mejor baza |
| Fricción para el receptor | Cero (ya esta en el chat) | Pedir permiso + (iOS) instalar |
| Mantenimiento | Minimo | SW, VAPID, suscripciones muertas, plataformas |
| Riesgo | Bajisimo | Medio (SW/iOS/permisos) |

**Cuando merece la pena el salto a Web Push:**
- WhatsApp-first es la **ola 1** (barato, ya en el roadmap I1): hazlo **ya** y mide. Es el suelo, no compite con push — **conviven**.
- El salto a Web Push (ola 3) se justifica cuando: (a) el **WhatsApp-first ya valido** que el aviso "te toca" mueve el re-enganche (hay senal de que las notificaciones importan), y (b) la **retencion base esta validada** (el grupo repite) y el cuello de botella pasa a ser "la gente no vuelve sola, depende del chat". El **recordatorio de cierre automatico** (pg_cron) y el "la app avisa sola sin que nadie reenvie" son lo que WhatsApp **no puede** dar — esa es la razon real para invertir.
- **No** saltar antes de validar el bucle (premisa del proyecto: lo simple primero, validar y luego invertir). Construir toda la pila de push para un grupo que aun no repite es sobre-ingenieria.

**Recomendacion:** WhatsApp-first ahora (ola 1); Web Push como **mejora progresiva** en ola 3, empezando por Fases 1–2 (creado) y anadiendo cierre (Fase 3) y empuje iOS (Fase 4). Push **nunca sustituye** a WhatsApp en iOS-sin-instalar: es aditivo.

---

### Fuentes

- **Notificaciones "tu turno" (asincrono):** [Words With Friends — Wikipedia](https://en.wikipedia.org/wiki/Words_with_Friends) · [Draw Something — Wikipedia](https://en.wikipedia.org/wiki/Draw_Something)
- **Web Push / Service Workers / PWA (estandar):** [MDN — Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API) · [MDN — Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) · [web.dev — Web Push](https://web.dev/articles/push-notifications-overview)
- **iOS 16.4+ Web Push (requiere instalar la PWA):** [WebKit — Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- **VAPID:** [RFC 8292 — VAPID for Web Push](https://datatracker.ietf.org/doc/html/rfc8292)
- **vite-plugin-pwa:** [vite-plugin-pwa docs](https://vite-pwa-org.netlify.app/)
- **Supabase (Edge Functions / Webhooks / pg_cron / pg_net):** [Edge Functions](https://supabase.com/docs/guides/functions) · [Database Webhooks](https://supabase.com/docs/guides/database/webhooks) · [pg_cron](https://supabase.com/docs/guides/database/extensions/pg_cron) · [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net)
- **Internas:** [propuestas-mejoras.md §7](propuestas-mejoras.md) · [operativa.md](../operativa.md) · [always.md](../../.claude/rules/always.md) · [0004_cuentas_membresia.sql](../../supabase/migrations/0004_cuentas_membresia.sql) · [0010_scoring_servidor.sql](../../supabase/migrations/0010_scoring_servidor.sql) · [resolve-maps-url/index.ts](../../supabase/functions/resolve-maps-url/index.ts) · [auth.ts](../../web/src/lib/auth.ts)
</content>
