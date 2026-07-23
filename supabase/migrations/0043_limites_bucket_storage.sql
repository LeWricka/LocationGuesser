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
--   · Foto: SIEMPRE se re-exporta a JPEG en `compressAndStripExif`/
--     `squareCropToJpeg` (canvas → `image/jpeg`) — pero el HEIC/HEIF de
--     iPhone/Android entra en la lista igualmente por si algún flujo lo sube
--     sin pasar por la recompresión, y PNG/WebP por si se añade selección
--     directa de esos formatos más adelante.
--   · Vídeo: sube SIN transcodificar (`uploadVideo`) — mp4/webm/quicktime (.mov
--     de iPhone) son los que puede grabar/compartir un móvil.
--   · Audio: `MediaRecorder` graba `audio/webm;codecs=opus` (Chrome/Firefox) o
--     `audio/mp4` (Safari, AAC) — `audio/aac`/`audio/mpeg` de margen por si
--     cambia el `mimeType` exacto entre versiones de navegador.
update storage.buckets
set
  file_size_limit = 42 * 1024 * 1024,
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'audio/webm',
    'audio/mp4',
    'audio/aac',
    'audio/mpeg'
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
