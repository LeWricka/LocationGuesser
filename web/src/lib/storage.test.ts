import { describe, test, expect, vi, beforeEach } from 'vitest'

// Las factories de vi.mock se elevan al inicio del fichero; declaramos los
// espías con vi.hoisted para que estén inicializados cuando corren.
const { heic2any, upload, reportError } = vi.hoisted(() => ({
  // heic2any: import dinámico que storage.ts solo usa cuando llega un HEIC.
  heic2any: vi.fn(),
  // Supabase Storage: comprobamos que se sube algo, sin red.
  upload: vi.fn(),
  // Observabilidad: espiamos qué se reporta a Sentry en los fallos.
  reportError: vi.fn(),
}))

vi.mock('heic2any', () => ({
  default: heic2any,
}))

vi.mock('./supabase', () => ({
  supabase: {
    storage: { from: () => ({ upload }) },
  },
}))

vi.mock('./observability', () => ({
  reportError,
}))

import { uploadImage } from './storage'

// `createImageBitmap` y `<canvas>` no existen (o no pintan) en jsdom: los
// stubeamos para que el pipeline de decodificación/canvas resuelva sin tocar
// píxeles reales. Así el test se centra en el ENRUTADO (HEIC sí / JPEG no).
function stubDecodePipeline() {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn().mockResolvedValue({ width: 800, height: 600, close: vi.fn() }),
  )
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
  test('si la conversión HEIC falla, reporta a Sentry y lanza el error legible', async () => {
    heic2any.mockRejectedValue(new Error('libheif boom'))
    const heic = new File(['x'.repeat(2048)], 'roto.heic', { type: 'image/heic' })
    await expect(uploadImage(heic)).rejects.toThrow(/No se pudo leer la imagen/)
    expect(reportError).toHaveBeenCalledTimes(1)
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

  test('si la decodificación falla (createImageBitmap e <img>), reporta y propaga', async () => {
    // Forzamos el fallo de ambos caminos de decodeImage para un JPEG.
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('no decode')))
    // jsdom no resuelve img.decode() con éxito: rechaza por sí mismo, así que
    // decodeImage lanza el error legible.
    const jpeg = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })
    await expect(uploadImage(jpeg)).rejects.toThrow()
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ area: 'image_decode', stage: 'decode', fileType: 'image/jpeg' }),
    )
    expect(heic2any).not.toHaveBeenCalled()
  })
})
