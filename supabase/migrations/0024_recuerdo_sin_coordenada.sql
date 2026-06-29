-- ════════════════════════════════════════════════════════════════════════════
-- 0024 — un RECUERDO puede no tener coordenada-respuesta (lat/lng nullable)
-- ════════════════════════════════════════════════════════════════════════════
-- Bug: crear un recuerdo (momento sin reto, `is_challenge = false`) fallaba con
--   «null value in column "lat" of relation "challenges" violates not-null
--   constraint» (23502). Desde 0022 un recuerdo NO lleva respuesta oculta: su
-- lugar visible vive en `place_lat`/`place_lng` y `lat`/`lng` (la RESPUESTA del
-- reto) se quedan sin setear. Pero `challenges.lat`/`lng` seguían siendo NOT NULL
-- (vienen del esquema original, donde toda fila ERA un reto), así que el INSERT de
-- `createMoment` reventaba.
--
-- Arreglo aditivo y seguro: quitar el NOT NULL de `lat`/`lng`. Un RETO siempre las
-- rellena (la capa de juego), así que no le afecta; el trigger `sync_challenge_answer`
-- (0022) solo espeja a `challenge_answers` cuando `is_challenge` y `lat/lng not null`,
-- y `challenge_answers.lat/lng` siguen siendo NOT NULL (un reto siempre tiene respuesta).
-- No hay datos a migrar (hasta ahora toda fila tenía lat/lng por la propia constraint).
-- ════════════════════════════════════════════════════════════════════════════

alter table public.challenges alter column lat drop not null;
alter table public.challenges alter column lng drop not null;
