import type { ComponentProps } from 'react'
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '../../ui'

// Espiamos `markFileSelection` (storage.ts) sin arrastrar el resto del
// pipeline de subida — este picker solo necesita marcar la copia, no
// comprimir/subir nada. El vídeo (#649) se mockea aparte: cada test de esa
// sección fija su propio comportamiento de validación/extracción.
const markFileSelectionMock = vi.fn()
const validateVideoFileMock = vi.fn()
const extractVideoCoverFrameMock = vi.fn()
vi.mock('../../lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/storage')>()
  return {
    // `VideoValidationError` viene del módulo REAL: el picker hace
    // `instanceof` con ella, así que debe ser la misma clase que usan los
    // mocks de abajo al rechazar/lanzar.
    VideoValidationError: actual.VideoValidationError,
    markFileSelection: (...args: unknown[]) => markFileSelectionMock(...args),
    validateVideoFile: (...args: unknown[]) => validateVideoFileMock(...args),
    extractVideoCoverFrame: (...args: unknown[]) => extractVideoCoverFrameMock(...args),
  }
})

import { MomentGalleryPicker, MAX_PHOTOS } from './MomentGalleryPicker'
import { VideoValidationError } from '../../lib/storage'
import type { DraftPhoto } from './MomentGalleryPicker'

function renderPicker(extraProps: Partial<ComponentProps<typeof MomentGalleryPicker>> = {}) {
  const onAdd = vi.fn()
  const onRemove = vi.fn()
  const onMakeCover = vi.fn()
  const onAddVideo = vi.fn()
  render(
    <ToastProvider>
      <MomentGalleryPicker
        photos={[]}
        onAdd={onAdd}
        onRemove={onRemove}
        onMakeCover={onMakeCover}
        onAddVideo={onAddVideo}
        {...extraProps}
      />
    </ToastProvider>,
  )
  return { onAdd, onRemove, onMakeCover, onAddVideo }
}

function fakeFile(name: string, content = 'contenido'): File {
  return new File([content], name, { type: 'image/jpeg' })
}

function fakeVideoFile(name = 'clip.mp4', content = 'video-bytes'): File {
  return new File([content], name, { type: 'video/mp4' })
}

/** N fotos ya "en el estado" (como si el padre ya las hubiese añadido), para
 * probar el tope MAX_PHOTOS sin depender de subir N archivos de verdad. */
function fakeDraftPhotos(count: number): DraftPhoto[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `photo-${i}`,
    file: fakeFile(`foto-${i}.jpg`),
    previewUrl: `blob:foto-${i}`,
  }))
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('MomentGalleryPicker — copia al seleccionar (#642)', () => {
  beforeEach(() => {
    markFileSelectionMock.mockClear()
  })

  test('sustituye cada File por una copia propia (misma info, distinta referencia) y la marca con el tamaño del lote', async () => {
    const user = userEvent.setup()
    const { onAdd } = renderPicker()
    const original = fakeFile('playa.jpg')

    await user.upload(screen.getByLabelText('Añadir fotos del día'), [original])

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1))
    const [copies] = onAdd.mock.calls[0] as [File[]]
    expect(copies).toHaveLength(1)
    const copy = copies[0]
    expect(copy).not.toBe(original)
    expect(copy.name).toBe('playa.jpg')
    expect(copy.type).toBe('image/jpeg')
    await expect(copy.text()).resolves.toBe('contenido')
    expect(markFileSelectionMock).toHaveBeenCalledWith(copy, 1)
  })

  test('lee los ficheros del lote EN SECUENCIA, no en paralelo', async () => {
    const user = userEvent.setup()
    const { onAdd } = renderPicker()
    const order: string[] = []
    const gate = deferred<ArrayBuffer>()

    const first = fakeFile('a.jpg')
    const second = fakeFile('b.jpg')
    vi.spyOn(first, 'arrayBuffer').mockImplementation(async () => {
      order.push('a:start')
      const buf = await gate.promise
      order.push('a:end')
      return buf
    })
    vi.spyOn(second, 'arrayBuffer').mockImplementation(async () => {
      order.push('b:start')
      return new TextEncoder().encode('b').buffer as ArrayBuffer
    })

    const uploadPromise = user.upload(screen.getByLabelText('Añadir fotos del día'), [
      first,
      second,
    ])

    // `b` no debe empezar a leerse hasta que `a` haya terminado del todo.
    await waitFor(() => expect(order).toEqual(['a:start']))
    gate.resolve(new TextEncoder().encode('a').buffer as ArrayBuffer)
    await uploadPromise

    expect(order).toEqual(['a:start', 'a:end', 'b:start'])
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1))
  })
})

describe('MomentGalleryPicker — fallo al leer al seleccionar (#642)', () => {
  beforeEach(() => {
    markFileSelectionMock.mockClear()
  })

  test('si arrayBuffer() falla YA al seleccionar, esa foto NO entra al estado: aviso + tile de error', async () => {
    const user = userEvent.setup()
    const { onAdd } = renderPicker()
    const broken = fakeFile('rota.jpg')
    vi.spyOn(broken, 'arrayBuffer').mockRejectedValue(new Error('boom'))

    await user.upload(screen.getByLabelText('Añadir fotos del día'), [broken])

    expect(
      await screen.findByText('«rota.jpg» no se pudo leer — ¿está descargada?'),
    ).toBeInTheDocument()
    expect(screen.getByText('rota.jpg')).toBeInTheDocument()
    expect(screen.getByText('No se pudo leer')).toBeInTheDocument()
    expect(onAdd).not.toHaveBeenCalled()
  })

  test('en un lote mixto, las que sí se leen entran al formulario y las que fallan se quedan fuera', async () => {
    const user = userEvent.setup()
    const { onAdd } = renderPicker()
    const ok = fakeFile('buena.jpg')
    const broken = fakeFile('rota.jpg')
    vi.spyOn(broken, 'arrayBuffer').mockRejectedValue(new Error('boom'))

    await user.upload(screen.getByLabelText('Añadir fotos del día'), [ok, broken])

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1))
    const [copies] = onAdd.mock.calls[0] as [File[]]
    expect(copies.map((f) => f.name)).toEqual(['buena.jpg'])
    expect(await screen.findByText('rota.jpg')).toBeInTheDocument()
  })
})

describe('MomentGalleryPicker — clip de vídeo corto (issue #649)', () => {
  beforeEach(() => {
    markFileSelectionMock.mockClear()
    validateVideoFileMock.mockReset()
    extractVideoCoverFrameMock.mockReset()
  })

  test('un vídeo válido: valida, extrae el fotograma y avisa al padre con ambos', async () => {
    validateVideoFileMock.mockResolvedValue({ durationSeconds: 8, width: 640, height: 360 })
    const frame = new File(['frame-bytes'], 'clip-portada.jpg', { type: 'image/jpeg' })
    extractVideoCoverFrameMock.mockResolvedValue(frame)
    const { onAddVideo, onAdd } = renderPicker()

    await userEvent.upload(screen.getByLabelText('Añadir fotos del día'), [fakeVideoFile()])

    await waitFor(() => expect(onAddVideo).toHaveBeenCalledTimes(1))
    const [file, mimeType, coverFrame] = onAddVideo.mock.calls[0] as [File, string, File]
    expect(file.name).toBe('clip.mp4')
    expect(mimeType).toBe('video/mp4')
    expect(coverFrame).toBe(frame)
    expect(validateVideoFileMock).toHaveBeenCalledTimes(1)
    // El vídeo NUNCA entra por `onAdd` (esa vía es solo para fotos sueltas).
    expect(onAdd).not.toHaveBeenCalled()
  })

  test('un vídeo que no pasa la validación (p.ej. dura más de 15s) no entra: aviso claro, sin extraer fotograma', async () => {
    validateVideoFileMock.mockRejectedValue(
      new VideoValidationError('duration', 'El vídeo dura 20s; el máximo es 15s.'),
    )
    const { onAddVideo } = renderPicker()

    await userEvent.upload(screen.getByLabelText('Añadir fotos del día'), [fakeVideoFile()])

    expect(await screen.findByText('El vídeo dura 20s; el máximo es 15s.')).toBeInTheDocument()
    expect(extractVideoCoverFrameMock).not.toHaveBeenCalled()
    expect(onAddVideo).not.toHaveBeenCalled()
  })

  test('un segundo vídeo se rechaza cuando ya hay un clip (UN clip por recuerdo, v1)', async () => {
    const { onAddVideo } = renderPicker({ hasVideo: true })

    await userEvent.upload(screen.getByLabelText('Añadir fotos del día'), [fakeVideoFile()])

    expect(await screen.findByText(/ya hay un clip en este recuerdo/i)).toBeInTheDocument()
    expect(validateVideoFileMock).not.toHaveBeenCalled()
    expect(onAddVideo).not.toHaveBeenCalled()
  })

  test('el fotograma-portada del clip se pinta con el badge ▶ en la tira', () => {
    renderPicker({
      photos: [{ id: 'frame-1', file: fakeFile('clip-portada.jpg'), previewUrl: 'blob:frame' }],
      videoFrameId: 'frame-1',
      hasVideo: true,
    })

    expect(screen.getByLabelText('Quitar clip')).toBeInTheDocument()
  })
})

describe('MomentGalleryPicker — tope de fotos por recuerdo (#911)', () => {
  test('ya en el tope: no lee nada, avisa y no llama a onAdd', async () => {
    const user = userEvent.setup()
    const { onAdd } = renderPicker({ photos: fakeDraftPhotos(MAX_PHOTOS) })

    await user.upload(screen.getByLabelText('Añadir más fotos'), [fakeFile('extra.jpg')])

    expect(
      await screen.findByText(
        `Ya tienes el máximo de ${MAX_PHOTOS} fotos en este recuerdo. Quita alguna para añadir otra.`,
      ),
    ).toBeInTheDocument()
    expect(onAdd).not.toHaveBeenCalled()
  })

  test('selección que se pasa del hueco disponible: añade solo hasta completar el tope y avisa de las ignoradas', async () => {
    const user = userEvent.setup()
    const already = MAX_PHOTOS - 2
    const { onAdd } = renderPicker({ photos: fakeDraftPhotos(already) })

    await user.upload(screen.getByLabelText('Añadir más fotos'), [
      fakeFile('a.jpg'),
      fakeFile('b.jpg'),
      fakeFile('c.jpg'),
    ])

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1))
    const [copies] = onAdd.mock.calls[0] as [File[]]
    expect(copies.map((f) => f.name)).toEqual(['a.jpg', 'b.jpg'])
    expect(
      await screen.findByText(
        `Máximo ${MAX_PHOTOS} fotos por recuerdo: se añaden 2 y se ignoran 1.`,
      ),
    ).toBeInTheDocument()
  })

  test('selección que cabe entera dentro del hueco: no avisa de nada', async () => {
    const user = userEvent.setup()
    const already = MAX_PHOTOS - 5
    const { onAdd } = renderPicker({ photos: fakeDraftPhotos(already) })

    await user.upload(screen.getByLabelText('Añadir más fotos'), [fakeFile('a.jpg')])

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/máximo/i)).not.toBeInTheDocument()
  })
})
