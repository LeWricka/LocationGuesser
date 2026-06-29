# Operativa — runbook

Runbook conciso de operativa de LocationGuesser: seguridad de la API key de Google Maps, alerta de presupuesto, variables de entorno y despliegue de Edge Functions. Issue [#80](https://github.com/LeWricka/LocationGuesser/issues/80).

---

## 1. Restricción de la API key de Google Maps

La key del front es **pública** (viaja en el cliente). La defensa NO es ocultarla, sino **restringirla** para que solo funcione desde nuestros orígenes y solo para la API que usamos.

En **Google Cloud Console → APIs y servicios → Credenciales → [la API key]**:

### Restricción de aplicación: referrers HTTP
Marcar **"Sitios web (Referentes HTTP)"** y permitir exactamente estos referrers:

```
https://locationguesser-sage.vercel.app/*
https://*.vercel.app/*
http://localhost:5173/*
```

- `locationguesser-sage.vercel.app/*` → producción.
- `*.vercel.app/*` → deploys de preview de Vercel (cada PR genera una URL distinta).
- `localhost:5173/*` → dev local (puerto por defecto de Vite).

### Restricción de API
Marcar **"Restringir clave"** y dejar **únicamente**:

- **Maps JavaScript API**

(El des-acortador de URLs de Street View vive en la Edge Function `resolve-maps-url`, que no usa esta key del cliente; mantener la lista mínima reduce el daño si la key se filtra.)

### Cómo verificar que rechaza orígenes no autorizados

La restricción por referrer se evalúa **en el navegador, al cargar el SDK**, no en una petición HTTP simple. Por eso:

**Verificación con `curl` (no concluyente, esperado):** una petición sin `Origin`/`Referer` de navegador real devuelve **HTTP 200** con el JS del loader, aunque el referrer no esté permitido:

```bash
curl -s -i -H "Referer: https://atacante-no-permitido.example.com/" \
  "https://maps.googleapis.com/maps/api/js?key=AIzaSyCeGZNkD6sR--RC6N9RkqfMQz6JtbxtMZc" | head
```

Resultado observado (2026-06-20): `HTTP/2 200`, `content-type: text/javascript`, y el cuerpo del loader de Maps. **No devuelve `RefererNotAllowedMapError` por curl** porque ese error lo lanza el propio SDK al inicializar el mapa dentro de la página, comparando el `origin` real del documento contra la lista de referrers. `curl` no es un origen de navegador, así que el chequeo no se dispara aquí. Conclusión: **curl no sirve para validar la restricción de referrer**.

**Verificación manual (concluyente):**

1. Servir/abrir la app desde un **origen no listado** (p.ej. `http://localhost:3000`, otro puerto, o un dominio distinto).
2. Abrir la consola del navegador.
3. Al intentar cargar el mapa, Google muestra: **`RefererNotAllowedMapError`** y el mapa no se renderiza.
4. Repetir desde un origen **sí** permitido (`http://localhost:5173` o producción) → el mapa carga sin error.

Si en un origen permitido aparece `RefererNotAllowedMapError`, falta añadir ese referrer a la lista (recordar que los cambios de la consola tardan unos minutos en propagarse).

---

## 2. Alerta de presupuesto en Google Cloud

Defensa contra picos de coste (la key es pública). Crear un **budget con alerta por email**:

1. Google Cloud Console → **Facturación → Presupuestos y alertas** (Billing → Budgets & alerts).
2. **Crear presupuesto**, asociado a la cuenta de facturación del proyecto.
3. Importe: **5 €** (importe objetivo mensual; es un umbral de alerta, no un corte de servicio).
4. Umbrales de alerta por defecto (50 % / 90 % / 100 %); enviar **notificación por email** a los administradores de facturación / el correo del proyecto.
5. Guardar.

> **Tramo gratis de Street View:** ~**5.000 cargas/mes** sin coste. Con un grupo de amigos vamos muy por debajo; el budget de 5 € es una red de seguridad ante abuso/bucles, no un límite operativo esperado.

El budget **avisa** pero **no corta** el gasto. Para corte duro habría que automatizar el bloqueo (deshabilitar facturación vía función) — fuera del alcance hoy.

---

## 3. Variables de entorno

Variables públicas del front (van en el bundle), mismas en los tres entornos:

| Variable | Qué es | Origen |
|----------|--------|--------|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase | `https://ykquigyjvgxisgdxryxr.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key de Supabase (pública, va en el cliente) | Dashboard Supabase → API |
| `VITE_GOOGLE_MAPS_API_KEY` | API key de Google Maps (pública, restringida — ver §1) | Google Cloud → Credenciales |
| `VITE_VAPID_PUBLIC_KEY` | Clave VAPID **pública** de Web Push (pública por diseño — ver §6). **Opcional**: sin ella los avisos quedan desactivados y la app va igual. | `npx web-push generate-vapid-keys` |

### En Vercel
**Project → Settings → Environment Variables.** Definir en **Production** y **Preview** (y, si se usa, Development). Tras cambiarlas, **redeploy** para que apliquen.

### En local
En `web/.env.local` (gitignoreado; plantilla en `web/.env.example`):

```
VITE_SUPABASE_URL=https://ykquigyjvgxisgdxryxr.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key>
VITE_GOOGLE_MAPS_API_KEY=<maps key>
VITE_VAPID_PUBLIC_KEY=<clave VAPID pública>   # opcional (Web Push, §6)
```

> ⚠️ **`VITE_SUPABASE_URL` debe ser EXACTA.** Un valor corrupto (espacio, salto de línea, URL mal copiada) **rompió producción** una vez: el cliente apunta a una URL inválida y todas las llamadas fallan. Copiar/pegar con cuidado y sin espacios al final.

---

## 4. Despliegue de Edge Functions

Edge Functions en `supabase/functions/`. Desplegar el des-acortador de URLs de Maps:

```bash
npx supabase functions deploy resolve-maps-url \
  --project-ref ykquigyjvgxisgdxryxr \
  --no-verify-jwt
```

- `--project-ref ykquigyjvgxisgdxryxr` → proyecto Supabase de LocationGuesser.
- `--no-verify-jwt` → la función se invoca sin sesión de usuario (no requiere JWT).

Requiere estar logueado en el CLI (`npx supabase login`).

### Edge Function `send-push` (Web Push)

La función de envío de notificaciones (Fase 2 de PWA + Web Push). A diferencia de
`resolve-maps-url`, **NO** se despliega con `--no-verify-jwt`: no la llama el front
anónimo, solo la BD (webhook/trigger), y se protege además con un token compartido.

```bash
npx supabase functions deploy send-push --project-ref ykquigyjvgxisgdxryxr
```

Sus secrets y el disparo desde la BD se detallan en §6.

---

## 5. Web Push (PWA) — claves VAPID, secrets y disparo

Notificaciones push de la PWA ("nuevo reto en tu viaje", "un reto está por cerrar").
Diseño completo: [docs/estrategia/pwa-push.md](estrategia/pwa-push.md). Piezas:
cliente (`web/src/lib/push.ts` + service worker `web/src/sw.ts`), tabla
`push_subscriptions` (migración `0014`) y Edge Function `send-push`.

> **La app NO se rompe si esto no está configurado.** Sin `VITE_VAPID_PUBLIC_KEY`, el
> control de avisos del perfil informa "los avisos aún no están disponibles" y no
> ofrece activarlos; el resto de la app funciona igual. El envío solo ocurre cuando
> están los secrets **y** el disparo desde la BD.

### 6.1 Generar el par de claves VAPID (una sola vez)

```bash
npx web-push generate-vapid-keys
```

Devuelve una **Public Key** y una **Private Key** (base64url). Es un par único; si se
regenera, las suscripciones existentes dejan de validar y hay que re-suscribir a todos.

### 6.2 Dónde va cada clave

| Clave / secret | Pública/secreta | Dónde se pone |
|----------------|-----------------|---------------|
| `VITE_VAPID_PUBLIC_KEY` (= Public Key) | **Pública** (va en el bundle) | `web/.env.local` + **Vercel** (Production + Preview). Redeploy tras añadirla. |
| `VAPID_PUBLIC_KEY` (la misma Public Key) | Pública | **Secret de Supabase** (la function la necesita para firmar). |
| `VAPID_PRIVATE_KEY` (= Private Key) | **SECRETA** | **Secret de Supabase**. NUNCA en git, en `web/`, ni en el cliente. |
| `VAPID_SUBJECT` | — | **Secret de Supabase**. `mailto:` de contacto (p.ej. `mailto:icka69@gmail.com`). Opcional (hay default). |
| `PUSH_SEND_TOKEN` | **SECRETO** | **Secret de Supabase** + GUC de la BD (§6.4). Token aleatorio largo que solo conoce la BD; protege la función. |

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya están disponibles para las Edge
Functions del proyecto (no hay que setearlas). El `service_role` lo usa `send-push`
para leer las suscripciones de todos los miembros (se salta RLS); **jamás** al cliente.

### 6.3 Poner los secrets en Supabase

```bash
npx supabase secrets set \
  VAPID_PUBLIC_KEY=<Public Key> \
  VAPID_PRIVATE_KEY=<Private Key> \
  VAPID_SUBJECT=mailto:icka69@gmail.com \
  PUSH_SEND_TOKEN=<token aleatorio largo> \
  --project-ref ykquigyjvgxisgdxryxr
```

### 6.4 Disparar el envío al crear un reto

El aviso "nuevo reto" lo dispara la **BD**, no el cliente (así `features/create` y
`lib/challenges.ts` no cambian — ver pwa-push.md §1.3/§4). Dos formas equivalentes,
**usa solo una** (si no, doble aviso):

**Opción A — trigger SQL + `pg_net` (migración `0025_notify_challenge_created.sql`).**
La migración crea el trigger; falta darle la URL de la función y el token vía GUC:

```sql
alter database postgres set app.push_fn_url     = 'https://ykquigyjvgxisgdxryxr.functions.supabase.co/send-push';
alter database postgres set app.push_send_token = '<el mismo PUSH_SEND_TOKEN>';
```

Mientras esos GUC no estén, el trigger es **no-op**: el reto se crea igual, no se
envía nada (y nunca bloquea el INSERT — el envío es best-effort).

**Opción B — Database Webhook del dashboard.** Database → Webhooks → `AFTER INSERT on
challenges` → POST a `…/functions/v1/send-push` con cabecera `X-Push-Token: <token>` y
body `{ "challenge_id": "{{ record.id }}", "kind": "created" }`. Si usas el webhook,
**no** apliques el trigger de la opción A (o bórralo) para no duplicar.

> **Recordatorios de cierre ("quedan 3h"):** Fase 3 — un job `pg_cron` que llama a
> `send-push` con `kind: 'closing'`. Aún **no cableado**; la función ya lo soporta.

### 6.5 Cabecera del service worker en Vercel

El SW (`sw.js` en `dist/`) debe servirse sin caché agresiva para que el navegador
detecte versiones nuevas: cabecera `Cache-Control: no-cache` para `/sw.js` (Vercel
project settings / `vercel.json` headers).

### 6.6 iOS

En iPhone/iPad, Web Push **solo funciona si el usuario instala la PWA** (Añadir a
pantalla de inicio, desde Safari, iOS 16.4+). Sin instalar, el navegador no expone las
APIs y el control de avisos no aparece. WhatsApp sigue siendo el canal de respaldo.

---

## 6. Migraciones automáticas

El pipeline aplica las migraciones de Supabase con `supabase db push` en cada
push a `main`. El deploy del front lo sigue haciendo Vercel por su auto-deploy de
git. El orden Vercel-vs-migración no importa gracias a la **regla de 2 fases**
(migración aditiva primero, front que la usa después; el front nunca selecciona
una columna que aún no existe). Guía de puesta en marcha — secrets de Supabase,
regla de 2 fases y reconciliación única del historial:

➡️ **[docs/migraciones-automaticas.md](migraciones-automaticas.md)**

Workflow: [`.github/workflows/db-migrate.yml`](../.github/workflows/db-migrate.yml).

---

## Email transaccional (magic link de login)

El login es **passwordless por magic link**: Supabase Auth manda el email. El
email integrado de Supabase está limitado (~2/hora) → se usa **SMTP propio**.

- **Proveedor:** **Gmail SMTP** (`smtp.gmail.com:587`), remitente `icka69@gmail.com`
  (nombre "LocationGuesser"). Se eligió Gmail porque Google ya firma `@gmail.com`
  (SPF/DKIM) → no cae en spam SIN tocar DNS. Se descartó Brevo desde `@540deg.com`
  porque autenticar ese dominio exige acceso al DNS (IONOS), que no tenemos → caía en spam.
  Password = **contraseña de aplicación** de Google (2FA), no la del correo.
- **Dónde vive la config:** Supabase → Authentication → SMTP Settings (o vía
  Management API `PATCH /v1/projects/<ref>/config/auth`). Campos: `smtp_host`,
  `smtp_port`, `smtp_user`, `smtp_pass`, `smtp_admin_email` (remitente),
  `smtp_sender_name`. `rate_limit_email_sent` subido (el GET de la API **oculta**
  los campos `smtp_*` por seguridad; el PATCH sí los refleja).
- **Secretos:** la SMTP key y la API key de Brevo viven **solo en la config de
  Supabase (cifradas)**. NUNCA en git ni en `web/`. Si se filtran, regenerar en
  Brevo (SMTP & API) y re-aplicar el `PATCH` en Supabase.
- **Gotchas resueltos:** (1) Brevo restringe por **IP autorizada** por defecto →
  hay que **desactivar la restricción** (Supabase envía desde IPs variables).
  (2) La key SMTP es `xsmtpsib-…` (pestaña SMTP), NO la API key `xkeysib-…`
  (pestaña API Keys). (3) El remitente debe estar **verificado** en Brevo.
- **Config de redirect (URL Configuration):** Site URL + Redirect URLs
  (`https://locationguesser-sage.vercel.app/**`, `http://localhost:5173/**`).
