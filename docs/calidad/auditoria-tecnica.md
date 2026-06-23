# Auditoria tecnica de calidad — LocationGuesser

> Issue #142. Auditoria en profundidad sobre `main` (worktree aislado).
> Stack: React 19 + Vite 8 + TS, Supabase (Postgres+RLS, Realtime, Storage, Edge Functions),
> Leaflet + Google Maps Street View, Vercel. App passwordless (magic link).
> Fecha: 2026-06-23.

Cada hallazgo lleva `archivo:linea`, **severidad** (Critica/Alta/Media/Baja), **esfuerzo**
(XS/S/M/L) y recomendacion accionable. Esto es **auditoria, no implementacion**: no se ha
tocado `web/src/**`.

---

## Resumen ejecutivo

| Dimension | Estado | Lo mas grave |
|-----------|--------|--------------|
| 1. Cobertura de tests | 🟡 31% lineas global | Logica pura bien cubierta; componentes y libs de datos (auth, storage, challenges) a 0–33% |
| 2. E2E | 🔴 desactualizado | Specs pre-login (no autentican) → rotos contra la app actual; CI no corre E2E |
| 3. Adherencia a reglas | 🟢 alta | Sin `any`; nombres y snake_case OK. Hardcodeo de color en CSS (no tokens) |
| 4. Type-safety | 🟡 medio | **`tsconfig` sin `strict`**; cast doble en `membership.ts` |
| 5. Seguridad | 🔴 critico | **Scoring confiado al cliente**; respuesta (lat/lng) legible antes de votar; **SSRF en Edge Function** |
| 6. Accesibilidad | 🟢 muy buena | Modales/labels/toasts correctos |
| 7. Rendimiento / bundle | 🟡 mejorable | Un solo chunk 1.1 MB (329 KB gzip), sin code-splitting |
| 8. Robustez / errores | 🟢 buena | Realtime con cleanup, upsert idempotente; faltan reintentos/reconexion explicita |
| 9. Deuda tecnica | 🟡 | `GroupPage.tsx` 660 lineas; rama muerta en `ensureGroup` |

**Lo mas urgente (Critico):**
1. **Integridad del juego confiada al cliente** — `votes.points` lo calcula y lo manda el navegador; la RLS solo valida `user_id`. Cualquier miembro puede inyectar `points: 5000` por reto. Ademas `getChallenge` devuelve `lat`/`lng` (la respuesta) al jugador antes de votar.
2. **SSRF en la Edge Function** `resolve-maps-url` — hace `fetch` a una URL arbitraria del usuario sin allowlist de dominios.

---

## 1. Cobertura de tests

Medida con `vitest run --coverage` (v8) sobre `src/**`. 47 archivos de test, 258 tests, todos en verde.

```
Statements : 31.16% (1683/5401)
Branches   : 86.53% (450/520)
Functions  : 73.03% (149/204)
Lines      : 31.16% (1683/5401)
```

> El 31% global enmascara una realidad bimodal: **la logica pura esta muy bien cubierta**
> y **los componentes/orquestadores estan casi sin cubrir**. El branch 86% es alto porque
> casi todo lo testeado son funciones puras con muchas ramas.

### Modulos criticos BIEN cubiertos (100%)
- `lib/geo.ts` (haversine + scoring `scoreFor`), `lib/result.ts` (computeResult), `lib/votes.ts`,
  `lib/profile.ts`, `lib/route.ts`, `lib/streetview.ts`, `lib/time.ts`.
- `features/group/prizes.ts`, `features/play/sceneMedium.ts`, `features/auth/useDeepLinkJoin.ts`,
  `features/home/countdown.ts`, `features/onboarding/useOnboarding.ts`.
- `supabase/functions/resolve-maps-url/parse.ts` (parser de URLs de Maps) — tiene su test.

### Modulos criticos SIN cobertura o pobre (riesgo)

| Modulo | Lineas | Cobertura | Severidad | Esfuerzo |
|--------|-------:|----------:|-----------|----------|
| `lib/storage.ts` (compresion + strip EXIF + upload) | 76 | **0%** | **Alta** | M |
| `lib/session.tsx` (provider de sesion auth) | 46 | **0%** | **Alta** | M |
| `lib/auth.ts` (magic link, getUser, deep-link dest) | 52 | **27%** | **Alta** | S |
| `lib/challenges.ts` (createChallenge / ensureGroup) | 45 | **20%** | **Alta** | S |
| `lib/analytics.ts` (Mixpanel) | 33 | **33%** | Media | S |
| `features/group/shareLeaderboard.ts` (html-to-image) | 54 | **28%** | Media | S |
| `lib/leaderboard.ts` (agregacion del ranking) | 33 | **58%** | Media | S |
| `lib/groupData.ts` | 50 | 64% | Media | S |
| `features/group/GroupPage.tsx` | 660 | **0%** | Alta | L |
| `features/create/CreateChallenge.tsx` | 428 | **0%** | Alta | L |
| `features/play/PlayChallenge.tsx` | 406 | **0%** | Alta | L |

**Recomendacion (Alta, M):** priorizar tests de `lib/storage.ts` (el strip de EXIF es seguridad
— ver §5) y de `lib/leaderboard.ts`/`aggregateLeaderboard` (suma de puntos = resultado del juego).
Los tres componentes grandes a 0% son los que mas valor tendrian en E2E (§2) mas que en unit.

**Nota de tooling:** no hay reporter de coverage configurado en `vitest.config.ts` ni umbrales.
Anadir `coverage: { provider: 'v8', reporter: ['text','html'], thresholds: {...} }` permitiria
vigilar la cobertura en CI. **(Media, XS.)**

---

## 2. E2E

Specs en `web/e2e/`: `smoke.spec.ts`, `create-full.spec.ts`, `maps-url.spec.ts`.
Config Playwright solo Chromium, `webServer` levanta Vite en local.

**Estado:** los specs **son anteriores al login**. `smoke.spec.ts` arranca en `page.goto('/')`
y pulsa "Crear un grupo" directamente, sin pasar por el magic link. Con la app actual
(gated por sesion, RLS solo-auth, migracion 0004 ya aplicada), estos flujos **no llegan**:
crear grupo exige `user` (`CreateGroup.tsx:25`) y la RLS de `groups` exige `created_by = auth.uid()`.

> Ya hay una issue en curso adaptando los E2E al login; **no se duplica aqui**. Solo se evalua
> el gap.

**Gaps de flujos criticos sin cubrir en E2E (una vez se rehagan con login):**
- Magic link / sesion (stub o usuario de test) — **Alta**.
- Votar un reto y ver el marcador actualizarse via Realtime — **Alta** (es el bucle nuclear).
- Auto-join al abrir un `#g=CODE` siendo no-miembro — **Alta**.
- Permisos dueno vs miembro (borrar reto, editar premios) — **Media**.
- Compartir clasificacion como imagen (html-to-image) — **Baja**.

**CI no corre E2E** (`.github/workflows/ci.yml` solo hace lint/types/test/build). El playbook
dice que el orquestador corre `npm run e2e` a mano. **Recomendacion (Media, S):** anadir un job
de Playwright a CI (al menos `e2e:prod` smoke) una vez los specs autentiquen.

---

## 3. Adherencia a las reglas (`always.md` §5, estilo Sunner)

| Regla | Cumplimiento |
|-------|--------------|
| Sin `any` | ✅ **0 usos** de `any` en `web/src/**` |
| Interfaz de props llamada `Props` | ✅ 100% de los componentes |
| snake_case en BD/API | ✅ 100% (`created_at`, `image_path`, `group_id`, `user_id`, `sv_pano_id`) |
| Nombres de archivo (PascalCase comp. / camelCase utils) | ✅ 100% |
| Comentarios explican el "porque" | ✅ mayoritariamente excelente |
| UI con tokens, sin hardcodear color/espaciado | 🔴 **violado en varios CSS** |

### Hardcodeo de color en CSS modules (en vez de tokens de `ui/tokens.css`)

| Archivo:linea | Valor | Severidad | Esfuerzo |
|---------------|-------|-----------|----------|
| `web/src/features/group/LeaderboardCard.module.css:173-182,244-250` | colores de medallas (`#ffcf5c`, `#cfe0e6`, `#d98a4e`, textos) | **Alta** | S |
| `web/src/features/group/LeaderboardCard.module.css:23,25-27,81-82` | `#04141d`, gradientes y `rgba(...)` ocean/accent | Alta | M |
| `web/src/ui/ChallengePhoto.module.css:77-79` | `#fff`, `rgba(0,0,0,0.7/0.6)` | Media | XS |
| `web/src/ui/Lightbox.module.css` | `color:#fff` | Media | XS |
| `web/src/features/group/GroupPage.module.css:25-28` | gradientes hex de podio | Media | S |

**Recomendacion (Alta, S):** crear tokens de medalla/glass en `ui/tokens.css`
(`--color-medal-gold`, `--color-on-medal-gold`, `--glass-surface-dark`, …) y reemplazar los hex.
Es el unico incumplimiento sistematico del estilo Sunner.

### Comentarios discutibles (Baja, XS)
Los `eslint-disable react-hooks/exhaustive-deps` en `CreateChallenge.tsx:138`,
`StreetViewPreview.tsx:57`, `useAnalyticsIdentity.ts:60` justifican poco el "porque" de excluir
deps. Expandir la razon.

---

## 4. Type-safety

### tsconfig SIN `strict` — Critica, M
`web/tsconfig.app.json` no incluye `"strict": true` ni `noUncheckedIndexedAccess`,
`strictNullChecks`, `noImplicitAny`, `exactOptionalPropertyTypes`, `noImplicitReturns`.
Tiene solo `noUnusedLocals/Parameters/noFallthroughCasesInSwitch`. El ESLint usa
`tseslint.configs.recommended` (no `recommendedTypeChecked`), asi que **no hay lint type-aware**
tampoco. Resultado: los casts a tipos de BD y los accesos a indices no se validan.

**Recomendacion:** activar `strict: true` en `tsconfig.app.json`, correr `type-check`, arreglar
los pocos puntos que salten (sobre todo los dos casts de abajo). Es la mejora de calidad de
mayor relacion valor/esfuerzo a medio plazo.

### Casts peligrosos

| Archivo:linea | Cast | Severidad | Esfuerzo | Recomendacion |
|---------------|------|-----------|----------|---------------|
| `lib/membership.ts:95` | `(data ?? []) as unknown as MembershipRow[]` | **Alta** | S | Doble cast que silencia el checker. Validar la forma del join PostgREST con type guard. |
| `lib/leaderboard.ts:55` | `(data ?? []) as Vote[]` | Media | S | Datos de Supabase sin validar; al menos tipar el `.select('*')` con genericos. |
| `ui/Stack.tsx:28`, `ui/Avatar.tsx:20`, `ui/Row.tsx:27`, `ui/Spinner.tsx` | `{...} as CSSProperties` (custom props `--x`) | Baja | XS | Justificado para CSS vars; extraer helper si se repite. |

Sin `@ts-ignore`. Un solo `@ts-expect-error` legitimo en `lib/streetview.test.ts:16` (mock de
`google` global).

### `database.types.ts` vs migraciones — sincronizado
Escrito a mano (compatible con `supabase gen types`). Coincide con `profiles`, `group_members`,
`groups` (incl. `prizes jsonb` de 0008 → `GroupPrizes | null`), `challenges` (incl.
`photo_is_hint`, `sv_*`), `votes` (incl. `guess_*` nullable de 0007). **Sin desincronizaciones.**
Riesgo a futuro: al ser manual, una migracion nueva puede olvidarlo. **(Baja, XS)** anadir nota
en `always.md §6` de regenerar tras cada migracion.

---

## 5. Seguridad

### 5.1 Integridad del juego: scoring y respuesta confiados al cliente — **CRITICA, L**

El bucle competitivo no tiene autoridad de servidor:

- `features/play/PlayChallenge.tsx:164` hace `getChallenge(challengeId)` que devuelve la fila
  completa, **incluyendo `lat`/`lng` (la respuesta)**, al jugador *antes* de votar. Cualquier
  miembro puede leer la respuesta en la pestana de red.
- El scoring se calcula en el cliente (`computeResult` → `result.ts`) y el voto se guarda con
  `points` que **manda el navegador** (`lib/votes.ts:31`, `SaveVoteInput.points`).
- La RLS de `votes` (`0004` lineas 246-248) solo valida `user_id = auth.uid()` y membresia;
  **no valida que `points` sea coherente** con la distancia ni con `lat/lng`. El ranking
  (`lib/leaderboard.ts:31` `entry.points += vote.points`) **suma a ciegas** lo enviado.

**Impacto:** un miembro puede (a) ver la respuesta antes de jugar y (b) inyectar `points: 5000`
(o cualquier valor) en cada reto y liderar la clasificacion. El propio comentario de la migracion
`0004:136-138` reconoce que ocultar `lat/lng` y validar antes de votar "requiere una Edge Function
(mejora futura)".

**Recomendacion:** mover el calculo y el guardado del voto a una Edge Function (o RPC `security
definer`) que: reciba solo `guess_lat/lng`, lea `lat/lng` server-side, calcule `distance_km` y
`points`, e inserte el voto. Y no devolver `lat/lng` de un reto *vivo* a quien no ha votado (vista
o RPC que omita la respuesta hasta tener voto). Es trabajo real (L), pero es la integridad del
producto. Mitigacion parcial barata: dejar claro en producto que el ranking es "de confianza"
mientras tanto.

### 5.2 SSRF en la Edge Function `resolve-maps-url` — **Alta, S**

`supabase/functions/resolve-maps-url/index.ts:54` hace `fetch(url, { redirect: 'follow' })`
sobre una **URL arbitraria** del cliente, sin validar el dominio. CORS abierto (`*`, linea 16),
sin auth, sin rate-limit.

**Impacto:** un atacante puede usar la funcion como proxy para alcanzar endpoints internos de la
red de Supabase o de metadatos de la nube (p.ej. `http://169.254.169.254/...`), y seguir
redirecciones a destinos internos.

**Recomendacion:** validar que la URL (y la URL final tras redireccion) pertenece a un allowlist
de hosts de Google Maps (`maps.app.goo.gl`, `goo.gl`, `*.google.com/maps`, `maps.google.com`).
Rechazar IPs privadas/loopback. Limitar redirecciones y tamano de respuesta. Considerar exigir el
JWT del usuario (la app ya esta autenticada).

### 5.3 Strip de EXIF / GPS antes de subir — **OK (garantizado)**

`lib/storage.ts:62 compressAndStripExif` decodifica la imagen y la **redibuja en un `<canvas>`**
antes de `canvas.toBlob('image/jpeg')`. El canvas descarta todos los metadatos, incluido el GPS
del EXIF (que seria la respuesta). El fallback `<img>.decode()` tambien redibuja en canvas, asi
que el strip se mantiene en la ruta degradada. **Garantizado** para el camino normal.

**Matiz (Media, S):** no hay test que lo verifique (`storage.ts` a 0% cobertura). Y si en el
futuro se anade subida directa del `File` original (p.ej. para HEIC sin recomprimir), el GPS
volveria. **Recomendacion:** test que confirme que el blob de salida no contiene marcadores EXIF;
no anadir nunca un camino que suba el `File` crudo.

### 5.4 Exposicion de keys — **OK con un matiz**

- Publishable key de Supabase: publica por diseno, en `.env.local`/Vercel. Correcto.
- Google Maps key (`VITE_GOOGLE_MAPS_API_KEY`, `main.tsx:18`): publica por diseno **pero debe
  estar restringida por referrer HTTP al dominio**. El `.env.example` lo documenta. **No es
  verificable desde el codigo** (es config de Google Cloud Console). **Accion (Media, XS):**
  confirmar en Google Cloud que la key esta restringida a `locationguesser-sage.vercel.app` y
  `localhost`, y a las APIs de Maps/Street View; cruzar con `docs/operativa.md`.
- **Token de Mixpanel hardcodeado** en `lib/analytics.ts:14`
  (`FALLBACK_TOKEN = '804a0a0fe0da2496051217c66bd0ff83'`). Es un token publico de cliente, pero
  esta **commiteado en el repo** como fallback. Riesgo bajo (permite mandar eventos espureos al
  proyecto). **(Baja, XS)** quitar el fallback embebido y depender del env.

### 5.5 Privacidad de la analitica — **Media, XS**

`lib/analytics.ts:68-69`: `autocapture: true` + `record_sessions_percent: 100`. Se graba el
**100% de las sesiones** (session replay) y se autocapturan clics/entradas. Para una app de
amigos puede ser excesivo y plantea privacidad (PII en replays). **Recomendacion:** bajar el
porcentaje de replay, desactivar autocapture de inputs, o anadir aviso/consentimiento.

### 5.6 RLS — solida en general, con dos notas

La migracion `0004` cierra bien el perimetro: solo-auth, membresia via `is_group_member`
(`security definer`, evita recursion), propiedad via `created_by = auth.uid()`. No se puede
falsear `created_by`/`user_id` (los `with check` los atan a `auth.uid()`). Storage privado con
URLs firmadas (`storage.ts:117`). Bien.

- **Nota (Media):** `groups_select_authenticated using (true)` (0004:212) deja a **cualquier
  autenticado leer `id`+`name` de cualquier grupo** (no solo de los suyos). Es intencional para
  el flujo "Unete a {grupo}" del onboarding, pero permite enumerar nombres de grupos si se
  adivinan codigos. No expone la respuesta (eso vive en `challenges`, gated por membresia).
  Aceptable dado el diseno; documentado.
- **Nota (Baja):** ver §5.1 — la RLS de `votes`/`challenges` no protege la *correccion* de los
  datos del juego, solo la *autoria*.

---

## 6. Accesibilidad (a11y) — muy buena

| Area | Estado |
|------|--------|
| Modales (`ui/Modal.tsx`, `ui/Lightbox.tsx`, `OnboardingSlideshow`) | ✅ `role="dialog"`, `aria-modal`, `aria-labelledby`/`aria-label`, cierre con Escape, foco al abrir y retorno de foco |
| Botones icono (`CreateGroupFab:20`, `Modal:65` cerrar, `Lightbox:101`) | ✅ con `aria-label` |
| Imagenes (`ChallengePhoto`, `Avatar`, `Lightbox`, share) | ✅ todas con `alt` |
| Inputs/labels (`ui/Field.tsx`, `ui/Input.tsx`) | ✅ `htmlFor`/`id`, `aria-describedby`, `aria-invalid`, errores con `role="alert"` |
| Toasts (`ToastProvider:53,55`) | ✅ `role="region"` + `aria-live="polite"` + `role="status"` |
| Foco visible | ✅ donde hay `outline:none` (Input, Modal, Lightbox, Onboarding) hay alternativa (`box-shadow`/`outline` en `:focus(-within)`) |
| `div onClick` | ✅ solo en overlays de modal/lightbox con `stopPropagation`; teclado cubierto por Escape |

**Sin hallazgos bloqueantes.** Mejora menor **(Baja, S):** verificar contraste real de los
gradientes de podio/medalla en `LeaderboardCard` (textos sobre dorado/bronce) con un checker WCAG.

---

## 7. Rendimiento / bundle

Build (`npm run build`):
```
dist/assets/index-<hash>.js    1.10 MB  (gzip ~329 KB)
dist/assets/index-<hash>.css   84 KB    (gzip ~20 KB)
```
Vite avisa: "Some chunks are larger than 500 kB".

| Hallazgo | Severidad | Esfuerzo | Detalle / recomendacion |
|----------|-----------|----------|-------------------------|
| **Un solo chunk JS, sin code-splitting** | **Media** | M | No hay `React.lazy`/`import()` en `web/src/**`. `PlayChallenge`, `GroupPage`, `CreateChallenge` (las pantallas con mapas) podrian ser lazy. |
| `html-to-image` en el bundle inicial | Media | XS | Solo se usa en `features/group/shareLeaderboard.ts`. Cambiar a `const { toPng } = await import('html-to-image')`. Ahorro directo. |
| Google Maps + Leaflet conviven | Baja | M | Usos distintos (Leaflet = mapa de juego/revelado en `PlayMap`/`RevealMap`/`MapPicker`; Google = solo Street View en `StreetViewPano`/`StreetViewPreview`). No es peso duplicado, pero el SDK de Street View podria cargarse lazy solo en play/create. |
| Mixpanel + session replay siempre cargado | Baja | XS | Aceptable; ver §5.5 sobre el coste de replay 100%. |
| Imagenes: compresion en cliente | ✅ | — | `storage.ts` redimensiona a 1600px lado largo y recomprime a JPEG 0.8 antes de subir. Bien. |
| Realtime: fugas | ✅ | — | `HomePage.tsx:59` y `GroupPage.tsx:140` hacen `removeChannel` en el cleanup; `session.tsx:65` hace `unsubscribe`. Sin fugas. |
| Memoizacion | ✅ | — | `GroupPage` usa `useMemo`/`useCallback` correctamente (leaderboard, `votesByChallenge`, `splitByStatus`, `refresh`). |

**Quick win (XS):** lazy-load de `html-to-image`. **Mejora media (M):** code-split de las 3
pantallas grandes con `Suspense` + Skeleton.

---

## 8. Robustez / manejo de errores

**Bien:**
- Estados de error/carga presentes: `GroupPage.tsx:86` captura y muestra mensaje; skeletons con
  `role="status"`.
- `CreateGroup.tsx:50` distingue errores de red ("Failed to fetch") de errores de app y da copy
  util (VPN/DNS/bloqueador).
- Votos idempotentes: `saveVote` es `upsert` con `onConflict: 'challenge_id,user_id'`
  (`votes.ts:33`) → recargar o reenviar no duplica. El unique en BD lo respalda.
- Realtime dedup: `GroupPage.tsx:72` `announcedVotes` evita reavisar el mismo voto.
- Voto de timeout (`0007`): guarda `points=0` sin guess para "marcar como jugado" y evitar
  reintentos infinitos. Buen detalle de robustez.

**A mejorar:**
- **Reconexion Realtime (Media, M):** las suscripciones no manejan el estado del canal
  (`SUBSCRIBED`/`CHANNEL_ERROR`/`TIMED_OUT`). Si el socket cae (movil, suspension), no hay
  reintento ni refetch al reconectar; la vista puede quedar desincronizada hasta recargar.
  Recomendacion: escuchar el callback de estado de `.subscribe((status) => ...)` y refetch en
  reconexion.
- **Sin optimistic UI en el voto (Baja, S):** el resultado se muestra tras el `await saveVote`;
  un fallo de red deja al usuario sin feedback claro de reintento. Aceptable para el alcance.
- **Race en `ensureGroup` muerta (Media, S):** ver §9 (no se alcanza, pero violaria RLS si se
  alcanzara).
- **`GroupPage` resolucion de permisos (Baja):** `isOwner` se resuelve async; durante el primer
  render un dueno ve la vista de miembro un instante. Cosmetico.

---

## 9. Deuda tecnica y mantenibilidad

| Hallazgo | Severidad | Esfuerzo | Detalle |
|----------|-----------|----------|---------|
| `features/group/GroupPage.tsx` = **660 lineas** | Media | M | Componente gigante: clasificacion + retos vivos/pasados + histórico fotos + premios + modal de compartir + Realtime. Extraer subcomponentes (LeaderboardSection, ChallengesSection, PhotoHistory) y hooks (`useGroupRealtime`). |
| `features/create/CreateChallenge.tsx` (428) y `features/play/PlayChallenge.tsx` (406) | Baja | M | Grandes pero cohesivos; candidatos a extraer hooks (`usePlayTimer`, `useChallengeForm`). |
| **Rama muerta en `lib/challenges.ts:37 ensureGroup`** | **Media** | S | El `if (groupId) return groupId` deja una rama "sin groupId" que inserta `groups` **sin `created_by`** → fallaria la RLS `groups_insert_owner`. `CreateChallenge.tsx:255` siempre pasa `groupId`, asi que la rama no se alcanza. Eliminarla (la creacion de grupo ya vive en `CreateGroup.tsx`, que si pone `created_by`). |
| Patron `eslint-disable react-hooks/set-state-in-effect` repetido | Baja | S | En `useHomeData.ts:142` y `GroupPage.tsx:117`. Mismo patron (carga async en efecto) → candidato a hook reutilizable `useAsyncData`. |
| `database.types.ts` mantenido a mano | Baja | XS | Funciona y esta en sync, pero es fragil; documentar el `gen types` tras cada migracion. |
| Sin TODOs colgando | ✅ | — | Busqueda de `TODO`/`FIXME`: limpio. |
| CI usa Node 20; el entorno local pide Node 24 (`engines`) | Baja | XS | `package.json` no fija `engines`; varias deps avisan EBADENGINE en Node 23/local. Alinear version de Node entre CI, Vercel y `.nvmrc`. |

---

## Plan de remediacion priorizado (severidad x esfuerzo)

| # | Hallazgo | Sev. | Esf. | Dimension |
|---|----------|------|------|-----------|
| 1 | Scoring + respuesta confiados al cliente (Edge Function/RPC con autoridad) | Critica | L | 5.1 |
| 2 | SSRF en `resolve-maps-url` (allowlist de dominios + bloquear IPs privadas) | Alta | S | 5.2 |
| 3 | Activar `tsconfig strict` + arreglar casts | Critica* | M | 4 |
| 4 | Rehacer E2E con login y cubrir voto/Realtime/auto-join (+ job en CI) | Alta | M | 2 |
| 5 | Cast doble `membership.ts:95` (type guard) | Alta | S | 4 |
| 6 | Tokens de medalla/glass + quitar hex hardcodeados | Alta | S–M | 3 |
| 7 | Tests de `storage.ts` (EXIF), `leaderboard.ts`, `auth.ts`, `challenges.ts` | Alta | M | 1 |
| 8 | Reconexion Realtime (estado del canal + refetch) | Media | M | 8 |
| 9 | Code-split de pantallas grandes (`Suspense`) | Media | M | 7 |
| 10 | Eliminar rama muerta de `ensureGroup` | Media | S | 9 |
| 11 | Bajar `record_sessions_percent` / autocapture de Mixpanel | Media | XS | 5.5 |
| 12 | Confirmar restriccion por referrer de la key de Maps | Media | XS | 5.4 |
| 13 | Refactor `GroupPage.tsx` (subcomponentes/hooks) | Media | M | 9 |
| 14 | Umbrales de cobertura en `vitest.config.ts` | Media | XS | 1 |
| 15 | Quitar token Mixpanel hardcodeado | Baja | XS | 5.4 |
| 16 | Alinear version de Node (CI/Vercel/`.nvmrc`) | Baja | XS | 9 |

\* La severidad de #3 es estructural: no rompe hoy pero deja sin red de seguridad a #1, #5 y futuros cambios.

### Quick wins (alto valor / bajo esfuerzo, hacibles ya)
- **Lazy-load `html-to-image`** (`shareLeaderboard.ts`): `await import(...)`. Aligera el bundle inicial. (XS)
- **Allowlist en `resolve-maps-url`**: rechazar URLs que no sean de Google Maps y las IPs privadas. Cierra la SSRF. (S)
- **Eliminar la rama muerta de `ensureGroup`** (`challenges.ts`): quita un camino que violaria la RLS. (S)
- **Quitar el token Mixpanel hardcodeado** y bajar `record_sessions_percent`. (XS)
- **Umbrales de cobertura** + reporter en `vitest.config.ts` para vigilar regresiones. (XS)
- **Tokens de medalla** en `tokens.css` para `LeaderboardCard` (el incumplimiento Sunner mas visible). (S)
</content>
</invoke>
