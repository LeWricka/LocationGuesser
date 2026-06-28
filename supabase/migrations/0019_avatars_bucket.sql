-- 0019_avatars_bucket — bucket PÚBLICO para fotos de perfil (avatares)
-- Issue #240: foto de perfil personalizada (el animal queda como DEFECTO).
--
-- Por qué un bucket aparte y PÚBLICO:
--   · El bucket `images` (retos) es PRIVADO: se sirve con URLs firmadas que
--     CADUCAN, porque la foto del reto puede revelar el sitio (= la respuesta).
--   · El avatar, en cambio, se muestra en clasificación, mapa, header, etc. y
--     necesita una URL ESTABLE que no caduque. La foto de perfil no es secreta.
--   · Por eso vive en su propio bucket público `avatars` y se guarda su URL
--     pública (getPublicUrl) en `profiles.avatar_url`.
--
-- Convención de ruta: `<user_id>/<uuid>.jpg`. El primer segmento de la ruta es
-- el id del usuario, lo que permite que la política de escritura/borrado limite
-- a cada usuario a SU carpeta (storage.foldername(name)[1] = auth.uid()).

-- Bucket público para los avatares.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

do $$
begin
  -- Lectura pública: cualquiera puede ver los avatares (URL estable, no secreta).
  create policy "avatars_read"
    on storage.objects for select
    using (bucket_id = 'avatars');

  -- Subir: solo el propio usuario, y solo dentro de su carpeta `<auth.uid()>/…`.
  create policy "avatars_insert"
    on storage.objects for insert
    with check (
      bucket_id = 'avatars'
      and auth.uid()::text = (storage.foldername(name))[1]
    );

  -- Actualizar/borrar: igualmente acotado a la carpeta del propio usuario, para
  -- poder reemplazar o limpiar su avatar sin tocar el de otros.
  create policy "avatars_update"
    on storage.objects for update
    using (
      bucket_id = 'avatars'
      and auth.uid()::text = (storage.foldername(name))[1]
    )
    with check (
      bucket_id = 'avatars'
      and auth.uid()::text = (storage.foldername(name))[1]
    );

  create policy "avatars_delete"
    on storage.objects for delete
    using (
      bucket_id = 'avatars'
      and auth.uid()::text = (storage.foldername(name))[1]
    );
exception when duplicate_object then null;
end $$;
