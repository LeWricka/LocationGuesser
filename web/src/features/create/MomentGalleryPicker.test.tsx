import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '../../ui'

// Espiamos `markFileSelection` (storage.ts) sin arrastrar el resto del
// pipeline de subida — este picker solo necesita marcar la copia, no
// comprimir/subir nada.
const markFileSelectionMock = vi.fn()
vi.mock('../../lib/storage', () => ({
  markFileSelection: (...args: unknown[]) => markFileSelectionMock(...args),
}))

import { MomentGalleryPicker } from './MomentGalleryPicker'

function renderPicker() {
  const onAdd = vi.fn()
  const onRemove = vi.fn()
  const onMakeCover = vi.fn()
  render(
    <ToastProvider>
      <MomentGalleryPicker
        photos={[]}
        onAdd={onAdd}
        onRemove={onRemove}
        onMakeCover={onMakeCover}
      />
    </ToastProvider>,
  )
  return { onAdd, onRemove, onMakeCover }
}

function fakeFile(name: string, content = 'contenido'): File {
  return new File([content], name, { type: 'image/jpeg' })
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
