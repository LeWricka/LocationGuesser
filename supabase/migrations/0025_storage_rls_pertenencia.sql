-- ════════════════════════════════════════════════════════════════════════════
-- 0025 — RLS de Storage `images`: validar PERTENENCIA al grupo (cierre CRÍTICO)
-- ════════════════════════════════════════════════════════════════════════════
-- POR QUÉ (no el qué): las 4 políticas del bucket privado `images` de 0004
-- (líneas 264-271) conceden a CUALQUIER autenticado SELECT/INSERT/UPDATE/DELETE
-- sobre CUALQUIER objeto, con un mero `using (bucket_id = 'images')`. Eso abre un
-- acceso HORIZONTAL entre grupos: un miembro del grupo A puede leer, sobrescribir
-- o borrar las fotos del grupo B con solo conocer el nombre del objeto. Como la
-- foto de un reto puede revelar el sitio (= la respuesta), además es una fuga del
-- secreto del juego. Esta migración cierra ese agujero.
--
-- POR QUÉ el enfoque por JOIN (y no por prefijo de ruta): las imágenes se suben
-- con ruta PLANA `<uuid>.jpg` (web/src/lib/storage.ts) — la ruta NO lleva
-- group_id ni challenge_id, así que no hay prefijo que validar. Re-rutear o mover
-- los objetos ya subidos rompería las imágenes en producción. En su lugar atamos
-- la autorización al dato: `storage.objects.name` coincide con
-- `challenges.image_path` (portada del reto/recuerdo) y con
-- `moment_images.image_path` (galería del recuerdo). Validamos pertenencia con el
-- helper SECURITY DEFINER `public.is_group_member(gid)` (de 0004), que se salta la
-- RLS de group_members y evita recursión. Resultado: compatible con las rutas
-- actuales, SIN tocar ni mover ningún objeto existente.
--
-- IMPACTO (perímetro tras la migración):
--   · Un MIEMBRO del grupo sigue pudiendo leer/firmar URLs de las fotos de SU
--     grupo (la policy SELECT lo permite por el JOIN).
--   · Un usuario de OTRO grupo ya NO puede leerlas ni tocarlas.
--   · Las funciones server-side con service_role (p.ej. futura imagen OG de
--     compartir) NO se ven afectadas: service_role SALTA la RLS.
--   · No toca el bucket público `avatars` (0019): es aparte y no es secreto.
--
-- NO aplicar a producción a mano: lo aplica el pipeline db-migrate al mergear.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Retirar las políticas permisivas de 0004
-- ════════════════════════════════════════════════════════════════════════════
drop policy if exists "images_select_authenticated" on storage.objects;
drop policy if exists "images_insert_authenticated" on storage.objects;
drop policy if exists "images_update_authenticated" on storage.objects;
drop policy if exists "images_delete_authenticated" on storage.objects;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. SELECT — leer solo si el objeto pertenece a un grupo del que eres miembro
-- ════════════════════════════════════════════════════════════════════════════
-- El objeto es legible si su `name` lo referencia o bien la portada de una
-- challenge (challenges.image_path) o bien una foto de galería
-- (moment_images.image_path), y en ambos casos el usuario es miembro del grupo de
-- esa challenge. Cubre tanto la foto del reto como las del recuerdo.
create policy "images_select_member" on storage.objects
  for select to authenticated using (
    bucket_id = 'images'
    and (
      exists (
        select 1
        from public.challenges c
        where c.image_path = storage.objects.name
          and public.is_group_member(c.group_id)
      )
      or exists (
        select 1
        from public.moment_images mi
        join public.challenges c on c.id = mi.challenge_id
        where mi.image_path = storage.objects.name
          and public.is_group_member(c.group_id)
      )
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 3. INSERT — abierto a autenticados (chicken-egg, sin JOIN posible)
-- ════════════════════════════════════════════════════════════════════════════
-- El cliente SUBE el objeto ANTES de crear la fila (challenge / moment_image) que
-- lo referencia, así que en el momento del INSERT no existe nada con qué hacer
-- JOIN. No se puede validar pertenencia aquí. El único riesgo residual es subir
-- objetos HUÉRFANOS (que nunca se referencian) — no da acceso a datos ajenos
-- (SELECT/UPDATE/DELETE sí están cerrados por pertenencia). Es aceptable.
create policy "images_insert_authenticated" on storage.objects
  for insert to authenticated with check (bucket_id = 'images');

-- ════════════════════════════════════════════════════════════════════════════
-- 4. UPDATE / DELETE — solo el creador del reto o el dueño del grupo
-- ════════════════════════════════════════════════════════════════════════════
-- Modificar/borrar un objeto exige que esté referenciado por una challenge (como
-- portada o vía una de sus moment_images) y que quien actúa sea el CREADOR de esa
-- challenge (challenges.created_by = auth.uid()) o el DUEÑO del grupo
-- (groups.created_by = auth.uid()). Esto evita el sabotaje entre miembros: un
-- miembro cualquiera ya no puede sobrescribir o borrar las fotos de otro.
-- (La columna de propiedad del grupo es groups.created_by, confirmado en 0004/0020.)
create policy "images_update_owner" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'images'
    and (
      exists (
        select 1
        from public.challenges c
        where c.image_path = storage.objects.name
          and (
            c.created_by = auth.uid()
            or exists (
              select 1 from public.groups g
              where g.id = c.group_id and g.created_by = auth.uid()
            )
          )
      )
      or exists (
        select 1
        from public.moment_images mi
        join public.challenges c on c.id = mi.challenge_id
        where mi.image_path = storage.objects.name
          and (
            c.created_by = auth.uid()
            or exists (
              select 1 from public.groups g
              where g.id = c.group_id and g.created_by = auth.uid()
            )
          )
      )
    )
  )
  with check (
    bucket_id = 'images'
    and (
      exists (
        select 1
        from public.challenges c
        where c.image_path = storage.objects.name
          and (
            c.created_by = auth.uid()
            or exists (
              select 1 from public.groups g
              where g.id = c.group_id and g.created_by = auth.uid()
            )
          )
      )
      or exists (
        select 1
        from public.moment_images mi
        join public.challenges c on c.id = mi.challenge_id
        where mi.image_path = storage.objects.name
          and (
            c.created_by = auth.uid()
            or exists (
              select 1 from public.groups g
              where g.id = c.group_id and g.created_by = auth.uid()
            )
          )
      )
    )
  );

create policy "images_delete_owner" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'images'
    and (
      exists (
        select 1
        from public.challenges c
        where c.image_path = storage.objects.name
          and (
            c.created_by = auth.uid()
            or exists (
              select 1 from public.groups g
              where g.id = c.group_id and g.created_by = auth.uid()
            )
          )
      )
      or exists (
        select 1
        from public.moment_images mi
        join public.challenges c on c.id = mi.challenge_id
        where mi.image_path = storage.objects.name
          and (
            c.created_by = auth.uid()
            or exists (
              select 1 from public.groups g
              where g.id = c.group_id and g.created_by = auth.uid()
            )
          )
      )
    )
  );
