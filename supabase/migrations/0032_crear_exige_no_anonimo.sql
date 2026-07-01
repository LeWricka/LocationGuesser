-- ════════════════════════════════════════════════════════════════════════════
-- 0032 — SEGURIDAD: crear viaje EXIGE cuenta NO anónima (email validado)
-- ════════════════════════════════════════════════════════════════════════════
-- Issue #438 (entrada de baja fricción con validación diferida).
--
-- MODELO NUEVO: entrar = nombre + email → DENTRO al instante como usuario ANÓNIMO
-- con el email PENDIENTE de validar (signInAnonymously + updateUser({email})). Ese
-- usuario puede VER / JUGAR / UNIRSE sin validar, pero NO debe poder CREAR viajes
-- hasta validar su correo (pulsar el enlace → la cuenta pasa a permanente, deja de
-- ser anónima). El cliente muestra un gate amable ("valida tu correo"), pero la
-- SEGURIDAD REAL debe estar en la BD: aquí.
--
-- CÓMO: los usuarios anónimos de Supabase llevan la claim JWT `is_anonymous=true`.
-- Endurecemos `groups_insert_owner` para exigir, además de ser el dueño, que la
-- sesión NO sea anónima. Un anónimo que intente el INSERT (saltándose el gate del
-- cliente) recibe una violación de RLS. En cuanto valida el email, `is_anonymous`
-- pasa a false y el INSERT vuelve a estar permitido.
--
-- coalesce(..., false): si por lo que sea la claim no viene, tratamos como NO
-- anónimo para NO romper a los usuarios YA REGISTRADOS (permanentes) — su JWT no
-- lleva is_anonymous o lo lleva a false. El objetivo es cerrar a los anónimos, sin
-- dejar fuera a nadie con cuenta de verdad.
--
-- ALCANCE: SOLO cambia la policy de INSERT de `groups` (crear viaje). NO toca el
-- resto de policies: unirse (group_members), jugar (votes), ver (select) y crear
-- retos (challenges) siguen permitidos a cualquier autenticado/miembro, anónimo
-- incluido. Un anónimo NO puede crear retos igualmente, porque `challenges` cuelga
-- de un `groups` del que tendría que ser dueño, y no puede llegar a serlo.
--
-- DATA-PRESERVING: solo recrea una policy (drop+create). No mueve datos.
-- NO aplicar a producción a mano: lo aplica el pipeline db-migrate al mergear.
-- PRERREQUISITO DE PROD (lo activa el dueño en el dashboard): Authentication →
-- Sign In / Providers → "Allow anonymous sign-ins" ACTIVADO. Sin eso, la entrada
-- de baja fricción no puede crear la sesión anónima.

drop policy if exists "groups_insert_owner" on public.groups;
create policy "groups_insert_owner" on public.groups
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );
