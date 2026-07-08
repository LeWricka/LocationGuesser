import { supabase } from './supabase'
import { reportError } from './observability'

const BUCKET = 'images'
// Bucket PÚBLICO para avatares: a diferencia de `images` (privado, URLs firmadas
// que caducan), el avatar se muestra en clasificación, mapa, etc. y necesita una
// URL ESTABLE. La foto de perfil no es secreta, así que servirla pública vale.
const AVATARS_BUCKET = 'avatars'

// Lado largo máximo tras redimensionar. ~1600px basta para ver la foto en
// pantalla y recorta peso de subida en móvil.
const MAX_SIDE = 1600
// Lado del avatar tras recortar a cuadrado: nítido en el tamaño grande (64px) y
// en alta densidad, sin engordar el bucket público.
const AVATAR_SIDE = 256
// Calidad JPEG: equilibrio peso/nitidez. La recompresión, de paso, estripa el
// EXIF (incluido el GPS, que sería la respuesta del reto).
const JPEG_QUALITY = 0.8

interface DecodedImage {
  width: number
  height: number
  source: CanvasImageSource
  release: () => void
}

/**
 * La imagen concreta que no se pudo leer. `fileName` deja que el llamador (p.ej.
 * un bucle que sube varias fotos de una galería) sepa CUÁL falló sin tener que
 * parsear el mensaje; el mensaje también lleva el nombre para que el toast de
 * error ya sea útil sin cambios en la UI.
 */
export class ImageDecodeError extends Error {
  readonly fileName: string
  /**
   * Mismo detalle NO sensible que se reporta a Sentry (`reportAndThrow`, #642),
   * colgado del propio error para que un llamador aguas abajo que capture este
   * `ImageDecodeError` y quiera reportarlo TAMBIÉN (p.ej. el formulario que
   * marca la foto como fallida) pueda incluirlo sin tener que reconstruirlo.
   */
  readonly diagnostics?: Record<string, unknown>

  constructor(
    fileName: string,
    options?: ErrorOptions & { message?: string; diagnostics?: Record<string, unknown> },
  ) {
    const { message, diagnostics, ...errorOptions } = options ?? {}
    super(
      message ?? `No se pudo leer la imagen «${fileName}». Prueba con otra foto (JPEG o PNG).`,
      errorOptions,
    )
    this.name = 'ImageDecodeError'
    this.fileName = fileName
    this.diagnostics = diagnostics
  }
}

/**
 * Metadatos de SELECCIÓN (#642): los pickers (`MomentGalleryPicker`,
 * `PhotoDropzone`) los anotan en la COPIA propia del `File` justo al leerlo del
 * input — no en el `File` original del selector de Android, que puede llevar
 * ya un rato muerto para cuando se sube. Van como propiedades NO estándar en
 * la propia instancia: es la vía más simple de llevarlos desde el picker hasta
 * `uploadImage`/`uploadAvatar` sin enhebrar el dato por cada pantalla
 * intermedia que reenvía el `File` (AddMoment, CreateLocationChallenge…).
 */
interface FileWithSelectionMeta extends File {
  __selectedAt?: number
  __batchSize?: number
}

/**
 * Llamar justo tras crear la copia del `File` en el picker, con el tamaño del
 * LOTE elegido (`files.length`). Si decodificar falla más tarde, el detalle
 * reportado a Sentry incluye `batchSize` y `msSinceSelection` (tiempo desde
 * esta llamada): confirman si el fallo se correlaciona con el tiempo
 * transcurrido desde la selección — la teoría de Android que revoca el
 * content-URI del picker con el tiempo/presión de memoria.
 */
export function markFileSelection(file: File, batchSize: number): void {
  const f = file as FileWithSelectionMeta
  f.__selectedAt = Date.now()
  f.__batchSize = batchSize
}

function selectionMeta(file: File): { batchSize?: number; msSinceSelection?: number } {
  const f = file as FileWithSelectionMeta
  const meta: { batchSize?: number; msSinceSelection?: number } = {}
  if (typeof f.__batchSize === 'number') meta.batchSize = f.__batchSize
  if (typeof f.__selectedAt === 'number') meta.msSinceSelection = Date.now() - f.__selectedAt
  return meta
}

/** Detalle NO sensible (nunca contenido) de un error para telemetría: solo name/message. */
interface ErrorDetail {
  name: string
  message: string
}

function errorDetail(err: unknown): ErrorDetail {
  if (err instanceof Error) return { name: err.name, message: err.message }
  return { name: 'UnknownError', message: String(err) }
}

/**
 * `decodeImage` falló por completo (ninguna vía de `<img>` funcionó). Lleva el
 * detalle de cada intento —SIN contenido de la imagen— para que
 * `reportAndThrowDecodeFailure` lo vuelque a observabilidad antes de
 * convertirlo en el `ImageDecodeError` legible para el usuario.
 */
class DecodeFailure extends Error {
  readonly detail: Record<string, unknown>

  constructor(message: string, detail: Record<string, unknown>) {
    super(message)
    this.name = 'DecodeFailure'
    this.detail = detail
  }
}

/**
 * ¿Es la foto un HEIC/HEIF de iPhone? Los navegadores que no lo decodifican
 * nativamente (Chrome, Firefox de escritorio) no pueden con `createImageBitmap`
 * ni `<img>.decode()`, así que hay que convertirla antes. Detectamos por MIME
 * (`image/heic`/`image/heif`) y, como respaldo, por extensión: en algunos
 * navegadores el `file.type` de un HEIC viene vacío.
 */
function isHeic(file: File): boolean {
  const type = file.type.toLowerCase()
  if (type === 'image/heic' || type === 'image/heif') return true
  return /\.(heic|heif)$/i.test(file.name)
}

/**
 * Convierte un HEIC/HEIF a un File JPEG con `heic2any` (wasm de libheif). Import
 * DINÁMICO: la librería es pesada (wasm) y solo entra al bundle cuando de verdad
 * llega un HEIC; además es navegador-only, así que el import diferido evita
 * romper SSR/tests. El resto del pipeline (canvas → JPEG) sigue igual.
 */
async function heicToJpeg(file: File): Promise<File> {
  const heic2any = (await import('heic2any')).default
  const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: JPEG_QUALITY })
  // heic2any devuelve Blob o Blob[] (multi-imagen); nos quedamos con el primero.
  const blob = Array.isArray(converted) ? converted[0] : converted
  return new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' })
}

/**
 * Carga el archivo en un `<img>` y espera a 'load'. Es la MISMA vía que pinta la
 * miniatura del selector de galería (`MomentGalleryPicker`) — que en el bug de
 * Android (#520) se pinta bien aunque el resto del pipeline falle — así que si
 * esto rechaza, el navegador de verdad no puede con el archivo (no hay fallback
 * posible). A propósito NO llamamos a `.decode()`: `decode()` exige tener toda
 * la imagen decodificada a resolución NATIVA en memoria, y precisamente eso es
 * lo que revienta con fotos de 40-100 MP de cámaras Android (aunque el mismo
 * navegador SÍ sepa pintar esa misma foto reducida, que es por lo que la
 * miniatura del picker se ve bien mientras el guardado falla).
 */
function loadImageElement(file: File): Promise<{ img: HTMLImageElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve({ img, url })
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('El navegador no pudo cargar la imagen'))
    }
    img.src = url
  })
}

/**
 * MISMA idea que `loadImageElement`, pero alimentando el `<img>` con un
 * dataURL (FileReader) en vez de un `URL.createObjectURL`. Último recurso tras
 * el #550: algunos `File`/`Blob` de content-providers de Android (fotos que
 * llegan del selector del sistema respaldadas por un `content://`) no
 * resuelven bien por el registro de blobs del navegador aunque el propio
 * archivo SÍ se pueda leer — `FileReader.readAsDataURL` fuerza otra vía de
 * lectura completamente distinta. Es más lento y pesa ~33% más en memoria
 * (base64), así que solo se intenta cuando `loadImageElement` ya falló.
 */
function loadImageElementViaDataUrl(file: File): Promise<{ img: HTMLImageElement; url: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('FileReader no pudo leer el archivo'))
    reader.onload = () => {
      const dataUrl = reader.result
      if (typeof dataUrl !== 'string') {
        reject(new Error('FileReader no devolvió un dataURL'))
        return
      }
      const img = new Image()
      // `url: ''` marca que no hay object URL que revocar (ver DecodedImage.release).
      img.onload = () => resolve({ img, url: '' })
      img.onerror = () => reject(new Error('El navegador no pudo cargar la imagen (dataURL)'))
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Decodifica el archivo de forma robusta en móvil:
 * 1) `<img>` (ver `loadImageElement`): de aquí sacamos las dimensiones NATURALES
 *    sin forzar un decode de píxeles a resolución nativa.
 * 2) `createImageBitmap`, YA pidiendo el tamaño final (`resizeWidth`/
 *    `resizeHeight` calculados con la proporción real del paso 1). Pedirlo a
 *    resolución nativa —como se hacía antes— es lo que revienta con fotos
 *    gigantes de cámaras Android (el bitmap de una foto de 100 MP pesa varios
 *    cientos de MB en RGBA); pedirlo ya reducido evita reservar esa memoria. Al
 *    conocer ya la proporción real no hay upscale ni distorsión.
 * 3) Si `createImageBitmap` aun así falla (browsers viejos que ignoran el
 *    resize, formatos raros…), usamos directamente el `<img>` del paso 1 como
 *    fuente para `drawImage` — sin `decode()` explícito, por el mismo motivo
 *    que en el paso 1.
 */
async function decodeImage(file: File): Promise<DecodedImage> {
  // Guarda específica (#550): un `File` de 0 bytes es el caso típico de una
  // foto de Google Photos que vive SOLO en la nube (el selector de Android
  // enseña la miniatura en caché, pero el contenido no está descargado al
  // dispositivo). Ni `<img>` ni `createImageBitmap` pueden con un archivo
  // vacío, así que lo detectamos ANTES de intentar nada y damos un mensaje
  // que dice al usuario qué hacer, en vez de un "no se pudo leer" genérico.
  if (file.size === 0) {
    throw new DecodeFailure('El archivo está vacío (0 bytes)', {
      reason: 'empty_file',
      usedFileReaderFallback: false,
    })
  }

  // 1) `<img>` vía objectURL (ver `loadImageElement`): de aquí sacamos las
  //    dimensiones NATURALES sin forzar un decode de píxeles a resolución nativa.
  // 1b) Si eso falla, `<img>` vía FileReader→dataURL (#550): cubre File/Blob
  //     raros de content-providers de Android donde el objectURL no resuelve.
  let loaded: { img: HTMLImageElement; url: string }
  try {
    loaded = await loadImageElement(file)
  } catch (objectUrlErr) {
    try {
      loaded = await loadImageElementViaDataUrl(file)
    } catch (dataUrlErr) {
      // Ninguna vía de <img> pudo con el archivo: no hay fallback posible (es
      // justo la vía que demuestra que el navegador SÍ sabe pintar la foto, la
      // misma que pinta la miniatura del picker). No intentamos
      // `createImageBitmap` a resolución nativa aquí solo para diagnosticar:
      // sería reintroducir el riesgo de OOM que el propio #524 evitaba.
      throw new DecodeFailure('Ninguna vía de <img> pudo con el archivo', {
        reason: 'img_failed',
        usedFileReaderFallback: true,
        objectUrlError: errorDetail(objectUrlErr),
        dataUrlError: errorDetail(dataUrlErr),
      })
    }
  }

  const { img, url } = loaded
  const naturalWidth = img.naturalWidth
  const naturalHeight = img.naturalHeight
  const hasNaturalSize = naturalWidth > 0 && naturalHeight > 0
  const target = hasNaturalSize ? scaledSize(naturalWidth, naturalHeight) : null

  // 2) `createImageBitmap`, YA pidiendo el tamaño final (`resizeWidth`/
  //    `resizeHeight` calculados con la proporción real del paso 1). Pedirlo a
  //    resolución nativa —como se hacía antes— es lo que revienta con fotos
  //    gigantes de cámaras Android (el bitmap de una foto de 100 MP pesa varios
  //    cientos de MB en RGBA); pedirlo ya reducido evita reservar esa memoria. Al
  //    conocer ya la proporción real no hay upscale ni distorsión.
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image',
      ...(target
        ? {
            resizeWidth: target.width,
            resizeHeight: target.height,
            resizeQuality: 'medium' as const,
          }
        : {}),
    })
    if (url) URL.revokeObjectURL(url)
    return {
      width: bitmap.width,
      height: bitmap.height,
      source: bitmap,
      release: () => bitmap.close(),
    }
  } catch {
    // 3) `createImageBitmap` aun así falló (browsers viejos que ignoran el
    //    resize, formatos raros…): usamos directamente el <img> del paso 1/1b
    //    como fuente para `drawImage` — sin `decode()` explícito, por el mismo
    //    motivo que en el paso 1.
  }

  return {
    width: naturalWidth,
    height: naturalHeight,
    source: img,
    release: () => {
      if (url) URL.revokeObjectURL(url)
    },
  }
}

/**
 * Reporta a observabilidad Y lanza el `ImageDecodeError` legible para el
 * usuario. Punto ÚNICO para no duplicar esta lógica entre `compressAndStripExif`
 * y `squareCropToJpeg` (fallo de HEIC o de `decodeImage`, #550/#642).
 *
 * OJO (#642): reportamos el `ImageDecodeError` FINAL — no el error interno
 * (`err`, un `DecodeFailure` u otro `Error` genérico) — como excepción
 * capturada por Sentry (`err` queda como `.cause`, así la cadena se conserva).
 * Antes se reportaba `err`, así que este fallo generaba en Sentry un evento
 * "DecodeFailure"/"Error" con el detalle rico, DISTINTO del `ImageDecodeError`
 * que de verdad ven y vuelven a reportar los llamadores (p.ej. `AddMoment` al
 * marcar la foto como fallida) — ese segundo reporte, con mucho menos
 * contexto, era el evento que de verdad se veía en producción (issue
 * 131926979: "solo area/fileName/stage"). Reportando el mismo tipo de error
 * que acaba viendo la app, ambos reportes agrupan en el MISMO issue de Sentry
 * y el rico llega ahí. `never`: no retorna, así el llamador no necesita
 * `return`/`else` tras invocarla.
 */
function reportAndThrow(
  err: unknown,
  file: File,
  stage: 'decode' | 'heic_convert',
  extra?: Record<string, unknown>,
  message?: string,
): never {
  const diagnostics = {
    area: 'image_decode',
    stage,
    fileType: file.type || '(vacío)',
    fileSizeKb: Math.round(file.size / 1024),
    fileName: file.name,
    fileLastModified: file.lastModified,
    ...extra,
    ...selectionMeta(file),
  }
  const imageError = new ImageDecodeError(file.name, { cause: err, message, diagnostics })
  reportError(imageError, diagnostics)
  throw imageError
}

/**
 * `decodeImage` falló por completo (ni `<img>` ni el fallback de `createImageBitmap`
 * pudieron con el archivo, #550). Envuelve `reportAndThrow` con el detalle del
 * `DecodeFailure`, si lo hay, y el mensaje accionable para el caso de 0 bytes.
 */
function reportAndThrowDecodeFailure(err: unknown, file: File): never {
  const detail = err instanceof DecodeFailure ? err.detail : undefined
  // Caso específico (#550): archivo de 0 bytes, típico de una foto de Google
  // Photos que vive solo en la nube. Mensaje accionable en vez del genérico.
  const message =
    detail?.reason === 'empty_file'
      ? `«${file.name}» parece no estar descargada en el dispositivo (fotos de Google Photos guardadas solo en la nube). Descárgala y vuelve a intentarlo.`
      : undefined
  reportAndThrow(err, file, 'decode', detail, message)
}

/**
 * Carga el archivo, lo redimensiona a <= MAX_SIDE en su lado largo y lo
 * re-exporta a JPEG. Dibujar en canvas descarta los metadatos EXIF, así que la
 * foto sube sin GPS ni orientación original.
 */
async function compressAndStripExif(file: File): Promise<Blob> {
  // HEIC/HEIF (iPhone): muchos navegadores no lo decodifican; lo convertimos a
  // JPEG antes de entrar en el pipeline de canvas. Las fotos JPEG/PNG/WebP NO
  // pasan por aquí (no engordan ni se ralentizan con la conversión).
  let decodable = file
  if (isHeic(file)) {
    try {
      decodable = await heicToJpeg(file)
    } catch (err) {
      // La conversión falló: reportamos metadatos NO sensibles (sin subir la
      // imagen) y lanzamos el error legible para el toast.
      reportAndThrow(err, file, 'heic_convert')
    }
  }

  let img: DecodedImage
  try {
    img = await decodeImage(decodable)
  } catch (err) {
    // Ni el `<img>` (objectURL o FileReader) ni `createImageBitmap` pudieron
    // con el archivo. Reportamos para tener visibilidad del caso concreto en
    // Sentry (#550); el error de cara al usuario lleva el nombre para saber
    // cuál foto fue (si hay varias, como en la galería de un recuerdo).
    reportAndThrowDecodeFailure(err, file)
  }
  try {
    const { width, height } = scaledSize(img.width, img.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No se pudo procesar la imagen.')
    ctx.drawImage(img.source, 0, 0, width, height)
    return await canvasToJpeg(canvas)
  } finally {
    img.release()
  }
}

/**
 * Recorta la imagen a un cuadrado centrado y la re-exporta a JPEG de lado
 * AVATAR_SIDE. Como `compressAndStripExif`, pasa por canvas, así que descarta el
 * EXIF (orientación y GPS) y reusa la conversión de HEIC del pipeline general.
 */
async function squareCropToJpeg(file: File): Promise<Blob> {
  let decodable = file
  if (isHeic(file)) {
    try {
      decodable = await heicToJpeg(file)
    } catch (err) {
      reportAndThrow(err, file, 'heic_convert')
    }
  }

  let img: DecodedImage
  try {
    img = await decodeImage(decodable)
  } catch (err) {
    reportAndThrowDecodeFailure(err, file)
  }
  try {
    // Cuadrado centrado: tomamos el lado corto y descartamos los bordes del lado
    // largo (mitad a cada lado) para que la foto quede centrada en el círculo.
    const side = Math.min(img.width, img.height)
    const sx = (img.width - side) / 2
    const sy = (img.height - side) / 2
    const canvas = document.createElement('canvas')
    canvas.width = AVATAR_SIDE
    canvas.height = AVATAR_SIDE
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No se pudo procesar la imagen.')
    ctx.drawImage(img.source, sx, sy, side, side, 0, 0, AVATAR_SIDE, AVATAR_SIDE)
    return await canvasToJpeg(canvas)
  } finally {
    img.release()
  }
}

function scaledSize(w: number, h: number): { width: number; height: number } {
  const longSide = Math.max(w, h)
  if (longSide <= MAX_SIDE) return { width: w, height: h }
  const scale = MAX_SIDE / longSide
  return { width: Math.round(w * scale), height: Math.round(h * scale) }
}

/**
 * Exportada (además de usarla `compressAndStripExif`/`squareCropToJpeg`):
 * `extractVideoCoverFrame` (issue #649) la reutiliza para el fotograma-portada
 * de un clip, así el frame sale con la MISMA calidad/pipeline que cualquier
 * otra foto del kit, sin duplicar la llamada a `canvas.toBlob`.
 */
export function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo comprimir la imagen.'))),
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
}

/**
 * Comprime, estripa EXIF y sube la imagen al bucket `images`. Devuelve el
 * `path` que se guarda en la fila del reto (la foto viaja con el enlace).
 */
export async function uploadImage(file: File): Promise<string> {
  const blob = await compressAndStripExif(file)
  const path = `${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
  })
  if (error) throw error
  return path
}

/**
 * Extensión de fichero a partir del MIME real que grabó `MediaRecorder` (#648):
 * Chrome/Firefox graban `audio/webm;codecs=opus`, Safari `audio/mp4` (AAC). No
 * forzamos un único formato (recomprimir audio en cliente es caro y sin ganancia
 * real aquí) — cada navegador sube lo que sabe grabar, con su extensión real.
 * `mp4` → `m4a`: mismo contenedor, pero es la extensión que un jugador/descarga
 * reconoce para audio-only (un `.mp4` "pelado" confunde). Sin match conocido,
 * cae al subtipo tal cual (mejor una extensión rara que perder el archivo).
 */
export function extensionForMime(mime: string): string {
  const base = mime.split(';')[0]?.trim().split('/')[1]?.toLowerCase()
  if (!base) return 'webm'
  return base === 'mp4' ? 'm4a' : base
}

/**
 * Sube una nota de voz (blob de `MediaRecorder`, ≤60s) al MISMO bucket privado
 * `images`, bajo el prefijo `audio/` — comparte RLS y régimen de URLs firmadas
 * con las fotos, sin crear un bucket nuevo para un archivo ocasional y pequeño.
 * Sin recompresión (a diferencia de `uploadImage`): el audio ya sale comprimido
 * del propio `MediaRecorder`. Devuelve el `path` para `challenges.audio_path`.
 */
export async function uploadAudio(blob: Blob, mimeType: string): Promise<string> {
  const path = `audio/${crypto.randomUUID()}.${extensionForMime(mimeType)}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: mimeType || 'application/octet-stream',
    cacheControl: '31536000',
  })
  if (error) throw error
  return path
}

// ── CLIP CORTO (SHORTS) — issue #649 ────────────────────────────────────────
// Un momento admite UN clip de vídeo corto (v1): elegido de la galería del
// móvil, SIN transcodificar — el H.264 que ya graba cualquier móvil reproduce
// en todos los navegadores, así que no hace falta la maquinaria pesada (wasm)
// que sí justifica recomprimir una FOTO. Sin recompresión posible en cliente,
// el tope de TAMAÑO hace de única guarda de peso; el tope de DURACIÓN evita
// que "corto" deje de serlo. Ambos se validan ANTES de aceptar el archivo (en
// el picker), nunca al subir.
export const MAX_VIDEO_DURATION_SECONDS = 15
export const MAX_VIDEO_BYTES = 40 * 1024 * 1024

/** Metadatos del vídeo leídos del propio archivo, sin subir nada. */
export interface VideoMetadata {
  durationSeconds: number
  width: number
  height: number
}

/**
 * El vídeo elegido no pasa los límites de v1 (tamaño o duración) o no se pudo
 * leer. `reason` deja que el picker decida el mensaje/la UI sin parsear el
 * texto del error; `message` ya es el texto legible para el toast.
 */
export class VideoValidationError extends Error {
  readonly reason: 'size' | 'duration' | 'unreadable'
  constructor(reason: 'size' | 'duration' | 'unreadable', message: string) {
    super(message)
    this.name = 'VideoValidationError'
    this.reason = reason
  }
}

/**
 * Duración/resolución REALES del vídeo, leyéndolo en un `<video>` oculto —
 * nunca insertado en el DOM, basta crear el elemento y esperar a que resuelva
 * sus metadatos (misma idea que `loadImageElement` para fotos, pero con
 * `loadedmetadata` en vez de `load`). No sube ni reproduce nada.
 */
function readVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      const { duration, videoWidth, videoHeight } = video
      URL.revokeObjectURL(url)
      resolve({ durationSeconds: duration, width: videoWidth, height: videoHeight })
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('El navegador no pudo leer el vídeo'))
    }
    video.src = url
  })
}

/**
 * Valida el clip ANTES de aceptarlo en el picker (issue #649): el TAMAÑO
 * primero (barato, sin I/O) y la DURACIÓN después (exige cargar metadatos, más
 * caro). Lanza `VideoValidationError` con un mensaje ya listo para el toast;
 * si pasa, devuelve los metadatos (el picker los reutiliza sin releer el
 * vídeo, p. ej. para decidir el punto de fotograma en `extractVideoCoverFrame`).
 */
export async function validateVideoFile(file: File): Promise<VideoMetadata> {
  if (file.size > MAX_VIDEO_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1)
    throw new VideoValidationError(
      'size',
      `El vídeo pesa ${mb} MB; el máximo es 40 MB. Elige un clip más corto o más comprimido.`,
    )
  }
  let meta: VideoMetadata
  try {
    meta = await readVideoMetadata(file)
  } catch {
    throw new VideoValidationError(
      'unreadable',
      `No se pudo leer «${file.name}». Prueba con otro vídeo.`,
    )
  }
  if (meta.durationSeconds > MAX_VIDEO_DURATION_SECONDS) {
    throw new VideoValidationError(
      'duration',
      `El vídeo dura ${Math.round(meta.durationSeconds)}s; el máximo es ${MAX_VIDEO_DURATION_SECONDS}s. Recorta el clip antes de subirlo.`,
    )
  }
  return meta
}

/**
 * Fotograma-portada del clip (issue #649): seek a 0.5s (o a la mitad si el
 * clip dura menos, para no pedir un instante fuera de rango) → se dibuja el
 * frame en un `<canvas>` → se exporta a JPEG por la MISMA tubería que una foto
 * normal (`canvasToJpeg`, misma `JPEG_QUALITY`). El resultado se trata como
 * UNA FOTO MÁS del recuerdo (se sube con `uploadImage` y se inserta en
 * `moment_images`, igual que cualquier otra) — no hay un campo aparte para "la
 * foto del vídeo"; así la portada del clip ya sale gratis en tarjetas/galería.
 */
export async function extractVideoCoverFrame(file: File): Promise<File> {
  const url = URL.createObjectURL(file)
  try {
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('El navegador no pudo leer el vídeo'))
      video.src = url
    })
    const seekTo = video.duration > 0 ? Math.min(0.5, video.duration / 2) : 0
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve()
      video.onerror = () => reject(new Error('El navegador no pudo leer el fotograma del vídeo'))
      video.currentTime = seekTo
    })
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 360
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No se pudo procesar el fotograma del vídeo.')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await canvasToJpeg(canvas)
    return new File([blob], 'clip-portada.jpg', { type: 'image/jpeg' })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Extensión de fichero del vídeo a partir de su MIME real. HERMANA de
 * `extensionForMime` pero SIN su mapeo audio-only `mp4 → m4a`: un vídeo
 * `video/mp4` debe quedarse en `.mp4` (un `.m4a` confundiría a cualquier
 * reproductor/descarga, que esperan vídeo, no audio-only).
 */
export function videoExtensionForMime(mime: string): string {
  const base = mime.split(';')[0]?.trim().split('/')[1]?.toLowerCase()
  return base || 'mp4'
}

/**
 * Sube el clip — SIN transcodificar, el H.264 del móvil ya reproduce en
 * cualquier navegador — al MISMO bucket privado `images`, prefijo `video/`:
 * comparte RLS y régimen de URLs firmadas con fotos y audio (migración 0036,
 * simétrica a `audio_path` de 0035). Devuelve el `path` para
 * `challenges.video_path`. El llamador ya validó tamaño/duración con
 * `validateVideoFile` antes de llegar aquí.
 */
export async function uploadVideo(file: File, mimeType: string): Promise<string> {
  const path = `video/${crypto.randomUUID()}.${videoExtensionForMime(mimeType)}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: mimeType || 'video/mp4',
    cacheControl: '31536000',
  })
  if (error) throw error
  return path
}

/**
 * TTL por defecto de una URL firmada del bucket privado (issue #638). Antes eran
 * 3600s (1h): de sobra para una visita normal, pero una PWA puede quedar viva en
 * segundo plano mucho más tiempo (pestaña dormida, app en background) — al
 * volver, las portadas/pines/héroes que ya se habían firmado aparecían en
 * blanco (URL caducada) sin que nada las re-firmara. 24h da margen para una
 * sesión larga sin abrir una ventana de exposición desproporcionada (la URL
 * sigue exigiendo ser miembro del viaje para generarse, vía RLS). Exportada:
 * TODOS los puntos de firma del camino de lectura (home y viaje) cuelgan de
 * este único número, en vez de repetir el mágico por su cuenta.
 */
export const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24

// Margen antes de la caducidad REAL en el que ya consideramos una URL cacheada
// "a punto de caducar" y la renovamos por delante, en vez de arriesgarnos a
// servir una que expire a medio uso.
const SIGNED_URL_REFRESH_MARGIN_MS = 5 * 60 * 1000

/**
 * Caché de URLs firmadas por `path` (issue "Bitácora parpadea", #725): cada
 * subida genera un `path` con UUID propio (`uploadImage`/`uploadAudio`/
 * `uploadVideo` de más arriba) y el objeto en ese `path` NUNCA se sobrescribe,
 * así que la MISMA URL firmada sigue siendo válida (y sirve el mismo
 * contenido) hasta que caduca — no hace falta pedir una nueva cada vez.
 *
 * Sin esta caché, cada llamada a `createSignedUrl` para el mismo `path`
 * devuelve un token distinto: `useTripData` se re-firma entera en cada evento
 * de Realtime de `votes` (cualquier voto de cualquier jugador) y `BitacoraTab`
 * hace lo mismo con su galería extra en cuanto `moments` cambia de referencia.
 * El `<img>` de una foto YA CARGADA recibía entonces un `src` distinto para el
 * MISMO fichero — el navegador lo trata como un recurso nuevo y lo
 * recarga/redecodea, aunque el `key` de React sea estable y nada haya cambiado
 * visualmente: eso era el parpadeo.
 */
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>()

/** Solo para tests: limpia la caché entre casos que reutilizan el mismo `path`. */
export function clearSignedUrlCache(): void {
  signedUrlCache.clear()
}

/**
 * URL firmada (temporal) de un objeto del bucket `images` a partir de su
 * `path` — sirve tanto para una foto como para una nota de voz (`audio/…`,
 * #648): ambas comparten bucket y régimen de acceso. El bucket es PRIVADO (el
 * contenido puede revelar el sitio = la respuesta, sobre todo en modo
 * sorpresa), así que no vale `getPublicUrl`: se firma con caducidad y solo un
 * usuario autenticado (miembro) puede generarla (RLS de storage). Null si no
 * se puede firmar. Async: se resuelve en el cliente.
 *
 * Memoizada por `path` (ver `signedUrlCache`): repetir la llamada para el
 * mismo `path` antes de que caduque devuelve SIEMPRE la misma cadena, para que
 * un `<img src>` que ya apuntaba a ella no la trate como un recurso nuevo.
 */
export async function signedImageUrl(
  path: string,
  expiresIn = SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  const cached = signedUrlCache.get(path)
  if (cached && cached.expiresAt - SIGNED_URL_REFRESH_MARGIN_MS > Date.now()) {
    return cached.url
  }
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn)
  if (error) return null
  const url = data?.signedUrl ?? null
  if (url) signedUrlCache.set(path, { url, expiresAt: Date.now() + expiresIn * 1000 })
  return url
}

/**
 * Recorta a cuadrado, comprime/estripa EXIF y sube la foto de perfil al bucket
 * PÚBLICO `avatars`. Devuelve la URL pública ESTABLE para guardar en
 * `profiles.avatar_url` (se muestra en clasificación, mapa, etc.).
 *
 * Ruta `<userId>/<uuid>.jpg`: la política de escritura solo permite al propio
 * usuario tocar su carpeta (primer segmento = auth.uid()). Un uuid nuevo en cada
 * subida evita la caché del CDN al cambiar de foto (no hay que invalidar).
 */
export async function uploadAvatar(file: File, userId: string): Promise<string> {
  const blob = await squareCropToJpeg(file)
  const path = `${userId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from(AVATARS_BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
  })
  if (error) throw error
  const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path)
  return data.publicUrl
}
