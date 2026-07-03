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
  signedImageUrl,
  ImageDecodeError,
  SIGNED_URL_TTL_SECONDS,
  markFileSelection,
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
