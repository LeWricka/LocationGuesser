-- 0048_fecha_gps_captura_fotos — guardar fecha/GPS de captura (EXIF) y ordenar por fecha
--
-- BUG de producto (issue #950): al subir fotos entre varios en un viaje casi a
-- la vez, la galería sale DESORDENADA porque hoy se ordena por `sort_order` =
-- orden de SUBIDA, no de CAPTURA. El EXIF de la foto trae la fecha/hora real
-- (y a veces el GPS), pero se pierde como efecto secundario de la compresión a
-- canvas (`compressAndStripExif` en `web/src/lib/storage.ts`). Fix: leer el
-- EXIF del archivo ORIGINAL antes de comprimir (`readPhotoMetaFromExif` en
-- `web/src/lib/exif.ts`) y guardar esos datos en columnas nuevas; la imagen
-- subida SIGUE comprimida/sin EXIF, no se reinyecta nada en el archivo.
--
-- `taken_at`/`gps_lat`/`gps_lng` nullable: muchas fotos NO traen EXIF
-- (capturas de pantalla, reenvíos de WhatsApp, descargas) y ahí no hay fecha
-- ni GPS que leer.
--
-- `sort_at` es la clave de orden: fecha de captura si la hay, si no la hora de
-- subida (`created_at`, el comportamiento de HOY). Columna GENERADA — no la
-- escribe el cliente, solo sirve para `order by sort_at` en las galerías.
--
-- No toca RLS (mismo perímetro que las políticas de 0044/0045).

alter table public.moment_images
  add column if not exists taken_at timestamptz,
  add column if not exists gps_lat double precision,
  add column if not exists gps_lng double precision;

alter table public.moment_images
  add column if not exists sort_at timestamptz
  generated always as (coalesce(taken_at, created_at)) stored;

-- Listado de la galería de un momento en orden CRONOLÓGICO (sort_at asc).
create index if not exists moment_images_challenge_sort_at_idx
  on public.moment_images (challenge_id, sort_at);
