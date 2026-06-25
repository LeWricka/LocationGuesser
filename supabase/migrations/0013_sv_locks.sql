-- 0013_sv_locks — candados de exploración del Street View (dificultad por reto).
-- ════════════════════════════════════════════════════════════════════════════
-- Permite al crear un reto con Street View limitar cuánto puede explorar el
-- jugador, en dos ejes independientes:
--   · MOVIMIENTO — ir a panoramas contiguos (flechas / clic para avanzar).
--   · GIRO — mirar alrededor (pan del POV).
--
-- Semántica `false = permitido` a propósito: el DEFAULT deja AMBOS ejes abiertos,
-- así que los retos EXISTENTES quedan totalmente explorables (comportamiento
-- actual intacto). El creador "quita" libertad poniendo el candado a true.
--
-- Aditiva con defaults: aplicar ANTES de mergear el código que las lee
-- (CHALLENGE_COLUMNS_NO_ANSWER las pide en el SELECT de jugar).
alter table public.challenges
  add column sv_lock_move boolean not null default false,
  add column sv_lock_rotate boolean not null default false;
