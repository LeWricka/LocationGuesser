-- 0043_limites_bucket_storage — límites de tamaño/MIME en los buckets de Storage
-- Issue #911: la validación de tamaño/duración/formato de foto, vídeo y nota de
-- voz vive HOY solo en cliente (`web/src/lib/storage.ts`: recompresión de foto a
-- MAX_SIDE=1600px/JPEG_QUALITY=0.8, MAX_VIDEO_DURATION_SECONDS=15,
-- MAX_VIDEO_BYTES=40MB, notas de voz ≤60s grabadas por MediaRecorder). Un
-- cliente que salte esa validación (llamada directa a la API REST con la
-- publishable key, o un bug futuro en el picker) podría subir cualquier tamaño
-- o tipo — los buckets no ponían ningún tope. Esta migración es defensa en
-- profundidad: replica en Storage los mismos límites que ya aplica el cliente.
--
-- `file_size_limit` en bytes; `update` es idempotente (se puede repetir sin
-- efecto secundario, a diferencia de un `insert`).

-- Bucket `images` (privado): fotos de momento/reto en la raíz, vídeo bajo
-- `video/` y nota de voz bajo `audio/` (mismo bucket para los tres, comparten
-- RLS — ver 0025/0035/0036). El tope de tamaño tiene que cubrir el fichero MÁS
-- pesado de los tres: el vídeo (MAX_VIDEO_BYTES=40MB). Le damos 42MB de margen
-- sobre el límite cliente para no rechazar un vídeo que pase la validación del
-- picker justo en el borde (redondeos, metadatos del contenedor) por un
-- byte-a-byte más estricto en el servidor.
--
-- MIME permitidos, por lo que produce REALMENTE el cliente (`storage.ts`):
--   · Foto: tipos de imagen EXPLÍCITOS (no `image/*`) para NO permitir
--     `image/svg+xml` (vector de scripts) aunque este bucket sea privado. La
--     foto siempre se re-exporta a JPEG (`compressAndStripExif`/`squareCropToJpeg`,
--     canvas → `image/jpeg`); HEIC/HEIF de iPhone y PNG/WebP entran por margen.
--   · Vídeo y audio: WILDCARD (`video/*`, `audio/*`) A PROPÓSITO. `uploadAudio`
--     sube con el `contentType` que da `MediaRecorder`, que incluye el parámetro
--     de códec (`audio/webm;codecs=opus`) — una lista de tipos EXACTOS
--     (`audio/webm`) NO casaría con ese Content-Type y Supabase rechazaría la
--     nota de voz. El wildcard evita ese fallo y sigue bloqueando lo no-media
--     (documentos, ejecutables, etc.); el tope de tamaño es la guarda real.
update storage.buckets
set
  file_size_limit = 42 * 1024 * 1024,
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'video/*',
    'audio/*'
  ]
where id = 'images';

-- Bucket `avatars` (público, solo imagen de perfil): `uploadAvatar` recorta a
-- cuadrado y re-exporta a JPEG (`squareCropToJpeg`) de AVATAR_SIDE=256px, así
-- que el peso real es minúsculo (unos pocos KB-100KB); 5MB es margen de sobra
-- sin dejar la puerta abierta a un archivo grande en un bucket público.
update storage.buckets
set
  file_size_limit = 5 * 1024 * 1024,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'avatars';
