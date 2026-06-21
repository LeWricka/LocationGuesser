-- ════════════════════════════════════════════════════════════════════════════
-- 0007 — Voto de TIMEOUT: jugaste pero no te dio tiempo a marcar → 0 puntos
-- ════════════════════════════════════════════════════════════════════════════
-- Antes, si se acababa el tiempo sin colocar pin, NO se guardaba voto → el
-- jugador no quedaba "marcado como jugado" y podía reintentar infinitas veces.
-- Ahora guardamos un voto con points=0 y SIN guess. Para representar "sin pin",
-- guess_lat/guess_lng/distance_km pasan a ser NULLABLE (un voto de timeout los
-- deja en null; un voto normal los rellena). El ranking suma points (0 no suma).
alter table public.votes alter column guess_lat drop not null;
alter table public.votes alter column guess_lng drop not null;
alter table public.votes alter column distance_km drop not null;
