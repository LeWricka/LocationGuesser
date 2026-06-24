# Crear reto guiado por dificultad

**Fecha:** junio 2026 · **Issue:** [#163](https://github.com/LeWricka/LocationGuesser/issues/163) · **Estado:** implementado
**Origen:** OST §8 / I14 — "Modos de juego (dificultad, pistas, solo-foto vs SV)" de [propuestas-mejoras.md](propuestas-mejoras.md).

> Reemplaza el flujo antiguo de crear reto (que obligaba a empezar por Street View y bloqueaba sin cobertura) por uno guiado por DIFICULTAD, que es la combinatoria de los medios que ya soporta el play.

---

## 1. Modelo de fondo

Un reto = dos cosas:

1. Una **respuesta** lat/lng OCULTA (la que puntúa; vive en `challenge_answers`, gobernada por RLS).
2. Lo que **ven los participantes**: foto y/o Street View.

La **dificultad** = cuánta información ven. No es una columna nueva: se **deriva** de qué medios tiene el reto (`sv_pano_id` y/o `image_path`). El play ya resuelve los 3 medios vía `sceneMedium` (Street View manda sobre la foto si hay ambos). **No hay cambio de modelo de datos.**

La fuente de verdad de esa derivación es `web/src/lib/difficulty.ts`.

---

## 2. Las 3 dificultades

| Dificultad | Medios | Qué ven los participantes |
|---|---|---|
| 🟢 **Fácil** | Foto + Street View | "Les das una foto y pueden explorar el mapa de calles." |
| 🟡 **Medio** | Solo Street View | "Exploran el panorama; sin foto." |
| 🔴 **Difícil** | Solo foto | "Una foto y a ojo, sin explorar." |

Regla dura: un reto debe mostrar **al menos** foto o Street View (`medium != 'none'`). Se valida antes de avanzar a la previa y antes de guardar (`isValidMedia`).

---

## 3. El flujo (3 pasos)

**Paso 1 — Elegir dificultad.** Tres tarjetas (`DifficultyPicker`) con la dificultad y una frase de qué verán los demás. Al pulsar, se entra en el flujo enfocado de esa dificultad.

**Paso 2 — Montar el reto** (depende de la dificultad):

- **🟢 Fácil (foto + SV):**
  1. Subir foto → leer **GPS del EXIF** del File ORIGINAL (antes de estriparlo). Con GPS → respuesta = ese punto, **pin ajustable** en el mapa. Sin GPS → _"Esta foto no dice dónde es. Colócala en el mapa."_ (manual).
  2. Buscar Street View en **radio 50 m** de la respuesta (`findPanoramaNear`).
     - Encaja uno cercano → **aviso con confirmación**: _"El Street View más cercano está a N m de tu foto. ¿Lo usamos? [Sí] [No]"_. Sí → Fácil con ese SV. No → recolocar el punto (otra búsqueda) o **quitar Street View** → pasa a 🔴 Difícil (con aviso del cambio).
     - No hay SV en 50 m → _"No hay Street View cerca de la foto. Se creará como 🔴 Difícil (solo foto), o elige otra ubicación."_ (no bloquea nunca).
  3. Botón **"Quitar Street View"** disponible siempre en Fácil → pasa a Difícil; la etiqueta de dificultad se actualiza en vivo.

- **🟡 Medio (solo SV):** elegir punto con cobertura SV (mapa / GPS / búsqueda / URL de Maps). Sin SV → _"No hay Street View aquí; elige otro punto con cobertura."_. Sin foto. `lat/lng` = el punto elegido.

- **🔴 Difícil (solo foto):** subir foto → GPS del EXIF (pin ajustable) o manual si no hay GPS. No se busca ni se muestra SV (aunque exista). `lat/lng` = foto/manual.

Campos comunes: título, duración (slider de 5 min a 48 h), tiempo por jugada.

**Paso 3 — Previa "Así lo verán los participantes"** (`ScenePreview`): render REAL de la escena (Street View con su POV y/o foto, con la misma prioridad que el play) + etiqueta de la dificultad real → botón **Confirmar y crear reto**.

---

## 4. Casuísticas y decisiones

- **La foto es la verdad.** En Fácil/Difícil la respuesta (`lat/lng`) es SIEMPRE el punto de la foto/manual; el panorama es contexto explorable, aunque caiga a ≤50 m de la respuesta (es correcto).
- **Radio 50 m** para encajar el SV a la foto en Fácil (criterio fijo, `SV_NEAR_RADIUS`). Medio usa el radio normal de `findPanorama` (80 m) porque ahí el SV ES el reto.
- **Aviso con confirmación** del SV ajustado (no se adopta en silencio): el creador decide.
- **Sin GPS → manual**, nunca se bloquea. Sin SV cerca → degradación a Difícil, nunca se bloquea.
- **Degradación con aviso:** la dificultad mostrada (`Badge`) refleja siempre el estado REAL (`difficultyFromMedia`), no la elegida. Quitar el SV de un Fácil lo convierte en Difícil al instante.
- **Foto siempre sin EXIF** al subir (pipeline `uploadImage`/`compressAndStripExif`). El GPS se lee del File ORIGINAL antes de estripar (`readGpsFromExif`, import dinámico de `exifr` para no engordar el bundle inicial).
- **Foto en Fácil** se guarda siempre como pista (`photo_is_hint = true`): acompaña al panorama, visible al jugar.

---

## 5. Garantía anti-huérfanos (migración 0012)

La respuesta vive en `challenge_answers` (RLS). Para que **nunca** falte (lo que rompe la RPC `submit_vote`), la 0012 añade:

- Trigger `after insert or update of lat, lng on public.challenges` → función `sync_challenge_answer` (SECURITY DEFINER, `search_path = public`) que hace `insert ... on conflict (challenge_id) do update`. La respuesta se escribe en la MISMA transacción del reto.
- El cliente (`lib/challenges.ts`) escribe `challenge_answers` con **UPSERT idempotente** (`onConflict: 'challenge_id'`) en `createChallenge` y `updateChallenge`, así no choca con el trigger en ningún orden de despliegue (deploy-safe).

---

## 6. Analítica

`track('challenge_created', …)` añade dos propiedades (no son eventos nuevos):

- `difficulty`: `'facil' | 'medio' | 'dificil'` (la dificultad REAL guardada).
- `location_source`: `'exif' | 'manual' | 'maps_url' | 'gps'`.

`has_streetview` / `has_photo` / `photo_is_hint` / `duration_hours` / `guess_seconds` se mantienen.

---

## 7. Ficheros

- `web/src/lib/difficulty.ts` (+ test) — derivación dificultad ↔ medios y regla dura.
- `web/src/lib/exif.ts` (+ test) — lectura del GPS del EXIF (`exifr`, import dinámico).
- `web/src/lib/streetview.ts` (+ test) — `findPanoramaNear` (radio 50 m + distancia en metros).
- `web/src/lib/challenges.ts` (+ test) — upsert idempotente de `challenge_answers`.
- `web/src/features/create/CreateChallenge.tsx` — el asistente de 3 pasos.
- `web/src/features/create/DifficultyPicker.tsx` — paso 1 (las 3 tarjetas).
- `web/src/features/create/ScenePreview.tsx` — paso 3 (previa real, reusa play + UI kit).
- `supabase/migrations/0012_answer_trigger.sql` — trigger anti-huérfanos (pendiente de aplicar).
