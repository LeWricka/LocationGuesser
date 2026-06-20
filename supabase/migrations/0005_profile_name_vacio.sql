-- ════════════════════════════════════════════════════════════════════════════
-- 0005 — El perfil nuevo nace SIN nombre (vacío), no con el trozo del email
-- ════════════════════════════════════════════════════════════════════════════
-- handle_new_user (0004) ponía como display_name provisional el texto antes de
-- la "@" del email. Eso obligaba al cliente a adivinar "¿ya eligió nombre?"
-- comparando con ese provisional, y dejaba ATRAPADO en bucle a quien su nombre
-- coincidía con el prefijo del email (p.ej. "iker" en iker@…): guardaba el
-- nombre, seguía pareciendo provisional y se le volvía a pedir.
--
-- Solución: el perfil nuevo nace con display_name VACÍO si el magic link no trajo
-- uno. Así el cliente muestra el paso de perfil sólo cuando el nombre está vacío
-- (needsProfileStep), y en cuanto el usuario guarda CUALQUIER nombre, deja de
-- pedirse. (display_name es NOT NULL → usamos '' en vez de NULL.)

create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
