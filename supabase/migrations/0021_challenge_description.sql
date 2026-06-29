-- ════════════════════════════════════════════════════════════════════════════
-- 0021 — descripción del día en los retos
-- ════════════════════════════════════════════════════════════════════════════
-- Añade una "descripción del día" opcional a cada reto: un texto libre que el
-- creador puede escribir para contextualizar la foto/Street View ("día 3, ruta
-- por los fiordos…"). Es contenido editorial, no afecta a la mecánica de juego.
--
-- ADITIVO, no rompe el front actual: la columna es `text` NULLABLE y sin default.
-- Los retos existentes quedan con description = null y los inserts del cliente
-- actual (que no manda este campo) siguen funcionando igual. Compatible hacia
-- atrás en ambos sentidos (front viejo ⇄ esquema nuevo).
--
-- ESCRITURA POR EL CREADOR — NO hace falta policy nueva:
--   La RLS de UPDATE de `challenges` la define 0004 (`challenges_update_owner`):
--   permite UPDATE de la FILA ENTERA al DUEÑO DEL GRUPO (created_by = auth.uid()
--   sobre groups). Esa policy es a nivel de fila (no de columna), así que la
--   nueva columna `description` queda automáticamente cubierta: el dueño puede
--   escribirla en el mismo UPDATE. Revisado: ninguna migración posterior
--   (0010, 0011, 0020) la elimina ni la restringe. El SELECT lo cubre
--   `challenges_select_member` (0004). Por eso aquí NO tocamos policies:
--   recrearlas solo añadiría riesgo sin aportar nada.
--
-- NO aplicar a producción desde aquí: lo coordina el pipeline / el orquestador.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. challenges.description — texto libre opcional del reto (null = sin descripción)
-- ════════════════════════════════════════════════════════════════════════════
alter table public.challenges
  add column if not exists description text;
