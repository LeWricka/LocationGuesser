# Operativa — runbook

Runbook conciso de operativa de LocationGuesser: seguridad de la API key de Google Maps, alerta de presupuesto, variables de entorno y despliegue de Edge Functions. Issue [#80](https://github.com/LeWricka/LocationGuesser/issues/80).

---

## 1. Restricción de la API key de Google Maps

La key del front es **pública** (viaja en el cliente). La defensa NO es ocultarla, sino **restringirla** para que solo funcione desde nuestros orígenes y solo para la API que usamos.

En **Google Cloud Console → APIs y servicios → Credenciales → [la API key]**:

### Restricción de aplicación: referrers HTTP
Marcar **"Sitios web (Referentes HTTP)"** y permitir exactamente estos referrers:

```
https://www.momentu.art/*
https://momentu.art/*
https://locationguesser-sage.vercel.app/*
https://*.vercel.app/*
http://localhost:5173/*
```

- `momentu.art/*` (y `www.`) → producción (dominio propio desde jul 2026).
- `locationguesser-sage.vercel.app/*` → la URL de Vercel subyacente (sigue viva).
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

### 3.1 Variables de SERVIDOR para `web/api/*` (previsualización OG de enlaces compartidos)

Las funciones serverless de Vercel `web/api/share.ts` y `web/api/og.ts` (sirven la
tarjeta OG de `/v/:code` y `/j/:code`, ver `web/api/_meta.ts`) corren en el
**runtime de función**, no en el bundle del cliente: **no reciben las `VITE_*`**
del build de Vite. Necesitan sus PROPIAS variables de entorno de servidor,
definidas aparte en Vercel:

| Variable | Qué es | Origen |
|----------|--------|--------|
| `SUPABASE_URL` | URL del proyecto Supabase (igual valor que `VITE_SUPABASE_URL`, pero como var de servidor) | `https://ykquigyjvgxisgdxryxr.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key de Supabase (**SECRETA** — nunca en git, nunca en el cliente). Salta la RLS para que el crawler anónimo pueda leer título/portada (migración `0025`) | Dashboard Supabase → Project Settings → API → `service_role` |

**Sin estas dos variables en Vercel, la previsualización NUNCA da 500** (el código
en `web/api/_meta.ts` — `hasServerCreds()` — lo comprueba antes de tocar red y cae
a metas genéricas de marca), pero la tarjeta que ve el receptor en WhatsApp/Telegram
será genérica (sin título del viaje ni foto real) en vez de la enriquecida. Si a
fecha de esta nota **no están configuradas en Vercel**, es la causa de que la
previsualización salga siempre con el logo genérico — añadirlas (Production +
Preview) y redeploy para activar la tarjeta enriquecida.

> **Nota histórica (P0, jul 2026):** un 500 real (`FUNCTION_INVOCATION_FAILED`) en
> estas mismas funciones vino de otra causa — un import relativo sin extensión
> (`from './_meta'`) que el runtime de Vercel no resuelve al ejecutar el `.ts`
> directamente (a diferencia de un bundler). Se arregló con la extensión explícita
> (`from './_meta.ts'`) — ver PR que cierra el issue de P0. Este apartado documenta
> la config de env pendiente que sigue siendo responsabilidad manual del dueño.

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

### 5.0 Actualizaciones de la PWA — nunca auto-recargar (#549)

Tabide sondea `registration.update()` cada 60 s (`web/src/main.tsx`) porque es un
SPA: sin ese sondeo, un deploy nuevo no se detecta hasta una recarga manual y el
usuario se queda en la versión cacheada. Pero el SW **nunca aplica la
actualización solo**: `registerType: 'prompt'` (vite-plugin-pwa) + `web/src/sw.ts`
sin `skipWaiting()` incondicional hacen que el SW nuevo se quede EN ESPERA hasta
que `main.tsx` lo pide explícitamente. Antes (#498, `autoUpdate` +
`skipWaiting`/`clientsClaim`), cualquier deploy recargaba de golpe TODAS las
pestañas abiertas, incluso con un formulario a medias — con varios deploys en una
misma noche, se perdían formularios de crear reto/momento.

Comportamiento tras un deploy:

- **Usuario con la pestaña oculta** (minimizada, cambió de pestaña/app) cuando se
  detecta la versión nueva: se aplica en silencio (`visibilitychange` →
  `updateSW(true)`); al volver, ve la versión nueva sin haber notado nada.
- **Usuario activo mirando la pantalla**: aparece un banner discreto ("Hay una
  versión nueva · Actualizar", `web/src/ui/UpdateBanner.tsx`) y espera a que
  pulse, o a que oculte la pestaña (lo que ocurra antes).

Nunca hay una recarga sorpresa con el usuario mirando y sin haberla pedido.

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
| `VAPID_SUBJECT` | — | **Secret de Supabase**. `mailto:` de contacto (p.ej. `mailto:Iker@540deg.com`). Opcional (hay default). |
| `PUSH_SEND_TOKEN` | **SECRETO** | **Secret de Supabase** + GUC de la BD (§6.4). Token aleatorio largo que solo conoce la BD; protege la función. |

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya están disponibles para las Edge
Functions del proyecto (no hay que setearlas). El `service_role` lo usa `send-push`
para leer las suscripciones de todos los miembros (se salta RLS); **jamás** al cliente.

### 6.3 Poner los secrets en Supabase

```bash
npx supabase secrets set \
  VAPID_PUBLIC_KEY=<Public Key> \
  VAPID_PRIVATE_KEY=<Private Key> \
  VAPID_SUBJECT=mailto:Iker@540deg.com \
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

## 7. Smoke logueado post-deploy en prod (cuenta de test) — issue #458

Los E2E de CI son **herméticos** (mockean sesión, Supabase y Google Maps): cazan
regresiones de lógica, pero por diseño **no ven** los bugs que solo aparecen
**logueado + con Google Maps/BD reales** (el punto ciego de esta semana: el bloque
"Añadir Street View" que no se veía en local). El **smoke logueado** cubre ese hueco:
un navegador real contra `https://www.momentu.art` con una **cuenta de test** que
recorre home logueada → abrir un viaje → crear reto → soltar pin → comprobar que
**"Añadir Street View" es visible**.

- **Spec:** [`web/e2e/prod-logged-smoke.spec.ts`](../web/e2e/prod-logged-smoke.spec.ts) ·
  **config:** [`web/playwright.prod.config.ts`](../web/playwright.prod.config.ts) ·
  **workflow:** [`.github/workflows/prod-smoke.yml`](../.github/workflows/prod-smoke.yml).
- **Auth:** reutiliza el mecanismo existente (`e2e/global-setup.ts`): login por
  **password** con el cliente de Supabase en Node (`signInWithPassword`) → inyecta la
  sesión en `localStorage` (storageState) → el navegador arranca logueado, **sin magic
  link**. Determinista y sin clic en email.
- **No destructivo:** aborta **antes de persistir** — no sube foto, no nombra, no lanza
  el reto → **no escribe ningún reto**. Solo puede tocar el auto-join al abrir el viaje
  de test (idempotente: el usuario ya es miembro). **No crea viajes.**
- **Cuándo corre:** disparo **manual** (`workflow_dispatch`) y **post-deploy** (al
  completarse la CI en `main`; espera 90 s para dar tiempo al redeploy de Vercel).
  **NO** corre en cada PR.
- **Skip limpio sin secrets:** si faltan los secrets, el job **no falla**, se salta con
  un aviso. El pipeline normal no se rompe hasta que actives la cuenta de test.

### 7.1 Crear el usuario de test en Supabase (una vez)

Usa un **correo desechable** dedicado (no tu correo real). Dos vías:

**A — con el script del repo** (crea el usuario ya confirmado; recomendado). Requiere
la **service_role key** (SECRETA — Dashboard Supabase → Project Settings → API →
`service_role`). Lánzalo **en local**, nunca en el repo ni en un secret que se loguee:

```bash
cd web
SUPABASE_SERVICE_ROLE_KEY='<service_role>' \
VITE_SUPABASE_URL='https://ykquigyjvgxisgdxryxr.supabase.co' \
E2E_USER_EMAIL='e2e-smoke@<desechable>' \
E2E_USER_PASSWORD='<contraseña larga aleatoria>' \
npm run e2e:seed-user
```

El script crea (o actualiza) el usuario con **email ya confirmado** (`email_confirm:
true`), así que puede loguear por password y **crear viajes** sin validar correo.

**B — a mano en el dashboard:** Authentication → Users → **Add user** → email + password
→ marca **Auto Confirm User** (o luego "Confirm email"). Sin confirmar, no podrá crear.

> ⚠️ La **service_role key** omite RLS: es como la contraseña de la BD. **Nunca** la
> pongas en git, en `web/`, ni como secret de este smoke (el smoke NO la necesita —
> solo la usa el `e2e:seed-user`, que corres en local). NO la compartas jamás.

### 7.2 Crear el viaje de test dedicado (una vez) y coger su id

Para que el smoke sea **no destructivo**, apúntalo a un **viaje de test dedicado** que
ya exista (así no crea nada). Logueado como el usuario de test en
`https://www.momentu.art`, crea un viaje (p.ej. "smoke e2e — no tocar") y coge su **id**
del hash de la URL (`…/#g=<ESTE_ID>`). Ese id va en el secret `E2E_TRIP_ID`.

(Si no configuras `E2E_TRIP_ID`, el smoke abre la primera tarjeta de "Tus viajes"; y si
el usuario no tiene ninguna, salta las partes que necesitan un viaje. Dedicar uno es lo
recomendado para que sea estable y no toque viajes reales.)

### 7.3 GitHub Actions secrets a añadir

En **GitHub → repo `LeWricka/LocationGuesser` → Settings → Secrets and variables →
Actions → New repository secret**:

| Secret | Qué es | De dónde sale |
|--------|--------|---------------|
| `E2E_USER_EMAIL` | Correo del usuario de test (desechable) | El que usaste en §7.1 |
| `E2E_USER_PASSWORD` | Su contraseña | La que usaste en §7.1 |
| `E2E_TRIP_ID` | Id del viaje de test dedicado | Del hash `#g=<id>` (§7.2). Opcional pero recomendado |
| `VITE_SUPABASE_URL` | URL del proyecto Supabase (**pública**) | `https://ykquigyjvgxisgdxryxr.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key de Supabase (**pública**) | Dashboard Supabase → API |

> Las dos `VITE_SUPABASE_*` son **públicas** (ya viajan en el bundle del front); están
> como secrets solo para no hardcodearlas en el YAML. **NO** añadas la `service_role`
> ni la contraseña de la BD: el smoke no las usa.

### 7.4 Lanzar el smoke manualmente

- **En GitHub:** Actions → **"Smoke logueado (post-deploy)"** → **Run workflow** (rama
  `main`). Si faltan secrets, el job termina en verde con un aviso de "omitido".
- **En local** (con `web/.env.local` cargando `VITE_SUPABASE_*` y exportando
  `E2E_USER_*`/`E2E_TRIP_ID`):

  ```bash
  cd web
  export E2E_USER_EMAIL='e2e-smoke@<desechable>'
  export E2E_USER_PASSWORD='<contraseña>'
  export E2E_TRIP_ID='<id del viaje de test>'   # opcional
  npm run e2e:prod-logged
  ```

  Apunta a `https://www.momentu.art` por defecto; override con `E2E_BASE_URL` para un
  deploy de preview.

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

### Entrada de baja fricción (nombre + email, validación diferida) — issue #438

Modelo de entrada: **nombre + email → dentro al instante**, sin esperar código. Bajo
el capó se crea una sesión **anónima** (`signInAnonymously`) y se le **enlaza el email**
(`updateUser({email})`), que dispara el correo de validación. Ver/jugar/unirse va con el
email **pendiente**; **crear viaje** exige el email **validado**.

Prerrequisitos de PROD (los activa el dueño en el dashboard; el código ya está listo):

1. **Activar "Anonymous sign-ins":** Supabase → Authentication → Sign In / Providers →
   **Allow anonymous sign-ins = ON**. Sin esto, la entrada de baja fricción no puede
   crear la sesión anónima y `enterWithNameAndEmail` fallará.
2. **Plantilla "Confirm signup" / "Change Email Address":** al enlazar el email a un
   anónimo, Supabase manda el correo de **cambio/confirmación de email**. Revisar que la
   plantilla (Authentication → Email Templates) tenga copy claro ("valida tu correo") y el
   enlace `{{ .ConfirmationURL }}`. El mismo SMTP propio (arriba) la envía.
3. **RLS (migración `0032_crear_exige_no_anonimo.sql`):** endurece `groups_insert_owner`
   para exigir `is_anonymous = false` — un anónimo NO puede crear viajes a nivel de BD
   (el gate del cliente es solo la cara amable). La aplica el pipeline `db-migrate` al
   mergear (no a mano). No rompe a los usuarios ya registrados (su JWT no es anónimo).
4. **Caso email ya registrado:** si en la entrada el correo ya pertenece a una cuenta, NO
   se enlaza a un anónimo (fallaría con `email_exists`); en su lugar se manda un **magic
   link de recuperación** (mismo flujo OTP/passwordless) para recuperar la cuenta original.

---

## 8. Email transaccional propio (SMTP de momentu.art vía Porkbun)

Los correos de acceso (código OTP + enlace) salen de Supabase Auth. Por defecto usan
el SMTP COMPARTIDO de Supabase: remitente genérico, límites bajos (~2/hora en picos)
y sospechoso de los correos duplicados observados el 4 jul.

El dominio momentu.art está registrado en Porkbun con la zona DNS en Vercel; NO hay
buzón de correo (ni falta que hace para enviar): se usa un servicio TRANSACCIONAL
que envía "como" el dominio verificándolo por DNS.

### 8.1 Resend (recomendado — gratis hasta 3.000/mes, sin buzón)

1. Cuenta en resend.com → **Domains → Add domain** → `momentu.art`.
2. Resend da los registros DNS (SPF + DKIM) → añadirlos en **Vercel → Domains →
   momentu.art → DNS**. Verifica en minutos.
3. Resend → **API Keys** → crear una (permiso de envío).
4. **Supabase Dashboard → Project Settings → Authentication → SMTP Settings →
   Enable Custom SMTP:**

| Campo | Valor |
|---|---|
| Sender email | `no-reply@momentu.art` (no necesita existir como buzón) |
| Sender name | `Momentu` |
| Host | `smtp.resend.com` |
| Port | `465` (SSL; alternativa `587` STARTTLS) |
| Username | `resend` (literal) |
| Password | la API key de Resend |

Guardar y probar (logout → entrar de nuevo): debe llegar 1 correo, desde
`no-reply@momentu.art`, sin caer en spam.

> A `no-reply@` no se puede responder (no hay buzón): correcto para códigos de
> acceso. Para RECIBIR correo en el dominio (p.ej. `hola@momentu.art`) sin comprar
> buzón: Porkbun ofrece reenvío gratuito de alias → un correo personal.

### 8.1-bis Alternativa: buzón + SMTP de Porkbun

Si algún día se quiere buzón real (enviar Y recibir): contratar Email Hosting en
Porkbun (crea `hola@momentu.art`), añadir sus MX/SPF/DKIM a la zona de Vercel, y en
Supabase usar host `smtp.porkbun.com`, puerto `587`, usuario el buzón completo y su
contraseña.

### 8.2 Plantillas con marca (las 6 de Supabase Auth)

**Dashboard → Authentication → Email Templates**: pegar en cada plantilla el HTML
de su fichero en [docs/plantillas/](plantillas/). Mismo diseño en todas (wordmark
con punto teal, hilo dorado, código grande, botón); ninguna requiere tocar código.

| Plantilla de Supabase | Fichero | Asunto sugerido | En uso hoy |
|---|---|---|---|
| Magic Link | `email-acceso-momentu.html` | Tu código para entrar en Momentu | ✅ el login (OTP + enlace) |
| Confirm signup | `email-confirmar-registro.html` | Bienvenido a Momentu — confirma tu correo | Según config de confirmación |
| Change Email Address | `email-cambio-correo.html` | Confirma tu nuevo correo en Momentu | Si el usuario cambia el email |
| Reauthentication | `email-reautenticacion.html` | Tu código de confirmación de Momentu | Acciones sensibles (solo código) |
| Invite user | `email-invitacion.html` | Te esperan en Momentu | No (invitación desde el panel) |
| Reset Password | `email-restablecer.html` | Restablece tu acceso a Momentu | No (Momentu es passwordless) |

Variables por plantilla anotadas en la cabecera de cada fichero (`{{ .Token }}`,
`{{ .ConfirmationURL }}`, y en el cambio de correo `{{ .Email }}`/`{{ .NewEmail }}`).

### 8.3 Después del cambio

- Vigilar el primer login real: llega 1 correo (no 2 — si con SMTP propio los
  duplicados desaparecen, el culpable era el SMTP compartido) y no cae en spam.
- El evento `login_email_solicitado` (Mixpanel, #679) sigue contando los envíos
  pedidos desde el cliente para contrastar.
