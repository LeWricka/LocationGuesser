-- 0004_auth_ownership — modelo HÍBRIDO de auth.
-- Diseño: el CREADOR de un grupo tiene cuenta (login). Su user_id queda como
-- dueño en `groups.created_by`. Solo el dueño puede editar/borrar el grupo y
-- crear/editar/borrar SUS retos. Los JUGADORES invitados NO tienen cuenta:
-- entran por el link y juegan con identidad ligera (nombre + PIN). Por eso
-- leer grupos/retos y votar/crear jugador siguen siendo PÚBLICOS (sin auth);
-- meter login a los jugadores mataría el bucle social.
--
-- Agnóstico al método de login: magic link y OAuth Google crean ambos filas
-- en auth.users, así que `created_by uuid` + `auth.uid()` valen para los dos.
--
-- ⚠️ ORDEN DE DESPLIEGUE (lo coordina el orquestador):
--   1) Mergear y desplegar primero la UI de login (otro PR), de modo que el
--      cliente ya mande sesión al crear grupos/retos.
--   2) DESPUÉS aplicar esta migración.
-- Si se aplican estas policies de escritura ANTES de que el cliente tenga
-- sesión, se rompe la creación de grupos/retos en prod (hoy no hay login).

-- 1) Columna de dueño. `default auth.uid()` rellena el dueño automáticamente
-- en cada INSERT con sesión, sin que el cliente tenga que setearlo a mano.
-- references auth.users con on delete set null: si se borra la cuenta, el
-- grupo queda huérfano en vez de desaparecer (no perdemos el viaje del grupo).
alter table public.groups
  add column if not exists created_by uuid references auth.users (id) on delete set null default auth.uid();

-- 2) RLS por dueño.
-- Tradeoff sobre grupos LEGACY (created_by IS NULL, creados antes de auth):
-- los tratamos como "de transición" y permitimos editarlos/gestionar sus retos
-- a CUALQUIER usuario autenticado mientras no tengan dueño. Es lo más simple y
-- no brica los datos de prueba existentes; el riesgo es bajo porque para
-- escribir hace falta sesión (un invitado anónimo no puede). Alternativa
-- descartada por compleja: una migración de datos que adopte los grupos
-- existentes a un dueño concreto. Cuando ya no queden grupos legacy se puede
-- endurecer quitando la rama `created_by is null`.

-- groups: la lectura pública ya existe (0001 "groups_read"). El INSERT público
-- de 0001 ("groups_write") deja de servir al modelo de dueño, así que lo
-- sustituimos por uno que exija que el dueño sea el usuario en sesión.
drop policy if exists "groups_write" on public.groups;
create policy "groups_insert_owner" on public.groups
  for insert
  with check (auth.uid() = created_by);

create policy "groups_update_owner" on public.groups
  for update
  using (auth.uid() = created_by or created_by is null)
  with check (auth.uid() = created_by or created_by is null);

create policy "groups_delete_owner" on public.groups
  for delete
  using (auth.uid() = created_by or created_by is null);

-- challenges: SELECT sigue público (0001 "challenges_read"). Escritura solo si
-- el grupo pertenece al usuario (o es legacy sin dueño). Sustituimos el INSERT
-- público de 0001 ("challenges_write") y añadimos UPDATE/DELETE.
drop policy if exists "challenges_write" on public.challenges;
create policy "challenges_insert_owner" on public.challenges
  for insert
  with check (
    exists (
      select 1 from public.groups g
      where g.id = challenges.group_id
        and (g.created_by = auth.uid() or g.created_by is null)
    )
  );

create policy "challenges_update_owner" on public.challenges
  for update
  using (
    exists (
      select 1 from public.groups g
      where g.id = challenges.group_id
        and (g.created_by = auth.uid() or g.created_by is null)
    )
  )
  with check (
    exists (
      select 1 from public.groups g
      where g.id = challenges.group_id
        and (g.created_by = auth.uid() or g.created_by is null)
    )
  );

create policy "challenges_delete_owner" on public.challenges
  for delete
  using (
    exists (
      select 1 from public.groups g
      where g.id = challenges.group_id
        and (g.created_by = auth.uid() or g.created_by is null)
    )
  );

-- votes y players: NO se tocan. Sus policies de 0001 (SELECT e INSERT públicos,
-- y el UPDATE público de players) se mantienen, porque los jugadores NO tienen
-- sesión y deben poder votar y crear/actualizar su identidad ligera sin login.
