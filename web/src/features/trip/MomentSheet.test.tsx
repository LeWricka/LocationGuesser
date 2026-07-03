import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Moment } from '../../lib/trip'
import type { Vote } from '../../lib/database.types'

// Mocks de la capa de datos: la hoja solo orquesta estas funciones; aislamos la BD.
const updateChallengeDescriptionMock = vi.fn<(id: string, desc: string) => Promise<void>>()
const updateMomentMock = vi.fn<(...args: unknown[]) => Promise<unknown>>()
const promoteToChallengeMock = vi.fn<(...args: unknown[]) => Promise<unknown>>()
const deleteChallengeMock = vi.fn<(...args: unknown[]) => Promise<void>>()
const getExistingVoteMock = vi.fn<(challengeId: string, userId: string) => Promise<Vote | null>>()

vi.mock('../../lib/challenges', () => ({
  updateChallengeDescription: (id: string, desc: string) =>
    updateChallengeDescriptionMock(id, desc),
  updateMoment: (...args: unknown[]) => updateMomentMock(...args),
  promoteToChallenge: (...args: unknown[]) => promoteToChallengeMock(...args),
  deleteChallenge: (...args: unknown[]) => deleteChallengeMock(...args),
}))

// "Tu resultado" (#580) consulta MI voto en el reto cerrado: una fila, mockeada
// aparte de submitVote/getVotes (que no usa esta hoja).
vi.mock('../../lib/votes', () => ({
  getExistingVote: (challengeId: string, userId: string) =>
    getExistingVoteMock(challengeId, userId),
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
  isOwn: true,
  guessSeconds: null,
  svPanoId: null,
  country: { code: 'ES', name: 'ESPAÑA', flag: '🇪🇸' },
}

// Reto CERRADO ajeno (no lo creé yo): fixture para "Tu resultado" (#580) —
// jugado / no jugado. El caso "propio" es este mismo reto con `isOwn: true`.
const RETO_CERRADO: Moment = {
  challengeId: 'c2',
  title: 'La plaza del reloj',
  description: 'Aquí quedamos cada tarde.',
  status: 'closed',
  isChallenge: true,
  date: '2026-06-20T10:00:00.000Z',
  deadlineAt: '2026-06-21T10:00:00.000Z',
  imageUrl: 'https://example.test/foto2.jpg',
  imagePath: 'path/foto2.jpg',
  lat: 41.38,
  lng: 2.17,
  guessedCount: 3,
  isOwn: false,
  guessSeconds: 60,
  svPanoId: null,
  country: { code: 'ES', name: 'ESPAÑA', flag: '🇪🇸' },
}

function makeVote(overrides: Partial<Vote> = {}): Vote {
  return {
    id: 'v1',
    group_id: 'g1',
    challenge_id: RETO_CERRADO.challengeId,
    user_id: 'u1',
    guess_lat: 41.38,
    guess_lng: 2.17,
    distance_km: 12.3,
    guess_number: null,
    abs_error: null,
    points: 420,
    left_app: false,
    elapsed_seconds: 30,
    created_at: '2026-06-20T12:00:00.000Z',
    ...overrides,
  }
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
  updateMomentMock.mockResolvedValue({})
  getExistingVoteMock.mockResolvedValue(null)
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

  test('editar el recuerdo muestra el formulario de papel, sin el héroe (fix #571)', async () => {
    const user = userEvent.setup()
    const onEdited = vi.fn()
    renderSheet({ onEdited })

    await user.click(screen.getByRole('button', { name: 'Editar recuerdo' }))

    // El héroe de la ESCENA (título gigante duplicado, chip de país flotando)
    // desaparece: editar es una TAREA de papel, no la vista.
    expect(screen.queryByRole('heading', { name: 'Aguas turquesa' })).not.toBeInTheDocument()
    // En su lugar, cabecera utilitaria con la misma gramática que "Nuevo recuerdo".
    expect(screen.getByRole('heading', { name: 'Editar recuerdo' })).toBeInTheDocument()
    const titleInput = screen.getByLabelText(/título/i)
    expect(titleInput).toHaveValue('Aguas turquesa')

    await user.clear(titleInput)
    await user.type(titleInput, 'Aguas turquesa (editado)')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(updateMomentMock).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ title: 'Aguas turquesa (editado)' }),
    )
    expect(onEdited).toHaveBeenCalledTimes(1)
    // Guardado: vuelve a la vista (el héroe reaparece).
    expect(screen.queryByRole('heading', { name: 'Editar recuerdo' })).not.toBeInTheDocument()
  })

  test('cancelar la edición vuelve a la vista sin guardar (fix #571)', async () => {
    const user = userEvent.setup()
    renderSheet()

    await user.click(screen.getByRole('button', { name: 'Editar recuerdo' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(updateMomentMock).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Aguas turquesa' })).toBeInTheDocument()
  })

  test('no se renderiza la hoja con moment null', () => {
    render(
      <ToastProvider>
        <MomentSheet moment={null} onClose={vi.fn()} />
      </ToastProvider>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  describe('reto cerrado · "Tu resultado" (#580)', () => {
    test('jugado: muestra mis puntos y distancia, y "Ver marcador" navega', async () => {
      const user = userEvent.setup()
      getExistingVoteMock.mockResolvedValue(makeVote({ points: 420, distance_km: 12.3 }))
      const onViewMarcador = vi.fn()
      renderSheet({
        moment: RETO_CERRADO,
        canEdit: false,
        myUserId: 'u1',
        onViewMarcador,
      })

      expect(await screen.findByText('Tu resultado')).toBeInTheDocument()
      expect(getExistingVoteMock).toHaveBeenCalledWith('c2', 'u1')
      expect(await screen.findByText('420')).toBeInTheDocument()
      expect(screen.getByText('pts')).toBeInTheDocument()
      expect(screen.getByText('12.3 km')).toBeInTheDocument()
      // No se pisa con el recuento de participantes (eso es solo para el dueño).
      expect(screen.queryByText(/participar/)).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /Ver marcador/i }))
      expect(onViewMarcador).toHaveBeenCalledTimes(1)
    })

    test('no jugado: "No participaste", sin fingir un resultado', async () => {
      getExistingVoteMock.mockResolvedValue(null)
      renderSheet({ moment: RETO_CERRADO, canEdit: false, myUserId: 'u1' })

      expect(await screen.findByText('No participaste')).toBeInTheDocument()
      expect(screen.queryByText('pts')).not.toBeInTheDocument()
    })

    test('reto propio (isOwn): recuento de jugadas de siempre, sin "Tu resultado" ni consulta de voto', async () => {
      renderSheet({
        // "Propio" es `isOwn` (lo creé yo), NO `canEdit` (dueño del VIAJE): un
        // miembro cualquiera puede crear un reto sin ser el dueño del viaje (#582).
        moment: { ...RETO_CERRADO, isOwn: true },
        canEdit: false,
        myUserId: 'creador-1',
        onViewMarcador: vi.fn(),
      })

      // El recuento sigue igual que antes de #580: sin bloque de resultado fingido.
      expect(await screen.findByText(/3 personas participaron/)).toBeInTheDocument()
      expect(screen.queryByText('Tu resultado')).not.toBeInTheDocument()
      // "Ver marcador" sí se ofrece al dueño (útil para cualquiera, no solo jugadores).
      expect(screen.getByRole('button', { name: /Ver marcador/i })).toBeInTheDocument()
      expect(getExistingVoteMock).not.toHaveBeenCalled()
    })
  })
})
