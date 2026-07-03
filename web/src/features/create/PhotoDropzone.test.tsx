import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '../../ui'

const markFileSelectionMock = vi.fn()
vi.mock('../../lib/storage', () => ({
  markFileSelection: (...args: unknown[]) => markFileSelectionMock(...args),
}))

import { PhotoDropzone } from './PhotoDropzone'

function renderDropzone() {
  const onPick = vi.fn()
  const onClear = vi.fn()
  render(
    <ToastProvider>
      <PhotoDropzone preview={null} onPick={onPick} onClear={onClear} />
    </ToastProvider>,
  )
  return { onPick, onClear }
}

function fakeFile(name: string, content = 'contenido'): File {
  return new File([content], name, { type: 'image/jpeg' })
}

describe('PhotoDropzone — copia al seleccionar (#642)', () => {
  beforeEach(() => {
    markFileSelectionMock.mockClear()
  })

  test('sustituye el File por una copia propia (misma info, distinta referencia) y la marca como lote de 1', async () => {
    const user = userEvent.setup()
    const { onPick } = renderDropzone()
    const original = fakeFile('sitio.jpg')

    await user.upload(screen.getByLabelText('Añadir foto del sitio'), original)

    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1))
    const copy = onPick.mock.calls[0][0] as File
    expect(copy).not.toBe(original)
    expect(copy.name).toBe('sitio.jpg')
    expect(copy.type).toBe('image/jpeg')
    await expect(copy.text()).resolves.toBe('contenido')
    expect(markFileSelectionMock).toHaveBeenCalledWith(copy, 1)
  })

  test('si arrayBuffer() falla al seleccionar, no llama a onPick (no entra al estado) y avisa', async () => {
    const user = userEvent.setup()
    const { onPick } = renderDropzone()
    const broken = fakeFile('rota.jpg')
    vi.spyOn(broken, 'arrayBuffer').mockRejectedValue(new Error('boom'))

    await user.upload(screen.getByLabelText('Añadir foto del sitio'), broken)

    expect(await screen.findByText('«rota.jpg» no se pudo leer')).toBeInTheDocument()
    expect(onPick).not.toHaveBeenCalled()
  })
})
