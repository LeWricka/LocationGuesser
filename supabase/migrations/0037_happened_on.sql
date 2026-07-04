-- ════════════════════════════════════════════════════════════════════════════
-- 0037 — HAPPENED_ON: la fecha ELEGIDA del recuerdo como dato de primera clase
-- ════════════════════════════════════════════════════════════════════════════
-- Issue #566. Al crear un recuerdo el dueño elige una fecha (el DatePicker de
-- "Nuevo recuerdo"), pero hasta hoy esa fecha NO se guardaba en ningún sitio
-- estructurado: solo quedaba, si acaso, incrustada como texto sin año en la
-- descripción (`📅 8 de abril · ...`), y el diario ordenaba por `created_at`
-- (cuándo se SUBIÓ el recuerdo, no cuándo OCURRIÓ). Un grupo que rellena su
-- diario días después del viaje (backfill) veía sus recuerdos mal ordenados,
-- porque `created_at` de todos ellos caía el mismo día (hoy), sin relación con
-- la fecha real que eligieron.
--
-- `happened_on` es una fecha PURA (sin hora ni huso): el dueño piensa en un
-- DÍA, no en un instante. Guardarla como `date` (no `timestamptz`) evita
-- arrastrar una hora arbitraria que no significa nada y que además complicaría
-- el desempate/orden entre recuerdos del mismo día.
--
-- DATA-PRESERVING y BACKWARD-COMPATIBLE: columna nullable sin default; todos
-- los momentos existentes quedan con `happened_on = null` (sin backfill
-- destructivo). El cliente cae a `created_at` cuando `happened_on` es null
-- (ver `Moment.date`, `web/src/lib/trip.ts`, y el orden del diario en
-- `useTripData.ts`) — mismo criterio de "columna nueva, fallback al dato de
-- siempre" que `audio_path`/`video_path` (0035/0036).
--
-- NO es spoiler: la fecha de un recuerdo no revela la ubicación oculta de un
-- reto. Entra en `CHALLENGE_COLUMNS_NO_ANSWER` del cliente (mismo criterio que
-- `audio_path`/`time_scoring`, 0035/0034), se sirve siempre, en recuerdo y reto.
--
-- NO aplicar a producción a mano: lo aplica el orquestador/dueño tras el merge
-- (workflow `db-migrate`, ver docs/migraciones-automaticas.md — regla de 2
-- fases: esta migración va en la MISMA PR que el front que la usa porque es
-- puramente aditiva y el front tolera `happened_on = null`).

alter table public.challenges
  add column if not exists happened_on date;

comment on column public.challenges.happened_on is
  'Fecha ELEGIDA por el dueño del momento (sin hora, sin huso): cuándo OCURRIÓ '
  'el recuerdo, no cuándo se subió (eso es created_at). Null = momento legado '
  'anterior a esta migración o creado sin fecha (cae a created_at como proxy). '
  'No es spoiler: se sirve siempre, en recuerdo y en reto. Migración 0037 (#566).';
