-- 0002_streetview — el reto puede ser una ubicación de Street View (pivote a GeoGuessr)
-- Diseño: docs/estrategia/pivote-streetview.md

alter table public.challenges
  add column if not exists sv_pano_id text,
  add column if not exists sv_heading double precision,
  add column if not exists sv_pitch double precision;

-- `image_path` ya era nullable; se mantiene para los retos antiguos (foto) y
-- para un posible modo híbrido foto/Street View.
