import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MomentImage } from '../../lib/momentImages'

// Mocks de la capa de datos: la galería solo orquesta estas funciones; aislamos la BD.
const listMomentImagesMock = vi.fn<(id: string) => Promise<MomentImage[]>>()
const removeMomentImageMock = vi.fn<(id: string, imageId: string) => Promise<void>>()
const setMomentCoverMock = vi.fn<(id: string, imageId: string) => Promise<void>>()

vi.mock('../../lib/momentImages', () => ({
  listMomentImages: (id: string) => listMomentImagesMock(id),
  removeMomentImage: (id: string, imageId: string) => removeMomentImageMock(id, imageId),
  setMomentCover: (id: string, imageId: string) => setMomentCoverMock(id, imageId),
  addMomentImages: vi.fn(),
}))

// URLs firmadas y subida: irrelevantes para estos tests (no tocamos Storage aquí).
vi.mock('../../lib/storage', () => ({
  signedImageUrl: (path: string) => Promise.resolve(`signed://${path}`),
  uploadImage: vi.fn(),
}))

// El lightbox (portal pesado) no aporta a estos tests; lo neutralizamos.
vi.mock('../../ui/Lightbox', () => ({ Lightbox: () => null }))

import { MomentGallery } from './MomentGallery'
import { ToastProvider } from '../../ui'

const IMAGES: MomentImage[] = [
  {
    id: 'img-1',
    challenge_id: 'c1',
    image_path: 'a.jpg',
    sort_order: 0,
    created_at: '2026-06-28T10:00:00.000Z',
  },
  {
    id: 'img-2',
    challenge_id: 'c1',
    image_path: 'b.jpg',
    sort_order: 1,
    created_at: '2026-06-28T10:00:00.000Z',
  },
]

function renderGallery(canEdit = true) {
  return render(
    <ToastProvider>
      <MomentGallery
        challengeId="c1"
        initialCoverUrl={null}
        canEdit={canEdit}
        onChanged={vi.fn()}
      />
    </ToastProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  listMomentImagesMock.mockResolvedValue(IMAGES)
  removeMomentImageMock.mockResolvedValue(undefined)
  setMomentCoverMock.mockResolvedValue(undefined)
})

describe('MomentGallery', () => {
  test('quitar una foto pide confirmación (dos toques) antes de borrar', async () => {
    const user = userEvent.setup()
    renderGallery()

    // La galería carga sus fotos (segunda foto = no portada, con papelera).
    const removeButtons = await screen.findAllByRole('button', { name: 'Quitar foto' })
    // Primer toque: NO borra aún, arma la confirmación.
    await user.click(removeButtons[removeButtons.length - 1])
    expect(removeMomentImageMock).not.toHaveBeenCalled()

    // Aparece la confirmación en línea; el segundo toque sí borra.
    const confirm = await screen.findByRole('button', { name: 'Confirmar quitar foto' })
    await user.click(confirm)
    expect(removeMomentImageMock).toHaveBeenCalledWith('c1', 'img-2')
  })

  test('cancelar la confirmación no borra la foto', async () => {
    const user = userEvent.setup()
    renderGallery()

    const removeButtons = await screen.findAllByRole('button', { name: 'Quitar foto' })
    await user.click(removeButtons[removeButtons.length - 1])
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))

    expect(removeMomentImageMock).not.toHaveBeenCalled()
    // Y vuelve a mostrarse la papelera (no la confirmación).
    expect(screen.getAllByRole('button', { name: 'Quitar foto' }).length).toBeGreaterThan(0)
  })

  test('sin permiso de dueño no hay controles de edición', async () => {
    renderGallery(false)
    // Espera a que cargue y comprueba que no hay papelera ni "añadir".
    await screen.findAllByRole('button', { name: 'Ampliar foto' })
    expect(screen.queryByRole('button', { name: 'Quitar foto' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Añadir más fotos a la galería')).not.toBeInTheDocument()
  })
})
