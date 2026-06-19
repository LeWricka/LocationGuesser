# LocationGuesser — Prueba de un día (v0.2)

**Fecha:** 19 junio 2026 · **Estado:** diseño cerrado (grill-me completo), listo para construir

> Objetivo: que el grupo juegue **hoy** un reto real, con persistencia, **histórico en tiempo real** y **clasificación general del viaje**, quitando todas las barreras posibles (web, sin instalar nada, sin login real, compartir por enlace).

---

## 1. Qué cambia respecto a v0.1

v0.1 era web estática, sin backend, reto en el `#hash`. No persiste nada (ni histórico, ni votos, ni imagen). v0.2 añade **persistencia real, histórico en vivo y clasificación de viaje**, manteniendo cero fricción social. Consecuencia: se rompe la "regla dura: sin backend" del v0.1 (ya actualizada en `CLAUDE.md`).

---

## 2. Decisiones de arquitectura

| Decisión | Elección |
|----------|----------|
| Referencia Sunner | Estándares + skills **ligeros** (Prettier/ESLint/tsconfig, Conventional Commits, estructura por features). Saltamos lo pesado (DI, migraciones formales, codegraph, mutation testing, proceso de epics). |
| Front | **React + Vite + TypeScript**, en `web/`. v0.1 se archiva en `legacy/v0.1/` (reutilizamos haversine, scoring, parser, pines, CSS). |
| Datos | **Supabase**: Postgres + Realtime + Storage + Edge Functions. **Sin backend propio.** |
| Hosting | Front estático en **Vercel**. Datos en Supabase. |
| Commits | **Conventional Commits en español** (estilo Sunner). |

---

## 3. Modelo de juego (decidido en el grill)

- **Asíncrono.** No hay sala en vivo; cada uno juega cuando ve el mensaje. Fiel al caso real, sin coordinar.
- **Grupo = código en el enlace** (`#g=…`, "el viaje"). Todos los enlaces del grupo lo arrastran → comparten histórico y clasificación. Grupo nuevo = código nuevo. Sin cuentas.
- **Dos relojes**, los dos definidos por el creador:
  - **Plazo del reto** (`deadline_at`): hasta cuándo se puede contestar. Presets `1h / 4h / fin del día (default)`. "Fin del día" = medianoche del creador, congelada al crear, guardada como timestamp absoluto.
  - **Tiempo por jugada** (`guess_seconds`): al abrir, un **pop-up a pantalla completa tapa todo** con botón **"Empezar"**; al tocarlo arranca tu cuenta atrás. Presets `1 / 2 / 3 min + sin límite`. El `start_at` se persiste en `localStorage` (recargar no regala tiempo). Al agotarse → revelado automático.

### Regla anti-trampas (clave)
| Momento | Qué ves |
|---|---|
| **Antes de votar** | Nombres de quién ya jugó **y sus puntos/nota**. NO ves pines ni la 🎯 ubicación real (los puntos no revelan la ubicación → seguro). |
| **Después de votar** (o agotado tu tiempo) | Todo: ubicación real, pines de todos, distancias y ranking del reto. |

---

## 4. Identidad (sin login)

- **Identidad global del navegador**, no por grupo. `localStorage` guarda `client_id` + `name` + `pin_hash` y vale para *todos* los grupos.
- **Con localStorage** → te unes a cualquier grupo (nuevo o no) **sin pedir nada**; insertamos tu fila en `players` de ese grupo. Cero login.
- **Navegador limpio** → única vez: tecleas nombre + **PIN de 4 dígitos**. Nombre libre → lo creas. Nombre existente → metes el PIN para recuperar nombre y `client_id`.
- **Nombre único por grupo** (constraint `(group_id, name)`). Choque raro (tu nombre global ya lo tiene otro en ese grupo) → eliges otro nombre solo para ese grupo.
- **La identidad estable es el NOMBRE**, no el dispositivo: votos por `(group_id, challenge_id, name)`; clasificación general suma por `name`. Si recuperas tu nombre en otro móvil, conservas tus puntos.
- **Candado blando, no seguridad real:** sin backend, el `pin_hash` es legible y un PIN de 4 dígitos se fuerza fácil. Frena el robo casual entre amigos. Upgrade real (next) = Supabase Auth.

---

## 5. Imagen

- La **sube el creador** al crear; se guarda en Storage; el `image_path` va en la fila → la foto viaja con el enlace (todos ven la misma).
- **Comprimir/redimensionar en cliente** (~1600px, JPEG ~0.8) antes de subir.
- **Estripar EXIF vía `canvas`** (la recompresión lo elimina) → no filtra el GPS de la foto (= la respuesta). No opcional.
- Imagen obligatoria, una por reto.

---

## 6. Selección del punto

Métodos (todos con respaldo entre sí): **clic** · **GPS** · **búsqueda Nominatim** · **pegar URL de Google Maps**.
- URLs largas + coordenadas pegadas → parser en el front (`@lat,lng`, `?q=`, `!3d!4d`).
- **Enlaces cortos** (`maps.app.goo.gl`) → **Edge Function** que sigue la redirección y devuelve `lat/lng` (free tier, stateless, ~0 €). Desbloquea el flujo natural de "Compartir" en móvil.

---

## 7. Histórico y clasificaciones

Página del grupo (`#g=…`), de arriba abajo:
1. **🏆 Clasificación general del viaje** — **suma** de puntos por jugador en todos los retos del grupo, en vivo. (Suma, no media: premia participar = enganche.)
2. **🔴 En vivo ahora** — retos abiertos, marcador con puntos (sin pines hasta jugar).
3. **📁 Anteriores** — retos cerrados, reconstruibles (foto + ubicación real + pines + votos).

**Notificaciones:** en-página vía Realtime hoy (toast "X acaba de votar" + marcador en vivo). Push real (app cerrada) → next (necesita service worker + Web Push + VAPID, y PWA en iPhone).

---

## 8. Modelo de datos (Supabase)

- **groups**: `id` (código), `created_at`.
- **players**: `group_id`, `name`, `client_id`, `pin_hash`, `created_at` · unique `(group_id, name)`.
- **challenges**: `id`, `group_id`, `title`, `lat`, `lng`, `image_path`, `guess_seconds` (null=sin límite), `deadline_at`, `created_at`, `created_by`.
- **votes**: `id`, `group_id`, `challenge_id`, `player_name`, `guess_lat`, `guess_lng`, `distance_km`, `points`, `created_at` · unique `(challenge_id, player_name)`.
- **Storage** bucket `images`. **Realtime** sobre `votes`. **RLS**: lectura pública; escritura pública validada en cliente (candado blando).

---

## 9. Riesgos asumidos (conscientes, para "next" si el bucle engancha)

- **Fuga de la respuesta:** sin backend, `lat/lng` del reto es legible vía API pública → un técnico puede ver la respuesta sin votar. Aceptado (grupo de amigos). Mitigación: Edge Function que no devuelve la respuesta hasta votar.
- **Candado de identidad blando** (PIN forzable). Upgrade: Supabase Auth.
- **Enlaces cortos ~90% fiables** (intersticiales de Google). Respaldo: GPS/clic.
- **Identidad por nombre**: dos personas en un móvil = uno; borrar datos sin recordar el nombre = identidad nueva.
- **Sin push real** hoy.

---

## 10. Fuera de alcance hoy (next)

Login real (Supabase Auth), push notifications, privacidad/borrosidad de ubicación, app/PWA, edición de retos, varios viajes por grupo, mitigación de la fuga de respuesta, date-picker de hora exacta para el plazo.
