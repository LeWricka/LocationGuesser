-- 0049_fotos_orden_manual — reordenar a mano las fotos de un momento (issue #952)
--
-- La galería de un momento se ordena por `sort_at` (fecha de captura, #951) por
-- DEFECTO. Este flag permite que el dueño arrastre las fotos a un orden propio
-- (`reorderMomentImages` en `web/src/lib/momentImages.ts`, que reasigna
-- `sort_order` 0..N y activa el flag) y volver al orden por fecha cuando
-- quiera (`setPhotosAutoOrder`, lo apaga). Default false: los momentos
-- existentes siguen en orden por fecha, cero regresión.
--
-- No toca RLS: el UPDATE de `challenges` ya es del dueño del grupo (mismo
-- perímetro que `image_path`/`happened_on`), así que el dueño puede tocar este
-- flag igual que el resto de columnas del momento.

alter table public.challenges
  add column if not exists photos_manual_order boolean not null default false;
