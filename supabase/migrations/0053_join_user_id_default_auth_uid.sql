-- 0053 — El user_id del auto-join lo pone el SERVIDOR (issue #997, Sentry
-- LOCATIONGUESSER-1N).
--
-- Caso real (grupo 3p2jx3, 13-sep): un receptor entrando por deep link sufrió
-- un 42501 ("new row violates row-level security policy for table
-- group_members") en un SEGUNDO intento de join, 6 segundos después de un join
-- correcto. La RLS `group_members_insert_self` exige `user_id = auth.uid()`,
-- pero `joinGroup()` (cliente) insertaba el user_id del ESTADO de React — que
-- puede quedarse desfasado respecto a la sesión viva si la sesión anónima rota
-- entre render y ejecución (doble signInAnonymously en carrera, refresh del
-- token, volver de segundo plano en iOS).
--
-- Fix: `user_id default auth.uid()` y el cliente DEJA DE MANDAR user_id en el
-- join (mismo criterio de autoridad-servidor que submit_vote: la identidad no
-- viaja desde el cliente). Con el default, el desajuste user_id ≠ auth.uid()
-- se vuelve imposible por construcción para el alta propia; la RLS queda como
-- defensa para cualquier otro camino de escritura.
--
-- Espejo cliente: `joinGroup`/`joinGroupAsOwner` en web/src/lib/membership.ts
-- (dejan de pasar user_id) + `database.types.ts` (Insert.user_id opcional).
--
-- NO aplicar a producción a mano: lo aplica el orquestador.

alter table public.group_members
  alter column user_id set default auth.uid();
