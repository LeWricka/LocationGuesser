import { describe, test, expect, vi, beforeEach } from 'vitest'

// Las factories de vi.mock se elevan al inicio del fichero; declaramos los
// espías con vi.hoisted para que estén inicializados cuando corren.
const { heic2any, upload, createSignedUrl, reportError } = vi.hoisted(() => ({
  // heic2any: import dinámico que storage.ts solo usa cuando llega un HEIC.
  heic2any: vi.fn(),
  // Supabase Storage: comprobamos que se sube algo, sin red.
  upload: vi.fn(),
  // Firma de URLs del bucket privado (issue #638): comprobamos con qué TTL se llama.
  createSignedUrl: vi.fn(),
  // Observabilidad: espiamos qué se reporta a Sentry en los fallos.
  reportError: vi.fn(),
}))

vi.mock('heic2any', () => ({
  default: heic2any,
}))

vi.mock('./supabase', () => ({
  supabase: {
    storage: { from: () => ({ upload, createSignedUrl }) },
  },
}))

vi.mock('./observability', () => ({
  reportError,
}))

import {
  uploadImage,
  uploadAudio,
  uploadVideo,
  extensionForMime,
  videoExtensionForMime,
  validateVideoFile,
  extractVideoCoverFrame,
  VideoValidationError,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_DURATION_SECONDS,
  signedImageUrl,
  ImageDecodeError,
  SIGNED_URL_TTL_SECONDS,
  markFileSelection,
  clearSignedUrlCache,
} from './storage'

// Fake mínimo de `<img>`: el nuevo `decodeImage` (storage.ts) carga SIEMPRE un
// `<img>` primero (la misma vía que pinta la miniatura del picker, ver #520)
// para leer `naturalWidth`/`naturalHeight` sin forzar un decode de píxeles a
// resolución nativa. jsdom no carga imágenes de verdad, así que sustituimos el
// global `Image`; el `src` setter dispara 'load' (o 'error') en un microtask,
// como haría un navegador real.
function fakeImageClass(
  opts: { naturalWidth?: number; naturalHeight?: number; fails?: boolean } = {},
) {
  const { naturalWidth = 800, naturalHeight = 600, fails = false } = opts
  return class FakeImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    naturalWidth = naturalWidth
    naturalHeight = naturalHeight
    set src(_v: string) {
      queueMicrotask(() => (fails ? this.onerror?.() : this.onload?.()))
    }
  }
}

// Variante que decide éxito/fallo según el PREFIJO del `src` recibido: nos
// deja simular "el <img> por objectURL (blob:) falla pero por dataURL (data:)
// sí funciona" — el caso del fallback FileReader (#550) — con la MISMA clase
// global `Image` para las dos vías (como pasaría en el navegador real).
function fakeImageClassBySrcPrefix(succeedsFor: (src: string) => boolean) {
  return class FakeImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    naturalWidth = 800
    naturalHeight = 600
    set src(v: string) {
      queueMicrotask(() => (succeedsFor(v) ? this.onload?.() : this.onerror?.()))
    }
  }
}

// Guardamos el `FileReader` REAL antes de que ningún test lo stubee (más
// abajo, `vi.stubGlobal('FileReader', ...)`): `readAsArrayBuffer` lo delega
// aquí en vez de fingirlo, porque el propio jsdom implementa
// `Blob.prototype.arrayBuffer()` (usado por `readHeaderBytes`/magic bytes,
// #762) internamente CON `FileReader.readAsArrayBuffer` — si lo dejamos
// fingido, cualquier lectura de bytes de cabecera revienta con
// "reader.readAsArrayBuffer is not a function" en TODOS los tests, no solo en
// los que a propósito prueban el fallback de dataURL.
const RealFileReader = globalThis.FileReader

// Fake mínimo de `FileReader`: el fallback de `decodeImage` (#550) lo usa
// SOLO cuando el `<img>` por objectURL ya falló, para intentar una segunda vía
// (dataURL) — cubre File/Blob raros de content-providers de Android.
function fakeFileReaderClass(opts: { fails?: boolean } = {}) {
  const { fails = false } = opts
  return class FakeFileReader {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    result: string | ArrayBuffer | null = null
    // Sin parámetro: el fake no necesita leer el contenido real del archivo,
    // solo simular el evento load/error (como fakeImageClass con `src`).
    readAsDataURL() {
      queueMicrotask(() => {
        if (fails) {
          this.onerror?.()
          return
        }
        this.result = 'data:image/jpeg;base64,eHh4'
        this.onload?.()
      })
    }
    // NO fingido (ver comentario de `RealFileReader` arriba): delega en el
    // FileReader real para que `Blob.prototype.arrayBuffer()` (magic bytes)
    // siga funcionando con el contenido REAL del archivo, sin acoplarse al
    // `fails` de este fake (que solo gobierna la vía dataURL).
    readAsArrayBuffer(blob: Blob) {
      const real = new RealFileReader()
      real.onload = () => {
        this.result = real.result
        this.onload?.()
      }
      real.onerror = () => this.onerror?.()
      real.readAsArrayBuffer(blob)
    }
  }
}

// `createImageBitmap`, `<img>` y `<canvas>` no existen (o no pintan) en jsdom:
// los stubeamos para que el pipeline de decodificación/canvas resuelva sin
// tocar píxeles reales. Así los tests se centran en el ENRUTADO (HEIC sí /
// JPEG no) y en los fallbacks de decodificación, no en el decode real del
// navegador (imposible de reproducir en jsdom).
function stubDecodePipeline() {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn().mockResolvedValue({ width: 800, height: 600, close: vi.fn() }),
  )
  vi.stubGlobal('Image', fakeImageClass())
  // Por defecto FileReader "funciona" (dataURL válido): solo entra en juego si
  // un test hace fallar el <img> por objectURL primero (ver tests de #550).
  vi.stubGlobal('FileReader', fakeFileReaderClass())
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:fake'),
    revokeObjectURL: vi.fn(),
  })
  const ctx = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    cb: BlobCallback,
  ) {
    cb(new Blob(['jpeg-bytes'], { type: 'image/jpeg' }))
  })
}

// Fake mínimo de `<video>` (issue #649): jsdom no implementa carga de medios
// (ni `loadedmetadata`/`seeked` disparan, ni `duration`/`currentTime` hacen
// nada), así que interceptamos `document.createElement('video')` — el resto de
// tags (p. ej. 'canvas', que sí usa `stubDecodePipeline` arriba) pasan por la
// implementación REAL de jsdom sin tocar. Devuelve las instancias creadas para
// poder inspeccionar, p. ej., a qué `currentTime` hizo seek `extractVideoCoverFrame`.
class FakeVideoElement {
  onloadedmetadata: (() => void) | null = null
  onerror: (() => void) | null = null
  onseeked: (() => void) | null = null
  duration: number
  videoWidth: number
  videoHeight: number
  preload = ''
  muted = false
  private failsMetadata: boolean
  private failsSeek: boolean
  private _currentTime = 0
  constructor(opts: {
    duration: number
    videoWidth: number
    videoHeight: number
    failsMetadata: boolean
    failsSeek: boolean
  }) {
    this.duration = opts.duration
    this.videoWidth = opts.videoWidth
    this.videoHeight = opts.videoHeight
    this.failsMetadata = opts.failsMetadata
    this.failsSeek = opts.failsSeek
  }
  set src(_v: string) {
    queueMicrotask(() => (this.failsMetadata ? this.onerror?.() : this.onloadedmetadata?.()))
  }
  get currentTime() {
    return this._currentTime
  }
  set currentTime(v: number) {
    this._currentTime = v
    queueMicrotask(() => (this.failsSeek ? this.onerror?.() : this.onseeked?.()))
  }
}

function stubVideoElement(
  opts: {
    duration?: number
    videoWidth?: number
    videoHeight?: number
    failsMetadata?: boolean
    failsSeek?: boolean
  } = {},
): FakeVideoElement[] {
  const {
    duration = 10,
    videoWidth = 640,
    videoHeight = 360,
    failsMetadata = false,
    failsSeek = false,
  } = opts
  const instances: FakeVideoElement[] = []
  const realCreateElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag === 'video') {
      const el = new FakeVideoElement({
        duration,
        videoWidth,
        videoHeight,
        failsMetadata,
        failsSeek,
      })
      instances.push(el)
      return el as unknown as HTMLElement
    }
    return realCreateElement(tag)
  }) as typeof document.createElement)
  return instances
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  stubDecodePipeline()
  upload.mockResolvedValue({ error: null })
  createSignedUrl.mockResolvedValue({
    data: { signedUrl: 'https://firmada.example/x.jpg' },
    error: null,
  })
  // Varios tests firman el MISMO path ('viajes/foto.jpg'): sin limpiar la
  // caché entre casos, el segundo se serviría de la firma cacheada por el
  // primero y `createSignedUrl` no se llamaría de nuevo (ver signedImageUrl).
  clearSignedUrlCache()
})

// Issue #638: las tarjetas de la home se quedaban en blanco tras ~1h de PWA
// viva — la URL firmada (antes 3600s) caducaba sin que nada la re-firmara. El
// fix unifica el TTL en `SIGNED_URL_TTL_SECONDS` (24h) como valor por defecto:
// estos tests fijan ese contrato para que un cambio futuro no lo rompa en
// silencio.
describe('signedImageUrl — TTL por defecto (issue #638)', () => {
  test('firma con SIGNED_URL_TTL_SECONDS (24h) por defecto, no con el 3600s antiguo', async () => {
    await signedImageUrl('viajes/foto.jpg')
    expect(createSignedUrl).toHaveBeenCalledWith('viajes/foto.jpg', SIGNED_URL_TTL_SECONDS)
    expect(SIGNED_URL_TTL_SECONDS).toBe(60 * 60 * 24)
  })

  test('un TTL explícito (p.ej. 5s para verificar sin esperar 24h) lo respeta igual', async () => {
    await signedImageUrl('viajes/foto.jpg', 5)
    expect(createSignedUrl).toHaveBeenCalledWith('viajes/foto.jpg', 5)
  })

  test('si Storage devuelve error, resuelve null en vez de lanzar', async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: new Error('boom') })
    await expect(signedImageUrl('viajes/foto.jpg')).resolves.toBeNull()
  })
})

// Issue #725 ("Bitácora parpadea"): sin memoizar, cada llamada a
// `createSignedUrl` para el MISMO path devolvía un token distinto — un `<img
// src>` que ya apuntaba a esa foto la trataba como un recurso nuevo (recarga +
// redecode) en cuanto `useTripData`/`BitacoraTab` volvían a firmar tras
// cualquier evento de Realtime, aunque el fichero fuera el mismo de siempre
// (los paths llevan UUID propio y nunca se sobrescriben).
describe('signedImageUrl — caché por path (issue #725, Bitácora parpadea)', () => {
  test('dos llamadas seguidas al MISMO path devuelven la MISMA URL sin volver a firmar', async () => {
    createSignedUrl.mockResolvedValueOnce({
      data: { signedUrl: 'https://firmada.example/una-vez.jpg' },
      error: null,
    })

    const first = await signedImageUrl('viajes/estable.jpg')
    const second = await signedImageUrl('viajes/estable.jpg')

    expect(second).toBe(first)
    expect(createSignedUrl).toHaveBeenCalledTimes(1)
  })

  test('paths distintos se firman cada uno por su cuenta, sin colisionar en caché', async () => {
    createSignedUrl
      .mockResolvedValueOnce({ data: { signedUrl: 'https://firmada.example/a.jpg' }, error: null })
      .mockResolvedValueOnce({ data: { signedUrl: 'https://firmada.example/b.jpg' }, error: null })

    const a = await signedImageUrl('viajes/a.jpg')
    const b = await signedImageUrl('viajes/b.jpg')

    expect(a).toBe('https://firmada.example/a.jpg')
    expect(b).toBe('https://firmada.example/b.jpg')
    expect(createSignedUrl).toHaveBeenCalledTimes(2)
  })

  test('pasado el margen de caducidad, SÍ re-firma (no sirve una URL a punto de caducar)', async () => {
    vi.useFakeTimers()
    try {
      createSignedUrl
        .mockResolvedValueOnce({
          data: { signedUrl: 'https://firmada.example/v1.jpg' },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { signedUrl: 'https://firmada.example/v2.jpg' },
          error: null,
        })

      const first = await signedImageUrl('viajes/caduca.jpg', 10)
      vi.advanceTimersByTime(11_000) // ya pasó el TTL de 10s + margen
      const second = await signedImageUrl('viajes/caduca.jpg', 10)

      expect(first).toBe('https://firmada.example/v1.jpg')
      expect(second).toBe('https://firmada.example/v2.jpg')
      expect(createSignedUrl).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

// Nota de voz (issue #648): la extensión sale del MIME REAL que grabó el
// navegador (opus/webm en Chrome/Firefox, aac/mp4 en Safari) — sin recomprimir
// ni forzar un único formato.
describe('extensionForMime — mapeo MIME real de MediaRecorder → extensión (#648)', () => {
  test('audio/webm;codecs=opus (Chrome/Firefox) → webm', () => {
    expect(extensionForMime('audio/webm;codecs=opus')).toBe('webm')
  })

  test('audio/webm sin codecs → webm', () => {
    expect(extensionForMime('audio/webm')).toBe('webm')
  })

  test('audio/mp4 (Safari, AAC) → m4a (extensión reconocible para audio-only)', () => {
    expect(extensionForMime('audio/mp4')).toBe('m4a')
  })

  test('audio/mp4;codecs=mp4a.40.2 (con codecs) → m4a igual', () => {
    expect(extensionForMime('audio/mp4;codecs=mp4a.40.2')).toBe('m4a')
  })

  test('audio/aac → aac (subtipo tal cual, sin mapeo especial)', () => {
    expect(extensionForMime('audio/aac')).toBe('aac')
  })

  test('mime vacío o irreconocible → webm por defecto (no revienta)', () => {
    expect(extensionForMime('')).toBe('webm')
  })
})

describe('uploadAudio — sube al bucket images bajo el prefijo audio/ (#648)', () => {
  test('sube con el path audio/<uuid>.<ext> y el content-type real', async () => {
    const blob = new Blob(['audio-bytes'], { type: 'audio/webm;codecs=opus' })
    const path = await uploadAudio(blob, 'audio/webm;codecs=opus')

    expect(path).toMatch(/^audio\/[0-9a-f-]+\.webm$/)
    expect(upload).toHaveBeenCalledWith(
      path,
      blob,
      expect.objectContaining({ contentType: 'audio/webm;codecs=opus' }),
    )
  })

  test('un mimeType Safari (mp4) sube con extensión .m4a', async () => {
    const blob = new Blob(['audio-bytes'], { type: 'audio/mp4' })
    const path = await uploadAudio(blob, 'audio/mp4')
    expect(path).toMatch(/\.m4a$/)
  })

  test('si Storage devuelve error, lo propaga (no lo traga en silencio)', async () => {
    upload.mockResolvedValueOnce({ error: new Error('storage boom') })
    await expect(uploadAudio(new Blob(['x']), 'audio/webm')).rejects.toThrow('storage boom')
  })
})

describe('uploadImage — enrutado HEIC vs. JPEG/PNG', () => {
  test('una foto JPEG normal NO pasa por la conversión heic2any', async () => {
    const jpeg = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })
    const path = await uploadImage(jpeg)
    expect(heic2any).not.toHaveBeenCalled()
    expect(upload).toHaveBeenCalledTimes(1)
    expect(path).toMatch(/\.jpg$/)
  })

  test('un PNG tampoco entra por la rama HEIC', async () => {
    const png = new File(['x'], 'captura.png', { type: 'image/png' })
    await uploadImage(png)
    expect(heic2any).not.toHaveBeenCalled()
    expect(upload).toHaveBeenCalledTimes(1)
  })

  test('un HEIC por MIME (image/heic) se convierte con heic2any antes de subir', async () => {
    heic2any.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }))
    const heic = new File(['x'], 'IMG_0001.heic', { type: 'image/heic' })
    await uploadImage(heic)
    expect(heic2any).toHaveBeenCalledTimes(1)
    expect(heic2any).toHaveBeenCalledWith(
      expect.objectContaining({ blob: heic, toType: 'image/jpeg' }),
    )
    expect(upload).toHaveBeenCalledTimes(1)
  })

  test('un HEIC con file.type vacío se detecta por la extensión .heic', async () => {
    heic2any.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }))
    const heic = new File(['x'], 'IMG_0002.HEIC', { type: '' })
    await uploadImage(heic)
    expect(heic2any).toHaveBeenCalledTimes(1)
  })

  test('image/heif también entra por la rama de conversión', async () => {
    heic2any.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }))
    const heif = new File(['x'], 'foto.heif', { type: 'image/heif' })
    await uploadImage(heif)
    expect(heic2any).toHaveBeenCalledTimes(1)
  })

  test('heic2any acepta Blob[] (multi-imagen) y usa el primero', async () => {
    heic2any.mockResolvedValue([
      new Blob(['a'], { type: 'image/jpeg' }),
      new Blob(['b'], { type: 'image/jpeg' }),
    ])
    const heic = new File(['x'], 'live.heic', { type: 'image/heic' })
    await expect(uploadImage(heic)).resolves.toMatch(/\.jpg$/)
    expect(upload).toHaveBeenCalledTimes(1)
  })
})

// Issue #762: un usuario real se pegó ~190 intentos sin poder subir fotos.
// Diagnóstico confirmado con los datos de Sentry (LOCATIONGUESSER-R/N/Q/P):
// fotos de Android con `file.type` "image/jpeg" y nombre numérico (patrón
// típico del content-resolver del dispositivo) cuyo contenido real era HEIC —
// la detección por MIME/extensión nunca las reconocía como HEIC, así que el
// pipeline las mandaba directas a `<img>`, que agotaba TODAS sus vías
// (objectURL y FileReader→dataURL) sin nunca intentar la conversión. La
// detección ahora TAMBIÉN mira los primeros bytes del contenedor ISO-BMFF
// (caja `ftyp` + "major brand") cuando el MIME/extensión no lo delatan.
// TS tipa `Uint8Array` como genérico sobre su buffer (`ArrayBufferLike`), y
// `BlobPart` (constructor de `File`) solo acepta el caso fijo `ArrayBuffer` —
// en RUNTIME un `Uint8Array` normal siempre vale como parte de un `File`; el
// cast es puramente para satisfacer ese tipo más estricto.
function bytesFrom(values: number[]): BlobPart {
  return new Uint8Array(values) as unknown as BlobPart
}

function ftypHeaderBytes(brand: string): BlobPart {
  // Caja `ftyp` mínima y sintética (no hace falta un HEIC real/pesado para
  // probar la detección): [tamaño de caja, 4 bytes][ 'ftyp' ][ brand, 4 bytes ].
  const brandBytes = Array.from(brand).map((c) => c.charCodeAt(0))
  return bytesFrom([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, ...brandBytes])
}

describe('uploadImage — HEIC detectado por magic bytes, no por extensión/MIME (issue #762)', () => {
  test('un .jpg con MIME "image/jpeg" pero bytes reales de HEIC (major brand "heic") se detecta y convierte con heic2any', async () => {
    heic2any.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }))
    // Nombre numérico (patrón Android real de los eventos LOCATIONGUESSER-R/N).
    const disguised = new File([ftypHeaderBytes('heic')], '1000155420.jpg', {
      type: 'image/jpeg',
    })

    await uploadImage(disguised)

    expect(heic2any).toHaveBeenCalledTimes(1)
    expect(upload).toHaveBeenCalledTimes(1)
  })

  test('el "major brand" genérico HEIF ("mif1") también se reconoce como HEIC', async () => {
    heic2any.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }))
    const disguised = new File([ftypHeaderBytes('mif1')], 'foto.jpg', { type: 'image/jpeg' })

    await uploadImage(disguised)

    expect(heic2any).toHaveBeenCalledTimes(1)
  })

  test('un .jpg con magic bytes JPEG reales (FF D8 FF) nunca entra por la rama HEIC, aunque el nombre sea el patrón Android sospechoso', async () => {
    const realJpegBytes = bytesFrom([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])
    const jpeg = new File([realJpegBytes], '1000155420.jpg', { type: 'image/jpeg' })

    await uploadImage(jpeg)

    expect(heic2any).not.toHaveBeenCalled()
    expect(upload).toHaveBeenCalledTimes(1)
  })

  test('si no se pueden leer los bytes de cabecera, cae a la señal de MIME/extensión de siempre sin romper', async () => {
    const original = Blob.prototype.arrayBuffer
    Blob.prototype.arrayBuffer = () => Promise.reject(new Error('no soportado en este navegador'))
    try {
      heic2any.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }))
      const heic = new File(['x'], 'viejo.heic', { type: 'image/heic' })

      await uploadImage(heic)

      expect(heic2any).toHaveBeenCalledTimes(1)
    } finally {
      Blob.prototype.arrayBuffer = original
    }
  })

  test('el reporte a Sentry de un fallo de decodificación incluye los magic bytes de cabecera en hex', async () => {
    vi.stubGlobal('Image', fakeImageClass({ fails: true }))
    vi.stubGlobal('createImageBitmap', vi.fn())
    const bytes = bytesFrom([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ])
    const jpeg = new File([bytes], 'con-hex.jpg', { type: 'image/jpeg' })

    await uploadImage(jpeg).catch(() => {})

    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ magicBytesHex: 'ff d8 ff e0 00 10 4a 46 49 46 00 01' }),
    )
  })

  test('el reporte a Sentry de un fallo de conversión HEIC también incluye los magic bytes', async () => {
    heic2any.mockRejectedValue(new Error('libheif boom'))
    const heic = new File([ftypHeaderBytes('heic')], 'roto.heic', { type: 'image/heic' })

    await uploadImage(heic).catch(() => {})

    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        stage: 'heic_convert',
        magicBytesHex: expect.stringMatching(/^00 00 00 18 66 74 79 70/),
      }),
    )
  })
})

describe('uploadImage — diagnóstico de fallos a Sentry', () => {
  test('si la conversión HEIC falla, reporta a Sentry y lanza ImageDecodeError con el nombre', async () => {
    heic2any.mockRejectedValue(new Error('libheif boom'))
    const heic = new File(['x'.repeat(2048)], 'roto.heic', { type: 'image/heic' })
    const err = await uploadImage(heic).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ImageDecodeError)
    expect(err).toMatchObject({ fileName: 'roto.heic' })
    expect((err as Error).message).toMatch(/No se pudo leer la imagen/)
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        area: 'image_decode',
        stage: 'heic_convert',
        fileType: 'image/heic',
        fileName: 'roto.heic',
      }),
    )
    expect(upload).not.toHaveBeenCalled()
  })

  test('si el navegador no puede ni pintar el archivo en un <img>, lanza ImageDecodeError con el nombre', async () => {
    // Ni siquiera la vía "barata" (la misma que la miniatura del picker)
    // puede con el archivo: no hay fallback posible, createImageBitmap no
    // llega a intentarse.
    vi.stubGlobal('Image', fakeImageClass({ fails: true }))
    const bitmapSpy = vi.fn()
    vi.stubGlobal('createImageBitmap', bitmapSpy)
    const jpeg = new File(['x'], 'imposible.jpg', { type: 'image/jpeg' })

    await expect(uploadImage(jpeg)).rejects.toMatchObject({
      name: 'ImageDecodeError',
      fileName: 'imposible.jpg',
    })
    expect(bitmapSpy).not.toHaveBeenCalled()
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ area: 'image_decode', stage: 'decode', fileName: 'imposible.jpg' }),
    )
  })

  test('si createImageBitmap falla pero el <img> sí pudo cargar, usa el <img> como fallback y sube igual', async () => {
    // Este es el caso real del bug (#520): en algunos Android,
    // createImageBitmap revienta con fotos gigantes de la cámara aunque el
    // navegador SÍ pueda pintar la misma foto en un <img> (la miniatura del
    // selector se ve bien). El pipeline debe recomprimir igualmente.
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('no decode')))
    const jpeg = new File(['x'], 'foto-grande.jpg', { type: 'image/jpeg' })

    await expect(uploadImage(jpeg)).resolves.toMatch(/\.jpg$/)
    expect(upload).toHaveBeenCalledTimes(1)
    expect(heic2any).not.toHaveBeenCalled()
  })

  test('pide a createImageBitmap el tamaño YA reducido (bound al lado largo) para no reservar memoria a resolución nativa', async () => {
    // Foto de cámara Android típica: gigante y en retrato. Sin bound, el
    // bitmap nativo pesaría cientos de MB en RGBA y es justo lo que revienta.
    vi.stubGlobal('Image', fakeImageClass({ naturalWidth: 6000, naturalHeight: 8000 }))
    const bitmapSpy = vi.fn().mockResolvedValue({ width: 1200, height: 1600, close: vi.fn() })
    vi.stubGlobal('createImageBitmap', bitmapSpy)
    const jpeg = new File(['x'], 'foto-108mp.jpg', { type: 'image/jpeg' })

    await uploadImage(jpeg)

    expect(bitmapSpy).toHaveBeenCalledWith(
      jpeg,
      expect.objectContaining({ resizeWidth: 1200, resizeHeight: 1600 }),
    )
  })

  test('sin dimensiones naturales (0x0) no revienta: pide el bitmap sin resize', async () => {
    vi.stubGlobal('Image', fakeImageClass({ naturalWidth: 0, naturalHeight: 0 }))
    const bitmapSpy = vi.fn().mockResolvedValue({ width: 800, height: 600, close: vi.fn() })
    vi.stubGlobal('createImageBitmap', bitmapSpy)
    const jpeg = new File(['x'], 'sin-dimensiones.jpg', { type: 'image/jpeg' })

    await expect(uploadImage(jpeg)).resolves.toMatch(/\.jpg$/)
    const [, options] = bitmapSpy.mock.calls[0] as [File, Record<string, unknown>]
    expect(options).not.toHaveProperty('resizeWidth')
    expect(options).not.toHaveProperty('resizeHeight')
  })

  test('un JPEG con file.type vacío (típico de algunos Android) sube igual', async () => {
    const jpeg = new File(['x'], 'IMG_20260702.jpg', { type: '' })
    await expect(uploadImage(jpeg)).resolves.toMatch(/\.jpg$/)
    expect(heic2any).not.toHaveBeenCalled()
    expect(upload).toHaveBeenCalledTimes(1)
  })
})

describe('uploadImage — guardas y fallbacks del #550 (fotos de galería en Android)', () => {
  test('un archivo de 0 bytes (foto de Google Photos aún no descargada) da un mensaje accionable y reporta el motivo a Sentry', async () => {
    const cloudOnly = new File([], 'IMG_2026_cloud.jpg', { type: 'image/jpeg' })

    const err = await uploadImage(cloudOnly).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ImageDecodeError)
    expect((err as Error).message).toMatch(/descargada en el dispositivo/i)
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        area: 'image_decode',
        stage: 'decode',
        reason: 'empty_file',
        fileName: 'IMG_2026_cloud.jpg',
      }),
    )
    expect(upload).not.toHaveBeenCalled()
  })

  test('si el <img> por objectURL falla pero FileReader→dataURL sí puede, usa esa vía y sube igual (sin reportar fallo)', async () => {
    vi.stubGlobal(
      'Image',
      fakeImageClassBySrcPrefix((src) => src.startsWith('data:')),
    )
    const jpeg = new File(['x'], 'content-provider.jpg', { type: 'image/jpeg' })

    await expect(uploadImage(jpeg)).resolves.toMatch(/\.jpg$/)

    expect(upload).toHaveBeenCalledTimes(1)
    expect(reportError).not.toHaveBeenCalled()
  })

  test('si ni el objectURL ni el FileReader→dataURL pueden, reporta el detalle de AMBOS intentos y lanza ImageDecodeError', async () => {
    vi.stubGlobal('Image', fakeImageClass({ fails: true }))
    const bitmapSpy = vi.fn()
    vi.stubGlobal('createImageBitmap', bitmapSpy)
    const jpeg = new File(['x'], 'imposible-2.jpg', { type: 'image/jpeg' })

    await expect(uploadImage(jpeg)).rejects.toMatchObject({
      name: 'ImageDecodeError',
      fileName: 'imposible-2.jpg',
    })
    // No arriesgamos un decode a resolución nativa solo para diagnosticar
    // (sería reintroducir el riesgo de OOM que el #524 evitaba).
    expect(bitmapSpy).not.toHaveBeenCalled()
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        area: 'image_decode',
        stage: 'decode',
        reason: 'img_failed',
        usedFileReaderFallback: true,
        objectUrlError: expect.objectContaining({ message: expect.any(String) }),
        dataUrlError: expect.objectContaining({ message: expect.any(String) }),
        fileName: 'imposible-2.jpg',
        fileLastModified: jpeg.lastModified,
      }),
    )
  })

  test('si FileReader tampoco puede (sin soporte), el detalle del fallo lo identifica como error de FileReader', async () => {
    vi.stubGlobal('Image', fakeImageClass({ fails: true }))
    vi.stubGlobal('FileReader', fakeFileReaderClass({ fails: true }))
    const jpeg = new File(['x'], 'sin-filereader.jpg', { type: 'image/jpeg' })

    await expect(uploadImage(jpeg)).rejects.toMatchObject({ name: 'ImageDecodeError' })
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        dataUrlError: expect.objectContaining({ message: expect.stringMatching(/filereader/i) }),
      }),
    )
  })
})

describe('uploadImage — el reporte a Sentry agrupa bajo el mismo error que ve la app (#642)', () => {
  // Antes se reportaba el error INTERNO (DecodeFailure/Error genérico) y se
  // lanzaba un `ImageDecodeError` DISTINTO — dos tipos de excepción para el
  // mismo fallo, así que el evento con el detalle rico y el que de verdad ven
  // (y vuelven a reportar) los llamadores aguas abajo caían en issues
  // DIFERENTES de Sentry. Ahora se reporta el propio `ImageDecodeError` (con
  // el error interno como `.cause`), para que agrupen juntos.
  test('reporta el ImageDecodeError final (no el error interno) con el detalle rico como .cause', async () => {
    vi.stubGlobal('Image', fakeImageClass({ fails: true }))
    vi.stubGlobal('createImageBitmap', vi.fn())
    const jpeg = new File(['x'], 'agrupa.jpg', { type: 'image/jpeg' })

    await expect(uploadImage(jpeg)).rejects.toBeInstanceOf(ImageDecodeError)

    expect(reportError).toHaveBeenCalledTimes(1)
    const [reportedError] = reportError.mock.calls[0] as [Error]
    expect(reportedError).toBeInstanceOf(ImageDecodeError)
    expect(reportedError.cause).toBeInstanceOf(Error)
    expect((reportedError.cause as Error).name).toBe('DecodeFailure')
  })

  test('si el picker marcó el File con markFileSelection, el reporte añade batchSize y msSinceSelection', async () => {
    vi.stubGlobal('Image', fakeImageClass({ fails: true }))
    vi.stubGlobal('createImageBitmap', vi.fn())
    const jpeg = new File(['x'], 'con-meta.jpg', { type: 'image/jpeg' })
    markFileSelection(jpeg, 7)

    await uploadImage(jpeg).catch(() => {})

    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ batchSize: 7, msSinceSelection: expect.any(Number) }),
    )
  })

  test('sin markFileSelection (p.ej. un avatar, que no pasa por ningún picker de galería) no inventa esos campos', async () => {
    vi.stubGlobal('Image', fakeImageClass({ fails: true }))
    vi.stubGlobal('createImageBitmap', vi.fn())
    const jpeg = new File(['x'], 'sin-meta.jpg', { type: 'image/jpeg' })

    await uploadImage(jpeg).catch(() => {})

    const [, context] = reportError.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(context).not.toHaveProperty('batchSize')
    expect(context).not.toHaveProperty('msSinceSelection')
  })
})

// Clip corto (issue #649): duración ≤15s y tamaño ≤40MB, validados ANTES de
// aceptar el archivo (nunca al subir). Sin recompresión posible (a diferencia
// de una foto), así que estos dos límites son la ÚNICA guarda.
describe('validateVideoFile — límites v1 (issue #649)', () => {
  test('un vídeo de más de 40MB se rechaza por TAMAÑO, sin llegar a leer metadata', async () => {
    const instances = stubVideoElement()
    const big = new File(['x'], 'grande.mp4', { type: 'video/mp4' })
    Object.defineProperty(big, 'size', { value: MAX_VIDEO_BYTES + 1 })

    const err = await validateVideoFile(big).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(VideoValidationError)
    expect((err as VideoValidationError).reason).toBe('size')
    expect((err as Error).message).toMatch(/40 MB/)
    // Ni siquiera se creó el <video> oculto: el tamaño es más barato de mirar.
    expect(instances).toHaveLength(0)
  })

  test('un vídeo de más de 15s se rechaza por DURACIÓN', async () => {
    stubVideoElement({ duration: 20 })
    const file = new File(['x'], 'largo.mp4', { type: 'video/mp4' })

    const err = await validateVideoFile(file).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(VideoValidationError)
    expect((err as VideoValidationError).reason).toBe('duration')
    expect((err as Error).message).toMatch(new RegExp(`${MAX_VIDEO_DURATION_SECONDS}s`))
  })

  test('un vídeo dentro de los límites (≤15s, ≤40MB) pasa y devuelve sus metadatos', async () => {
    stubVideoElement({ duration: 8, videoWidth: 1080, videoHeight: 1920 })
    const file = new File(['x'], 'corto.mp4', { type: 'video/mp4' })

    await expect(validateVideoFile(file)).resolves.toEqual({
      durationSeconds: 8,
      width: 1080,
      height: 1920,
    })
  })

  test('un vídeo justo en el límite de duración (15s exactos) SÍ pasa', async () => {
    stubVideoElement({ duration: MAX_VIDEO_DURATION_SECONDS })
    const file = new File(['x'], 'justo.mp4', { type: 'video/mp4' })

    await expect(validateVideoFile(file)).resolves.toMatchObject({
      durationSeconds: MAX_VIDEO_DURATION_SECONDS,
    })
  })

  test('si el navegador no puede leer el vídeo, lanza VideoValidationError con reason "unreadable"', async () => {
    stubVideoElement({ failsMetadata: true })
    const file = new File(['x'], 'roto.mp4', { type: 'video/mp4' })

    const err = await validateVideoFile(file).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(VideoValidationError)
    expect((err as VideoValidationError).reason).toBe('unreadable')
    expect((err as Error).message).toMatch(/roto\.mp4/)
  })
})

describe('extractVideoCoverFrame — fotograma-portada del clip (issue #649)', () => {
  test('seek a 0.5s, dibuja el frame en canvas y exporta JPEG por la MISMA tubería que una foto', async () => {
    const instances = stubVideoElement({ duration: 10, videoWidth: 640, videoHeight: 360 })
    const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' })

    const frame = await extractVideoCoverFrame(file)

    expect(frame.name).toBe('clip-portada.jpg')
    expect(frame.type).toBe('image/jpeg')
    expect(instances[0].currentTime).toBe(0.5)
  })

  test('un clip MÁS CORTO que 1s hace seek a la MITAD de su duración, no a 0.5s fijo', async () => {
    const instances = stubVideoElement({ duration: 0.6 })
    const file = new File(['x'], 'clip-cortisimo.mp4', { type: 'video/mp4' })

    await extractVideoCoverFrame(file)

    expect(instances[0].currentTime).toBe(0.3)
  })

  test('si el navegador no puede leer el vídeo, propaga el error (sin subir nada)', async () => {
    stubVideoElement({ failsMetadata: true })
    const file = new File(['x'], 'roto.mp4', { type: 'video/mp4' })

    await expect(extractVideoCoverFrame(file)).rejects.toThrow()
  })
})

describe('videoExtensionForMime — SIN el mapeo audio-only mp4→m4a (issue #649)', () => {
  test('video/mp4 → mp4 (a diferencia de extensionForMime, que lo mapea a m4a para audio)', () => {
    expect(videoExtensionForMime('video/mp4')).toBe('mp4')
  })

  test('video/webm → webm', () => {
    expect(videoExtensionForMime('video/webm')).toBe('webm')
  })

  test('mime vacío o irreconocible → mp4 por defecto', () => {
    expect(videoExtensionForMime('')).toBe('mp4')
  })
})

describe('uploadVideo — sube al bucket images bajo el prefijo video/ (issue #649)', () => {
  test('sube SIN transcodificar, con el path video/<uuid>.<ext> y el content-type real', async () => {
    const file = new File(['bytes'], 'clip.mp4', { type: 'video/mp4' })

    const path = await uploadVideo(file, 'video/mp4')

    expect(path).toMatch(/^video\/[0-9a-f-]+\.mp4$/)
    expect(upload).toHaveBeenCalledWith(
      path,
      file,
      expect.objectContaining({ contentType: 'video/mp4' }),
    )
  })

  test('si Storage devuelve error, lo propaga (no lo traga en silencio)', async () => {
    upload.mockResolvedValueOnce({ error: new Error('storage boom') })
    const file = new File(['x'], 'a.mp4', { type: 'video/mp4' })
    await expect(uploadVideo(file, 'video/mp4')).rejects.toThrow('storage boom')
  })
})
