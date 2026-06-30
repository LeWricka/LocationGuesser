import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Moment } from '../../lib/trip'

// Mocks de la capa de datos: la hoja solo orquesta estas funciones; aislamos la BD.
const updateChallengeDescriptionMock = vi.fn<(id: string, desc: string) => Promise<void>>()
const updateMomentMock = vi.fn<(...args: unknown[]) => Promise<unknown>>()
const promoteToChallengeMock = vi.fn<(...args: unknown[]) => Promise<unknown>>()
const deleteChallengeMock = vi.fn<(...args: unknown[]) => Promise<void>>()

vi.mock('../../lib/challenges', () => ({
  updateChallengeDescription: (id: string, desc: string) =>
    updateChallengeDescriptionMock(id, desc),
  updateMoment: (...args: unknown[]) => updateMomentMock(...args),
  promoteToChallenge: (...args: unknown[]) => promoteToChallengeMock(...args),
  deleteChallenge: (...args: unknown[]) => deleteChallengeMock(...args),
}))

// MapPicker (Leaflet) y la galería (storage/URLs firmadas) son pesados e irrelevantes
// para estos tests; los stubbeamos por marcadores ligeros.
vi.mock('../create/MapPicker', () => ({ MapPicker: () => <div data-testid="map-picker" /> }))
vi.mock('./MomentGallery', () => ({ MomentGallery: () => <div data-testid="gallery" /> }))

import { MomentSheet } from './MomentSheet'
import { ToastProvider } from '../../ui'

// Recuerdo (sin reto) completo, propiedad del usuario, con descripción ya escrita.
const RECUERDO: Moment = {
  challengeId: 'c1',
  title: 'Aguas turquesa',
  description: 'La cala entera para nosotros.',
  status: 'recuerdo',
  isChallenge: false,
  date: '2026-06-28T10:00:00.000Z',
  deadlineAt: null,
  imageUrl: 'https://example.test/foto.jpg',
  imagePath: 'path/foto.jpg',
  lat: 39.9,
  lng: 3.9,
  guessedCount: 0,
  guessSeconds: null,
  svPanoId: null,
  country: { code: 'ES', name: 'ESPAÑA', flag: '🇪🇸' },
}

function renderSheet(props: Partial<Parameters<typeof MomentSheet>[0]> = {}) {
  return render(
    <ToastProvider>
      <MomentSheet moment={RECUERDO} canEdit onClose={vi.fn()} {...props} />
    </ToastProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  updateChallengeDescriptionMock.mockResolvedValue(undefined)
})

describe('MomentSheet', () => {
  test('muestra título, descripción y el lugar del momento', () => {
    renderSheet()
    expect(screen.getByRole('heading', { name: 'Aguas turquesa' })).toBeInTheDocument()
    expect(screen.getByText('La cala entera para nosotros.')).toBeInTheDocument()
    // El país aparece en la tarjeta-mapa y en la meta-línea (hay coincidencias).
    expect(screen.getAllByText(/ESPAÑA/).length).toBeGreaterThan(0)
  })

  test('editar la descripción guarda en BD y dispara onEdited (fix #313)', async () => {
    const user = userEvent.setup()
    const onEdited = vi.fn()
    renderSheet({ onEdited })

    // Abrir el editor inline de descripción (el botón "Editar" junto al texto, no
    // "Editar recuerdo" de las acciones del dueño).
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    const area = screen.getByPlaceholderText(/Cuenta el día/i)
    await user.clear(area)
    await user.type(area, 'Descripción nueva')

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    // Persiste el texto nuevo...
    expect(updateChallengeDescriptionMock).toHaveBeenCalledWith('c1', 'Descripción nueva')
    // ...y AVISA al padre para refrescar el viaje (sin esto la edición "no se guardaba").
    expect(onEdited).toHaveBeenCalledTimes(1)
  })

  test('no se renderiza la hoja con moment null', () => {
    render(
      <ToastProvider>
        <MomentSheet moment={null} onClose={vi.fn()} />
      </ToastProvider>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
