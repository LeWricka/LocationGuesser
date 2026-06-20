# LocationGuesser — Cuentas y home (hito de identidad real)

**Fecha:** 20 junio 2026 · **Estado:** diseño cerrado (decisión de producto tomada), listo para crear issues · **Framework:** Kernel de Rumelt (diagnóstico → política guía → acciones)

> **Decisión de producto YA TOMADA (no se cuestiona, se diseña):** el producto pasa a tener **cuentas para todos con login obligatorio vía magic link (email)** y un **modelo unificado de usuario**. Esto **sustituye** la identidad ligera (nombre único por grupo + PIN + navegador en `localStorage`). La cuenta es la identidad; el usuario tiene un **perfil con nombre/display global** y una **home/dashboard personal** desde la que crea grupos, entra a sus grupos y ve su histórico.

> **Fuente de verdad única.** Este documento **revierte y deja obsoleto** `docs/estrategia/identidad-y-sesiones.md` (que defendía "NO meter login aún — validar el bucle primero"). Esa decisión queda **anulada**. Donde haya conflicto, **manda este documento**. _Nota para el orquestador: ese fichero vive hoy en otra rama/worktree y aún no está en `main`; al integrarlo, bórralo o redirígelo a este doc para no dejar dos verdades. Ver §10._

---

## 1. Diagnóstico → Política → Acciones (Rumelt): por qué cuentas + home ahora

### 1.1 Diagnóstico

La identidad ligera (nombre por grupo + PIN, identidad de navegador en `localStorage`) se diseñó para **lanzar rápido y validar el bucle social sin fricción** [[prueba-de-un-dia.md §4](prueba-de-un-dia.md)]. Cumplió su función, pero arrastra **tres tensiones estructurales** que ya bloquean el siguiente salto del producto:

1. **La identidad no es portable ni fiable.** La identidad estable es el *nombre* y el dispositivo guarda un `client_id` + `pin_hash` en `localStorage` [[identity.ts](../../web/src/lib/identity.ts)]. Borrar datos del navegador, cambiar de móvil o jugar desde el portátil **parte la identidad** o exige reclamar el nombre con un PIN de 4 dígitos. Es un candado **blando, no seguridad real** (el `pin_hash` es público y forzable) [[prueba-de-un-dia.md §4, §9](prueba-de-un-dia.md)].
2. **No hay concepto de "mis grupos".** Hoy un grupo solo existe si tienes el enlace (`#g=…`) guardado en algún chat [[route.ts](../../web/src/lib/route.ts)]. No hay forma de que la app te diga *"estos son tus grupos, en este te toca jugar"*. Sin home, no hay retención fuera del momento del chat ni reenganche entre grupos.
3. **No hay propiedad ni permisos.** Cualquiera con el enlace puede crear, editar o borrar (RLS es **pública** en lectura y escritura, validada solo en cliente) [[0001_init.sql](../../supabase/migrations/0001_init.sql)]. No se puede decir "este grupo es mío" ni proteger sus retos.

El **desafío crítico** ya no es *"¿se juega?"* (eso lo valida la identidad ligera), sino: **convertir un juego que ocurre dentro de un chat en un producto al que la gente vuelve por su cuenta, con una identidad real y persistente que sostenga grupos, histórico y propiedad** — aceptando conscientemente la fricción de un registro la primera vez.

### 1.2 Política guía

> **La cuenta es la identidad.** Login obligatorio vía **magic link** (email, passwordless), modelo **unificado de usuario** con perfil global, y una **home/dashboard personal** como nuevo centro de gravedad de la app. Se prioriza **portabilidad + propiedad + retención** por encima de la fricción-cero de entrada, **cuidando que la fricción sea de una sola vez** (sesión persistente) y que el onboarding sea rápido y bonito.

Qué **descarta** explícitamente esta política:
- Nada de contraseñas (passwordless puro; magic link y, opcional futuro, OAuth).
- Adiós al nombre-por-grupo + PIN como mecanismo de identidad (se elimina; ver §4 y §5 para la migración).
- No se rebaja el login a "opcional/invitado". El usuario **acepta** que jugar exija registro [decisión de producto].

### 1.3 Acciones coherentes

1. **Auth real con Supabase Auth (magic link).** Sesión persistente en el cliente; solo molesta la primera vez.
2. **Perfil global** (`profiles`): `display_name` (+ avatar opcional) por usuario, no por grupo.
3. **Membresía explícita** (`group_members`): "mis grupos" deja de derivarse de enlaces sueltos.
4. **Propiedad** (`groups.created_by` → `auth.users`): dueño edita/borra; miembros juegan.
5. **Home/dashboard** como pantalla raíz para sesión iniciada (§3).
6. **Onboarding con login obligatorio y deep-link** que devuelve al usuario al reto tras el email (§2).
7. **Endurecer RLS** de público a **solo-auth**: leer/escribir exige sesión; editar exige ser dueño (§4.4).

---

## 2. Flujo de onboarding (login obligatorio con magic link)

### 2.1 Principios de diseño (con fuentes)

- **Fusionar registro + verificación + alta en un solo flujo.** El magic link une "darse de alta" y "verificar email" en un paso: el usuario mete su email, pulsa el enlace y queda creado + verificado a la vez. Reduce fricción justo en el momento crítico del alta. [[Descope — magic link templates](https://www.descope.com/blog/post/magic-link-email-templates)] [[LoginRadius — passwordless magic links](https://www.loginradius.com/blog/identity/passwordless-authentication-magic-links)]
- **La fricción es de una sola vez.** La sesión persiste; el segundo acceso y siguientes son directos. (Slack: equipos con invitación por magic link se onboardean 2,3 días antes que con contraseña.) [[Baytech — magic links UX](https://www.baytechconsulting.com/blog/magic-links-ux-security-and-growth-impacts-for-saas-platforms-2025)]
- **Preservar el destino (deep link).** Hay que **recordar a qué reto/grupo iba el usuario** antes de mandarlo al email, y devolverlo ahí al volver (no soltarlo en una home genérica). Supabase soporta `emailRedirectTo`, y el destino puede llevar el `#g=…&c=…` de vuelta. [[Supabase — signInWithOtp](https://supabase.com/docs/reference/javascript/auth-signinwithotp)]
- **Caducidad corta del enlace** (Supabase: 1h por defecto; recomendado acortar) y copia clara de "revisa tu correo". [[Descope](https://www.descope.com/blog/post/magic-link-email-templates)]

### 2.2 Los cuatro flujos

**(A) Visitante con link de reto, sin sesión** — el flujo crítico (es como entra el grupo desde WhatsApp).

```
Abre  …/#g=ABC&c=uuid   (sin sesión)
  └─► Pantalla "Únete para jugar este reto"
        · muestra contexto: nombre del grupo + miniatura/“te han retado”
        · campo email  →  [Enviar enlace mágico]
        · guardamos el destino (#g=ABC&c=uuid) antes de salir (localStorage `lg.next`)
  └─► "📬 Revisa tu correo" (con reenviar / cambiar email)
  └─► (email) clic en el enlace mágico
  └─► vuelve a la app con sesión
        · ¿primer login? → mini-paso de perfil: "¿Cómo te llamas?" (display_name) [+ avatar opcional, skippable]
        · auto-join al grupo ABC (alta en group_members) + restaura destino #g=ABC&c=uuid
  └─► entra DIRECTO a jugar el reto (no a la home)
```

**(B) Visitante sin link (entra por la raíz), sin sesión** — descubrimiento/registro a secas.

```
Abre  …/  (sin sesión)
  └─► Landing breve + [Entrar / Crear cuenta]  (un solo botón: email → enlace mágico)
  └─► "Revisa tu correo" → clic → vuelve con sesión
        · primer login → paso de perfil (display_name)
  └─► cae en su HOME/DASHBOARD (§3). Si es nuevo y sin grupos → estado vacío cuidado.
```

**(C) Usuario recurrente (ya tiene sesión)** — el caso del 95% de las visitas tras la primera.

```
Abre cualquier URL con sesión viva
  ├─ con #g=…&c=…  → si ya es miembro: directo a jugar; si no: auto-join silencioso y a jugar
  └─ sin hash      → HOME/DASHBOARD
(no se pide nada: la sesión persiste)
```

**(D) Dueño vs. miembro** — misma identidad, distintos permisos sobre un grupo.

```
DUEÑO (groups.created_by == auth.uid):
  · ve el grupo con acciones de gestión: editar nombre, crear reto, borrar reto, borrar grupo
MIEMBRO (fila en group_members, no dueño):
  · ve el grupo y juega; NO ve editar/borrar (RLS lo bloquea aunque la UI fallara)
```

> **Microcopys clave (ES).** Login con link: _"Únete para jugar este reto"_ · _"Te mandamos un enlace mágico a tu correo. Sin contraseñas."_ · _"📬 Mira tu correo — pulsa el enlace para entrar."_ · _"¿No te llega? Reenviar / Cambiar email."_ · Primer perfil: _"¿Con qué nombre juegas?"_ (placeholder: _"Lewis"_) · Auto-join: _"¡Estás dentro de **{grupo}**! A jugar."_

---

## 3. Home / dashboard personal

El **centro de gravedad** del producto para sesión iniciada. Objetivo: que al abrir la app la respuesta a *"¿qué hago ahora?"* sea inmediata. Una **acción primaria clara** y estados vacíos que guían (no pantallas en blanco). [[Eleken — empty state UX](https://www.eleken.co/blog-posts/empty-state-ux)] [[useronboard — empty states](https://www.useronboard.com/onboarding-ux-patterns/empty-states/)]

### 3.1 Secciones y jerarquía

De arriba abajo, por prioridad de atención:

1. **Cabecera / saludo + perfil.** _"Hola, {display_name}"_ + avatar (acceso a Perfil). Acción primaria **[+ Crear grupo]** como **botón flotante (FAB)** siempre accesible (decisión del usuario: que no sea un botón grande fijo arriba).
2. **🔔 Te toca jugar** (lo más accionable). Retos **abiertos** en mis grupos que **aún no he votado**, ordenados por deadline más próximo. Cada tarjeta: grupo, "reto de {creador}", cuenta atrás del plazo, botón **Jugar**. Si no hay → no se muestra esta sección (no ocupa espacio en vacío).
3. **👥 Tus grupos.** Lista de mis grupos (de `group_members`). Cada tarjeta con **estado**:
   - 🔴 **En vivo** — hay reto(s) abierto(s).
   - 🟡 **Te toca** — reto abierto sin tu voto (resaltado).
   - ⚪ **Al día** — sin retos abiertos pendientes.
   - 👑 chip **"Tuyo"** si eres el dueño.
   Tap → página del grupo.
4. **🏆 Históricos y ranking.** Acceso a tu rendimiento agregado (puntos totales, grupos jugados, mejor reto) y atajo a los rankings por grupo. _v1 puede ser un simple "Tus números" + lista de grupos cerrados; el agregado fino es iterable._
5. **Perfil** (puede vivir en la cabecera): editar `display_name`, avatar, **cerrar sesión**.

### 3.2 Wireframe (ASCII)

```
┌───────────────────────────────────────────────┐
│  LocationGuesser            (avatar) Lewis  ▾   │
│                                                 │
│            [ +  Crear grupo ]                   │  ← acción primaria
│                                                 │
│  🔔 Te toca jugar                               │
│  ┌───────────────────────────────────────────┐ │
│  │ Interrail '26 · reto de Ana   ⏳ 3 h 12 m │ │
│  │                                  [ Jugar ]│ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  👥 Tus grupos                                  │
│  ┌───────────────────────────────────────────┐ │
│  │ Interrail '26     🟡 Te toca        👑 Tuyo│ │
│  ├───────────────────────────────────────────┤ │
│  │ Finde Lisboa      🔴 En vivo               │ │
│  ├───────────────────────────────────────────┤ │
│  │ Pirineos          ⚪ Al día                │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  🏆 Tus números                                 │
│  └ 12 480 pts · 3 grupos · mejor: 4 932 (Lisboa)│
└───────────────────────────────────────────────┘
```

### 3.3 Estados vacíos (usuario nuevo)

Buen estado vacío = **explica por qué está vacío + UNA acción clara**, y ayuda a entender el producto. [[Eleken](https://www.eleken.co/blog-posts/empty-state-ux)] [[useronboard](https://www.useronboard.com/onboarding-ux-patterns/empty-states/)]

```
┌───────────────────────────────────────────────┐
│            👋  ¡Bienvenido, Lewis!              │
│                                                 │
│   Aún no tienes grupos. Un grupo es un grupo    │
│   donde tú y tus amigos os retáis a adivinar    │
│   sitios en el mapa.                            │
│                                                 │
│            [ +  Crear mi primer grupo ]         │
│                                                 │
│   ¿Te han pasado un enlace? Ábrelo y entrarás   │
│   al grupo automáticamente.                     │
└───────────────────────────────────────────────┘
```

Microcopys de vacío: sección *Te toca jugar* vacía → no se muestra. *Tus grupos* vacío → bloque de bienvenida de arriba. *Históricos* vacío → _"Cuando juegues tu primer reto, aquí verás tus puntos."_

### 3.4 Navegación (home ↔ grupo ↔ jugar)

```
        ┌──────── HOME (raíz con sesión) ────────┐
        │  Crear grupo → (nuevo grupo) → GRUPO    │
        │  Tarjeta de grupo ───────────► GRUPO    │
        │  "Te toca jugar" ────────────► JUGAR    │
        └─────────────────────────────────────────┘
GRUPO  ──(reto abierto)──► JUGAR ──(votas)──► revelado ──► GRUPO
GRUPO  ──◄ "volver"─────────────────────────────────────► HOME
Entrada por link  #g&c  ──(ver §2: A/C)──► JUGAR (auto-join) o GRUPO
```

- La **home** se sirve en la **raíz sin hash** cuando hay sesión. Con `#g=…` (con o sin `#c=…`) se entra al grupo/reto (auto-join si hace falta).
- En grupo y en jugar, un control **"← Inicio"** vuelve a la home (clave: hoy no existe "inicio", la app empieza en el hash).

---

## 4. Modelo de datos final (conceptual — guía para implementación)

> Conceptual: las columnas/policies exactas las fija el agente de `supabase/**`. Se mantiene `snake_case` en BD/API por convención del repo.

### 4.1 Perfiles / usuarios

`auth.users` (gestionado por Supabase Auth) es la fuente del `user_id` (UUID) y el email. Añadimos un perfil público:

```sql
-- profiles: datos públicos del usuario (1:1 con auth.users)
profiles(
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,          -- nombre/display global (mostrado en rankings)
  avatar_url   text,                    -- opcional
  created_at   timestamptz not null default now()
)
```
- Se crea en el **primer login** (paso de perfil del onboarding, §2) o vía trigger `on auth.users insert`.
- `display_name` **no** necesita ser único globalmente (dos "Lewis" pueden existir); la identidad real es `user_id`. Sí conviene mostrar email/avatar para desambiguar dentro de un grupo si chocan nombres.

### 4.2 Membresía (`group_members`) — "mis grupos"

```sql
group_members(
  group_id   text not null references groups(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'member',   -- 'owner' | 'member'
  joined_at   timestamptz not null default now(),
  primary key (group_id, user_id)
)
```
- **Cómo se entra:** al abrir un link `#g=CODE` con sesión, **upsert** de `(group_id, user_id)` → auto-join (idempotente). El dueño se inserta con `role='owner'` al crear el grupo.
- **"Mis grupos"** = `select group_id from group_members where user_id = auth.uid()`. Resuelve la sección *Tus grupos* de la home sin depender de enlaces guardados.
- `role` redundante con `groups.created_by` para el dueño, pero útil para una futura noción de admins/co-dueños sin tocar el esquema.

### 4.3 `groups`, `challenges`, `votes` — qué cambia

```sql
-- groups: añadir propiedad
groups: + created_by uuid references auth.users(id)   -- dueño del grupo
        ( id text pk, name text, created_at … )        -- resto igual

-- challenges: el creador pasa de "nombre de jugador" a user_id
challenges: created_by  text  →  created_by uuid references auth.users(id)
            ( lat,lng, image_path?, sv_pano_id?, sv_heading?, sv_pitch?,
              guess_seconds?, deadline_at, … )           -- resto igual

-- votes: el votante pasa de player_name a user_id
votes: player_name text  →  user_id uuid references auth.users(id)
       unique (challenge_id, player_name)  →  unique (challenge_id, user_id)
       ( guess_lat,lng, distance_km, points, … )          -- resto igual
```

- **`players` (identidad ligera) DESAPARECE.** Su rol (atribuir votos y sumar puntos a una persona estable) lo asume `auth.users` + `profiles`. No se mapea automáticamente (los datos actuales son de prueba; ver §5).
- **Ranking/histórico por persona** se deriva ahora por `user_id` y se muestra con `profiles.display_name`:
  - Clasificación del grupo: `sum(points) … group by user_id` en los retos del grupo.
  - "Tus números" (home): agregado del usuario sobre todos sus grupos.

### 4.4 Endurecimiento de RLS (de público a solo-auth)

Hoy todo es público (lectura y escritura, validado solo en cliente) [[0001_init.sql](../../supabase/migrations/0001_init.sql)]. Objetivo: **leer y escribir exige sesión; editar/borrar exige ser dueño**, todo a nivel de Postgres con `auth.uid()`. [[Supabase Auth + RLS](https://supabase.com/docs/reference/javascript/auth-signinwithotp)]

| Tabla | SELECT | INSERT | UPDATE/DELETE |
|-------|--------|--------|----------------|
| `profiles` | autenticado (lectura pública de display/avatar dentro de la app) | el propio usuario (`id = auth.uid()`) | solo el propio (`id = auth.uid()`) |
| `groups` | **miembro** del grupo (`exists` en `group_members`) | autenticado (te haces `owner`) | solo **dueño** (`created_by = auth.uid()`) |
| `group_members` | el propio usuario ve sus filas; miembros ven la lista del grupo | el propio usuario (auto-join: `user_id = auth.uid()`) | propio (salir) / dueño (gestionar) |
| `challenges` | **miembro** del grupo | **miembro** del grupo | solo **dueño del grupo** (edita/borra retos) |
| `votes` | **miembro** del grupo (respeta anti-trampas en cliente: pines/ubicación tras votar) | el propio usuario (`user_id = auth.uid()`), 1 por reto | propio |
| Storage `images` | autenticado (retos legacy) | autenticado | — |

- **Anti-trampas + fuga de respuesta:** RLS por membresía cierra el agujero de "cualquiera con la API key ve la respuesta": ahora hay que **ser miembro autenticado** para leer `challenges.lat/lng`. La ocultación pin/ubicación *antes de votar* sigue siendo regla de cliente (como hoy), pero el perímetro ya no es público. (Ocultar la respuesta a un miembro autenticado *antes de votar* a nivel BD sigue requiriendo una Edge Function; queda como mejora futura, no la resuelve este hito.)
- **Realtime** sobre `votes`/`challenges`: respeta RLS, así que los suscriptores deben estar autenticados y ser miembros.

---

## 5. Impacto en lo existente

### 5.1 Pantallas / flujos que cambian

| Pieza actual | Cambio |
|---|---|
| **Identidad** (`IdentityModal`, `useIdentity`, `lib/identity.ts`, `lib/players.ts`) | **Se retira.** El modal nombre+PIN desaparece; lo sustituye el flujo de magic link + paso de perfil. `players.ts`/`ensurePlayer` se elimina; aparece `lib/auth.ts` (sesión) y `lib/membership.ts` (auto-join, mis grupos). |
| **Enrutado** (`lib/route.ts`, `App.tsx`) | Nueva ruta raíz = **home** cuando hay sesión. Sin sesión → pantalla de login (preservando `#g&c` como destino). `parseHash` se mantiene (el deep link sigue siendo `#g=…&c=…`). |
| **CreateGroup** | Al crear, el creador queda como **dueño** (`groups.created_by` + fila `owner` en `group_members`). Accesible desde la home. |
| **CreateChallenge** | `created_by` pasa a `user_id` (de la sesión, no input). Solo el **dueño** del grupo puede crear/editar/borrar retos (UI + RLS). |
| **GroupPage** | Cabecera con **estado** y acciones de **dueño** vs **miembro**. Ranking por `user_id`+`display_name`. Botón "← Inicio". Auto-join al entrar por link si aún no eres miembro. |
| **PlayChallenge** | El voto se atribuye al `user_id` de la sesión (no `player_name`). `unique (challenge_id, user_id)`. Resto del flujo (panorama SV, pin Leaflet, scoring `5000·e^(−km/2000)`) **sin cambios**. |
| **Nueva: Home/Dashboard** | Pantalla nueva (§3): te-toca-jugar, tus grupos, tus números, perfil. |
| **Nueva: Login + paso de perfil** | Pantallas nuevas (§2): email→enlace, "revisa tu correo", primer `display_name`. |

### 5.2 Datos de prueba / legacy

- **Grupos/jugadores/votos actuales = datos de prueba.** Recomendación: **descartar** (truncar) los datos de `players`/`votes`/`challenges` de prueba al migrar, en vez de inventar un mapeo `name → user_id` que no es fiable (el caso real arranca de cero con cuentas). Decisión barata y limpia para un piloto de amigos.
- **Retos SV / legacy con foto:** el esquema de contenido del reto (`sv_pano_id`, `image_path` nullable) **no cambia** [[pivote-streetview.md §5.3](pivote-streetview.md)]; solo cambian `created_by` y la atribución de votos. Si se quisieran conservar retos concretos, se reasignan a un `user_id` real a mano (excepcional).
- **Bucket `images`:** se mantiene (retos legacy con foto).

---

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| **Fricción del primer login** corta el bucle viral del chat (caída en el registro). | Onboarding de 2 toques (email → clic en email); **sesión persistente** (solo molesta una vez); **preservar el deep link** y volver directo a jugar; copy claro "sin contraseñas". [[Descope](https://www.descope.com/blog/post/magic-link-email-templates)] [[Baytech](https://www.baytechconsulting.com/blog/magic-links-ux-security-and-growth-impacts-for-saas-platforms-2025)] |
| **Email no llega / va a spam.** | Reenviar visible, cambiar email, copy "revisa spam"; caducidad clara; (futuro) dominio de envío propio. |
| **Rebote en el handoff app→email→app** (pierde el destino). | Guardar `lg.next` (destino `#g&c`) antes de pedir el email y restaurarlo al volver; usar `emailRedirectTo` con el destino. [[Supabase](https://supabase.com/docs/reference/javascript/auth-signinwithotp)] |
| **Migración rompe lo existente.** | Datos actuales son de prueba → se descartan (§5.2); el esquema de contenido del reto no cambia. |
| **AiTM / robo de link** (amenaza 2026). | Caducidad corta del enlace; un solo uso; (futuro) device-binding. [[Baytech](https://www.baytechconsulting.com/blog/magic-links-ux-security-and-growth-impacts-for-saas-platforms-2025)] |
| **Choque de `display_name` dentro de un grupo.** | `user_id` es la identidad; desambiguar en UI con avatar/inicial; permitir editar display. |

---

## 7. Métricas para validar el hito

- **% que completa el registro al llegar por link** (visitantes flujo A que terminan con sesión) — la métrica nº1: mide si la fricción mata el bucle.
- **Tiempo medio link→jugando** (abrir reto → primer voto).
- **% de reenganche fuera del chat:** sesiones que entran por la **home** (sin hash) / total.
- **Tasa de auto-join correcto** (entrar por link y quedar como miembro sin error).
- **Retención entre grupos:** usuarios con ≥2 grupos.

---

## 8. Plan de implementación (desglose en piezas/áreas para paralelizar)

> El orquestador crea las issues (este doc **no** las crea). Cada pieza = **un área disjunta** del playbook [[always.md §1](../../.claude/rules/always.md)] para lanzar agentes en paralelo sin pisarse. Apetito en semanas (estilo Shape Up: impacto + apetito, no estimación).

| # | Pieza (slice) | Área (disjunta) | Prioridad | Apetito | Depende de |
|---|----------------|------------------|-----------|---------|-----------|
| **0** | **Rediseño visual / sistema de pantallas** (tokens y layout de Home, Login, paso de perfil, cabeceras de grupo dueño/miembro; sin lógica de auth aún — pantallas mockeadas) | `web/src/ui` + `index.css` | **P0** | ~1 sem | — |
| **1** | **Datos: membresía + propiedad + RLS solo-auth** (migración: `profiles`, `group_members`, `groups.created_by`, `challenges.created_by→uuid`, `votes.user_id`, drop `players`; policies `auth.uid()`; regenerar `database.types.ts`) | `supabase/**` | **P0** | ~1–1.5 sem | — |
| **2** | **Cliente de auth + sesión** (Supabase Auth magic link: `lib/auth.ts`, provider de sesión, persistencia, `emailRedirectTo`, guard de rutas; retira `lib/identity.ts`/`players.ts`) | `web/src/lib` | **P0** | ~1 sem | 1 |
| **3** | **Home / dashboard UI** (te-toca-jugar, tus grupos con estado, tus números, perfil, estados vacíos §3) | `web/src/features` (+ piezas de UI de #0) | **P0** | ~1–1.5 sem | 0, 1, 2 |
| **4** | **Onboarding + deep-link join** (pantalla login con/sin link, "revisa tu correo", paso de perfil 1er login, preservar y restaurar `#g&c`, auto-join `group_members`) | `web/src/features` + `App.tsx`/`lib/route.ts` | **P0** | ~1 sem | 1, 2 |
| **5** | **Migrar pantallas existentes a user_id** (CreateGroup→owner, CreateChallenge `created_by` uuid + gate dueño, GroupPage dueño/miembro + ranking por user_id, PlayChallenge voto por user_id) | `web/src/features` | **P0** | ~1–1.5 sem | 1, 2 |
| **6** | **Históricos/ranking agregado por persona** ("Tus números" fino, rankings por grupo con `display_name`) | `web/src/lib` + `web/src/features` | **P1** | ~0.5 sem | 1, 5 |
| **7** | **Config + docs + verificación** (Supabase Auth en dashboard: redirect URLs prod+localhost, plantilla email; `CLAUDE.md` estado; smoke E2E del login con magic link en local) | `docs/**`, `.claude/**`, `.github/**` | **P1** | ~0.5 sem | 2, 4 |

**Orden / dependencias sugerido:**

```
(0 rediseño visual)  ∥  (1 datos+RLS)        ← pueden ir en paralelo desde el inicio
        │                    │
        └────────┬───────────┴── (2 cliente auth)
                 │                     │
        (3 home) ∥ (4 onboarding) ∥ (5 migrar pantallas)   ← paralelos tras 1+2
                       │
                 (6 ranking)  →  (7 config+docs+E2E)
```

- **Empezar ya en paralelo:** #0 (UI/visual) y #1 (datos+RLS) no se pisan ni se bloquean.
- **#2 (cliente auth)** es el cuello: lo desbloquea #1; lo necesitan #3, #4 y #5.
- **#3, #4, #5** tocan los tres `features` distintos (home / onboarding / pantallas existentes) — repartibles, pero coordinar en `App.tsx`/`route.ts` (lo concentra #4).
- **#6 y #7** cierran (ranking fino + config Supabase Auth + docs + E2E).

---

## 9. Resumen de la decisión (TL;DR)

- **Qué:** cuentas para todos, login obligatorio **magic link** (passwordless), **perfil global** (`display_name`+avatar), **home/dashboard** como raíz, **membresía** (`group_members`) y **propiedad** (`created_by`). Adiós a nombre-por-grupo + PIN.
- **Por qué ahora:** la identidad ligera no es portable ni fiable, no hay "mis grupos" ni propiedad; el siguiente salto (retención, grupos, permisos) lo exige. Se acepta la fricción del primer login a cambio de identidad real.
- **Cómo no duele:** sesión persistente (molesta 1 vez), deep-link que devuelve al reto, onboarding de 2 toques, estados vacíos que guían.
- **Coste estructural:** RLS pasa de público a solo-auth/dueño; `players` desaparece; votos y `created_by` pasan a `user_id`. Datos actuales = prueba → se descartan.

---

## 10. Nota de coherencia documental (para el orquestador)

- Este documento es la **fuente de verdad** de identidad/sesiones/home.
- `docs/estrategia/identidad-y-sesiones.md` (decisión "no login aún") queda **OBSOLETO** y debe **borrarse o reducirse a un puntero** a este doc al integrarse en `main` (hoy vive en otra rama/worktree, fuera de esta).
- Conviene enlazar este doc desde la tabla de estado de `CLAUDE.md` y actualizar la fila "Push real, login real, privacidad" (área `.claude/**`/`docs/**`; el orquestador decide).
- `prueba-de-un-dia.md §4 (Identidad sin login)` y `§9` quedan **superados** por este hito en lo relativo a identidad; el resto (modelo de juego, relojes, anti-trampas, SV) sigue vigente.

---

### Fuentes

- Magic link / onboarding sin fricción: [Descope — Magic Link Email Templates](https://www.descope.com/blog/post/magic-link-email-templates) · [LoginRadius — Passwordless magic links](https://www.loginradius.com/blog/identity/passwordless-authentication-magic-links) · [Baytech — Magic Links: UX, Security & Growth (2025)](https://www.baytechconsulting.com/blog/magic-links-ux-security-and-growth-impacts-for-saas-platforms-2025)
- Estados vacíos / onboarding dashboard: [Eleken — Empty state UX](https://www.eleken.co/blog-posts/empty-state-ux) · [UserOnboard — Empty states](https://www.useronboard.com/onboarding-ux-patterns/empty-states/)
- Supabase Auth (magic link, redirect, RLS con `auth.uid()`): [Supabase — signInWithOtp](https://supabase.com/docs/reference/javascript/auth-signinwithotp)
- Internas: [prueba-de-un-dia.md](prueba-de-un-dia.md) · [pivote-streetview.md](pivote-streetview.md) · [aterrizaje-producto.md](aterrizaje-producto.md) · [0001_init.sql](../../supabase/migrations/0001_init.sql) · [identity.ts](../../web/src/lib/identity.ts) · [route.ts](../../web/src/lib/route.ts) · [always.md](../../.claude/rules/always.md)
