import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MomentGalleryMeta, MomentImage } from '../../lib/momentImages'

// Mocks de la capa de datos: la galería solo orquesta estas funciones; aislamos la BD.
const listMomentImagesMock = vi.fn<(id: string) => Promise<MomentImage[]>>()
const removeMomentImageMock = vi.fn<(id: string, imageId: string) => Promise<void>>()
const setMomentCoverMock = vi.fn<(id: string, imageId: string) => Promise<void>>()
// Flag de orden manual (#952) + portada por path (#954): por defecto orden
// auto y portada = 'a.jpg' (img-1) — cada test que necesite otro estado lo
// sobreescribe con `mockResolvedValue(...)`.
const getMomentGalleryMetaMock = vi.fn<(id: string) => Promise<MomentGalleryMeta>>()
const reorderMomentImagesMock = vi.fn<(id: string, orderedIds: string[]) => Promise<void>>()
const setPhotosAutoOrderMock = vi.fn<(id: string) => Promise<void>>()

vi.mock('../../lib/momentImages', () => ({
  listMomentImages: (id: string) => listMomentImagesMock(id),
  removeMomentImage: (id: string, imageId: string) => removeMomentImageMock(id, imageId),
  setMomentCover: (id: string, imageId: string) => setMomentCoverMock(id, imageId),
  addMomentImages: vi.fn(),
  getMomentGalleryMeta: (id: string) => getMomentGalleryMetaMock(id),
  reorderMomentImages: (id: string, orderedIds: string[]) =>
    reorderMomentImagesMock(id, orderedIds),
  setPhotosAutoOrder: (id: string) => setPhotosAutoOrderMock(id),
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
    taken_at: null,
    gps_lat: null,
    gps_lng: null,
    sort_at: '2026-06-28T10:00:00.000Z',
    created_at: '2026-06-28T10:00:00.000Z',
  },
  {
    id: 'img-2',
    challenge_id: 'c1',
    image_path: 'b.jpg',
    sort_order: 1,
    taken_at: null,
    gps_lat: null,
    gps_lng: null,
    sort_at: '2026-06-28T10:00:00.000Z',
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
  // Portada por defecto = 'a.jpg' (img-1), igual que antes de #954 (menor sort_order).
  getMomentGalleryMetaMock.mockResolvedValue({ manualOrder: false, coverPath: 'a.jpg' })
  reorderMomentImagesMock.mockResolvedValue(undefined)
  setPhotosAutoOrderMock.mockResolvedValue(undefined)
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

  test('la portada la marca challenges.image_path, no sort_order ni la posición [0] (#954)', async () => {
    // 'img-2' viene PRIMERO en la lista (orden de captura, sort_at) y tiene
    // sort_order mayor, pero la portada real es la que coincide con el path
    // devuelto por getMomentGalleryMeta ('a.jpg' = img-1). El badge y el botón
    // "Marcar como portada" deben seguir al path, no a sort_order ni posición.
    listMomentImagesMock.mockResolvedValue([
      { ...IMAGES[1], sort_order: 1 },
      { ...IMAGES[0], sort_order: 0 },
    ])
    getMomentGalleryMetaMock.mockResolvedValue({ manualOrder: false, coverPath: 'a.jpg' })
    renderGallery()

    await screen.findAllByRole('button', { name: 'Ampliar foto' })
    // Solo una foto con "Marcar como portada" (la que NO es portada: 'img-2').
    const coverButtons = screen.getAllByRole('button', { name: 'Marcar como portada' })
    expect(coverButtons).toHaveLength(1)
    expect(screen.getByText('Portada')).toBeInTheDocument()
  })

  test('sin permiso de dueño no se ofrece "Ordenar fotos"', async () => {
    renderGallery(false)
    await screen.findAllByRole('button', { name: 'Ampliar foto' })
    expect(screen.queryByRole('button', { name: 'Ordenar fotos' })).not.toBeInTheDocument()
  })

  test('orden por defecto (auto): no se ofrece "Volver a orden por fecha"', async () => {
    getMomentGalleryMetaMock.mockResolvedValue({ manualOrder: false, coverPath: 'a.jpg' })
    renderGallery()
    await screen.findAllByRole('button', { name: 'Ampliar foto' })
    expect(
      screen.queryByRole('button', { name: 'Volver a orden por fecha' }),
    ).not.toBeInTheDocument()
  })

  test('orden manual (#952): se ofrece "Volver a orden por fecha" y lo desactiva al tocarlo', async () => {
    const user = userEvent.setup()
    getMomentGalleryMetaMock.mockResolvedValue({ manualOrder: true, coverPath: 'a.jpg' })
    renderGallery()

    const autoOrderBtn = await screen.findByRole('button', { name: 'Volver a orden por fecha' })
    await user.click(autoOrderBtn)
    expect(setPhotosAutoOrderMock).toHaveBeenCalledWith('c1')
  })

  test('"Ordenar fotos" cambia a la cuadrícula de reordenar con fallback de teclado', async () => {
    const user = userEvent.setup()
    renderGallery()

    await screen.findAllByRole('button', { name: 'Ampliar foto' })
    await user.click(screen.getByRole('button', { name: 'Ordenar fotos' }))

    // En la cuadrícula ya no está el carrusel de swipe (sin "Ampliar foto"),
    // pero sí el fallback de teclado ←/→ de cada miniatura.
    expect(screen.queryByRole('button', { name: 'Ampliar foto' })).not.toBeInTheDocument()
    const moveRightButtons = screen.getAllByRole('button', { name: 'Mover foto a la derecha' })
    expect(moveRightButtons).toHaveLength(2)
    // La 1ª foto no puede moverse más a la izquierda (ya es la primera).
    expect(screen.getAllByRole('button', { name: 'Mover foto a la izquierda' })[0]).toBeDisabled()

    // Mover la 1ª foto (img-1) a la derecha: reasigna orden ['img-2', 'img-1'].
    await user.click(moveRightButtons[0])
    expect(reorderMomentImagesMock).toHaveBeenCalledWith('c1', ['img-2', 'img-1'])
  })

  test('al persistir el reorden, recarga la galería para que el carrusel refleje el nuevo orden (#954)', async () => {
    const user = userEvent.setup()
    renderGallery()

    await screen.findAllByRole('button', { name: 'Ampliar foto' })
    await user.click(screen.getByRole('button', { name: 'Ordenar fotos' }))
    const moveRightButtons = screen.getAllByRole('button', { name: 'Mover foto a la derecha' })

    // Solo la carga inicial hasta aquí; tras mover y persistir con éxito debe
    // volver a llamar a listMomentImages (load()) para refrescar `images`, que
    // es lo que pinta el carrusel — antes de #954 solo se llamaba onChanged().
    expect(listMomentImagesMock).toHaveBeenCalledTimes(1)
    await user.click(moveRightButtons[0])
    await waitFor(() => expect(listMomentImagesMock).toHaveBeenCalledTimes(2))
  })

  test('el botón "Ordenar fotos" cambia a "Listo" y vuelve al carrusel al tocarlo de nuevo', async () => {
    const user = userEvent.setup()
    renderGallery()

    await screen.findAllByRole('button', { name: 'Ampliar foto' })
    await user.click(screen.getByRole('button', { name: 'Ordenar fotos' }))
    const doneBtn = await screen.findByRole('button', { name: 'Listo' })
    await user.click(doneBtn)

    expect(await screen.findAllByRole('button', { name: 'Ampliar foto' })).toHaveLength(2)
  })
})
