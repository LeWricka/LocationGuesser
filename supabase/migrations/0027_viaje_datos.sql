-- ════════════════════════════════════════════════════════════════════════════
-- 0027 — datos del viaje: fechas, descripción, acompañantes y portada
-- ════════════════════════════════════════════════════════════════════════════
-- Enriquece la creación de un viaje (grupo) con contexto opcional que el creador
-- rellena al arrancar: cuándo es (rango de fechas), de qué va (descripción),
-- con quién va (texto libre de acompañantes) y una portada para reconocerlo.
-- Todo es CONTENIDO editorial: no afecta a la mecánica de juego ni a la
-- pertenencia (los miembros reales entran por el enlace; `companions` es solo un
-- texto informativo, no un sistema de invitación).
--
-- ADITIVO, no rompe el front actual: las columnas son NULLABLE y sin default.
-- Los grupos existentes quedan con estos campos a null y los inserts del cliente
-- actual (que solo manda id/name/created_by) siguen funcionando igual.
-- Compatible hacia atrás en ambos sentidos (front viejo ⇄ esquema nuevo).
--
-- ESCRITURA POR EL CREADOR — NO hace falta policy nueva:
--   La RLS de UPDATE de `groups` la define 0004 (`groups_update_owner`): permite
--   UPDATE de la FILA ENTERA al dueño (created_by = auth.uid()). Es a nivel de
--   fila (no de columna), así que estas columnas nuevas quedan cubiertas: el
--   dueño puede escribirlas en el mismo INSERT/UPDATE. El SELECT lo cubre la
--   policy de miembros (0004). Por eso aquí NO tocamos policies: recrearlas solo
--   añadiría riesgo sin aportar nada. Ninguna migración posterior las restringe.
--
-- NO aplicar a producción desde aquí: lo coordina el pipeline / el orquestador.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. groups.starts_on / ends_on — rango de fechas del viaje (null = sin fechas)
-- ════════════════════════════════════════════════════════════════════════════
-- Fechas de calendario (sin hora ni zona horaria): un viaje del 12 al 26 de oct
-- es el mismo rango para todo el grupo, viva donde viva. Por eso `date` y no
-- `timestamptz`. Nullable: las fechas son opcionales (el viaje puede no tenerlas).
alter table public.groups
  add column if not exists starts_on date;

alter table public.groups
  add column if not exists ends_on date;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. groups.description — de qué va el viaje (texto libre opcional, null = sin texto)
-- ════════════════════════════════════════════════════════════════════════════
alter table public.groups
  add column if not exists description text;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. groups.companions — con quién vas (texto libre informativo, null = sin texto)
-- ════════════════════════════════════════════════════════════════════════════
-- Solo un texto ("Marta, Diego y yo"): NO es un sistema de invitación ni vincula
-- usuarios. La membresía real sigue por el enlace del grupo + group_members.
alter table public.groups
  add column if not exists companions text;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. groups.cover_image_path — portada del viaje (path en Storage, null = sin portada)
-- ════════════════════════════════════════════════════════════════════════════
-- Ruta dentro del bucket de imágenes (como challenges.image_path): la portada
-- titula el viaje en la cabecera/tarjeta. Nullable: la portada es opcional.
alter table public.groups
  add column if not exists cover_image_path text;
