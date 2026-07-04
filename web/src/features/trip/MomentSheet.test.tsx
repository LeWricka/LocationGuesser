import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
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

// Mismo recuerdo, con una nota de voz ya guardada (issue #648).
const RECUERDO_CON_AUDIO: Moment = {
  ...RECUERDO,
  audioUrl: 'https://example.test/nota.webm',
  audioPath: 'audio/nota.webm',
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

// Reto EN JUEGO con foto SORPRESA (`photoIsHint: false`, issue #655): fixture
// para las pruebas anti-spoiler del héroe de la hoja.
const RETO_ACTIVO_SORPRESA: Moment = {
  challengeId: 'c3',
  title: '¿Dónde estamos?',
  description: null,
  status: 'active',
  isChallenge: true,
  date: '2026-07-01T10:00:00.000Z',
  deadlineAt: '2026-07-02T10:00:00.000Z',
  imageUrl: 'https://example.test/foto-sorpresa.jpg',
  imagePath: 'path/foto-sorpresa.jpg',
  lat: null,
  lng: null,
  guessedCount: 0,
  isOwn: false,
  guessSeconds: null,
  svPanoId: null,
  country: null,
  photoIsHint: false,
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
    play_started_at: null,
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

  // Issue #566 / migración 0037: la fecha editada se guarda en `happenedOn`
  // (columna real), no repurposeando `created_at` (el hack de antes).
  test('editar la fecha del recuerdo guarda happenedOn (YYYY-MM-DD), no createdAt', async () => {
    const user = userEvent.setup()
    const onEdited = vi.fn()
    renderSheet({ onEdited })

    await user.click(screen.getByRole('button', { name: 'Editar recuerdo' }))

    // El campo "Fecha" arranca sembrado con la fecha actual del momento
    // (2026-06-28, derivada de `moment.date`); elegimos otro día del mismo mes.
    const trigger = screen.getByLabelText('Fecha')
    await user.click(trigger)
    await user.click(screen.getByRole('gridcell', { name: '20 de junio de 2026' }))

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(updateMomentMock).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ happenedOn: '2026-06-20' }),
    )
    expect(updateMomentMock).not.toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ createdAt: expect.anything() }),
    )
    expect(onEdited).toHaveBeenCalledTimes(1)
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

  // --- Regresión #605: la hoja se quedaba atascada en `closing` ------------------
  //
  // Causa raíz REAL (no era red ni un `animationend` que no llegara): `closing`
  // solo se ponía a `true`, nunca volvía a `false` por sí solo, y este
  // componente no se desmonta entre aperturas (el padre siempre renderiza
  // `<MomentSheet moment={openMoment} .../>`, alternando `moment` entre un
  // valor y `null`). Así, tras el PRIMER cierre, el SIGUIENTE momento abierto
  // heredaba `closing=true` desde su primer render: nacía ya en la posición
  // final de salida (sin transición que disparar `onTransitionEnd`) y
  // `close()` cortaba en seco cualquier reintento (`if (closing) return`) sin
  // programar un temporizador nuevo — el overlay quedaba bloqueando la app
  // para siempre. jsdom tampoco emite `transitionend`, así que estos tests
  // ejercitan también el camino de seguridad (el timeout) sin depender de él.
  describe('cierre de la hoja (#605)', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    test('sin transitionend (jsdom no lo emite): el timeout de seguridad fuerza onClose', () => {
      const onClose = vi.fn()
      renderSheet({ onClose })

      // El overlay (fondo) es el padre del panel con role="dialog"; clicarlo
      // dispara `close()` sin pasar por el asa de arrastre.
      const overlay = screen.getByRole('dialog').parentElement as HTMLElement
      fireEvent.click(overlay)
      expect(onClose).not.toHaveBeenCalled()

      act(() => {
        vi.advanceTimersByTime(400)
      })
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    test('reabrir OTRO momento tras cerrar no deja el overlay bloqueado', () => {
      const onClose = vi.fn()
      const { rerender } = render(
        <ToastProvider>
          <MomentSheet moment={RECUERDO} onClose={onClose} />
        </ToastProvider>,
      )

      // Cierra el primer momento (se resuelve por el timeout de seguridad).
      fireEvent.click(screen.getByRole('dialog').parentElement as HTMLElement)
      act(() => {
        vi.advanceTimersByTime(400)
      })
      expect(onClose).toHaveBeenCalledTimes(1)

      // El padre reacciona a `onClose` poniendo `moment=null`...
      rerender(
        <ToastProvider>
          <MomentSheet moment={null} onClose={onClose} />
        </ToastProvider>,
      )
      // ...y más tarde abre OTRO momento distinto.
      rerender(
        <ToastProvider>
          <MomentSheet moment={RETO_CERRADO} onClose={onClose} />
        </ToastProvider>,
      )

      // El overlay del momento NUEVO debe responder al primer toque: si
      // `closing` hubiera quedado pegado a `true` desde el cierre anterior,
      // este clic no haría nada (guard de `close()`) y el overlay se quedaría
      // bloqueando la app para siempre — el bug real reportado en #605.
      fireEvent.click(screen.getByRole('dialog').parentElement as HTMLElement)
      act(() => {
        vi.advanceTimersByTime(400)
      })
      expect(onClose).toHaveBeenCalledTimes(2)
    })
  })

  // --- Swipe-down para cerrar desde toda la hoja (#646) -----------------------
  //
  // El héroe (foto) está DENTRO del único scrollable (`.content`), así que la
  // guarda de scroll (regla 1) se comprueba sobre `contentRef` sin importar si el
  // dedo empieza en la foto o en el cuerpo: ambos burbujean al mismo handler del
  // panel. jsdom no dispone `setPointerCapture` de verdad ni layout real (el alto
  // del panel es 0), así que el umbral de distancia cae a `window.innerHeight *
  // 0.25` (ver `closeThresholdPx`) — con `clientY` moviéndose cientos de píxeles
  // en los tests replicamos un arrastre claramente por encima o por debajo de ese
  // umbral sin depender de layout.
  describe('swipe-down para cerrar desde toda la hoja (#646)', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    test('arrastre desde el héroe por encima del umbral cierra la hoja', () => {
      const onClose = vi.fn()
      renderSheet({ onClose })

      // El héroe (la foto) es el primer contenido del scrollable: arrastrar
      // desde ahí debe cerrar igual que arrastrar desde el asa.
      const hero = screen.getByAltText('Aguas turquesa')
      fireEvent.pointerDown(hero, { clientY: 0 })
      fireEvent.pointerMove(hero, { clientY: 400 }) // supera el umbral de intención y el de distancia
      fireEvent.pointerUp(hero)

      expect(onClose).not.toHaveBeenCalled() // la salida anima antes de desmontar
      act(() => {
        vi.advanceTimersByTime(400)
      })
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    test('con scroll interno (scrollTop>0) el arrastre no cierra: manda el scroll nativo', () => {
      const onClose = vi.fn()
      renderSheet({ onClose })

      // Simula el cuerpo YA scrolleado (el héroe ha quedado por encima, fuera de
      // vista): la guarda de la regla 1 debe rechazar el gesto de cierre.
      const content = screen.getByTestId('moment-sheet-content')
      content.scrollTop = 50

      const hero = screen.getByAltText('Aguas turquesa')
      fireEvent.pointerDown(hero, { clientY: 0 })
      fireEvent.pointerMove(hero, { clientY: 400 })
      fireEvent.pointerUp(hero)

      act(() => {
        vi.advanceTimersByTime(400)
      })
      expect(onClose).not.toHaveBeenCalled()
    })

    test('soltar por debajo del umbral no cierra: la hoja vuelve a su sitio', () => {
      const onClose = vi.fn()
      renderSheet({ onClose })

      const hero = screen.getByAltText('Aguas turquesa')
      fireEvent.pointerDown(hero, { clientY: 0 })
      // Pasa el umbral de INTENCIÓN (8px) pero se queda muy por debajo del de
      // distancia/velocidad: al soltar, no cierra.
      fireEvent.pointerMove(hero, { clientY: 40 })
      fireEvent.pointerUp(hero)

      act(() => {
        vi.advanceTimersByTime(400)
      })
      expect(onClose).not.toHaveBeenCalled()
    })

    test('en modo edición (papel, #571) el gesto no aplica', () => {
      const onClose = vi.fn()
      renderSheet({ onClose, initialEditing: true })

      // Sin héroe en edición: el gesto arranca sobre el propio diálogo.
      const dialog = screen.getByRole('dialog')
      fireEvent.pointerDown(dialog, { clientY: 0 })
      fireEvent.pointerMove(dialog, { clientY: 400 })
      fireEvent.pointerUp(dialog)

      act(() => {
        vi.advanceTimersByTime(400)
      })
      expect(onClose).not.toHaveBeenCalled()
      // El formulario de papel sigue montado: nada se cerró de refilón.
      expect(screen.getByRole('heading', { name: 'Editar recuerdo' })).toBeInTheDocument()
    })

    test('reduced motion: el cierre por arrastre es instantáneo, sin animación de seguimiento', () => {
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }))
      const onClose = vi.fn()
      renderSheet({ onClose })

      const hero = screen.getByAltText('Aguas turquesa')
      fireEvent.pointerDown(hero, { clientY: 0 })
      fireEvent.pointerMove(hero, { clientY: 400 })
      fireEvent.pointerUp(hero)

      // Reduced motion reutiliza el cierre determinista (#613) sin animar: no
      // hace falta esperar al timeout de seguridad, `onClose` ya se disparó.
      expect(onClose).toHaveBeenCalledTimes(1)
      vi.unstubAllGlobals()
    })
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

  // --- Nota de voz en la VISTA (issue #648) -----------------------------------
  describe('nota de voz (#648)', () => {
    test('con audio_path muestra el reproductor bajo la descripción', () => {
      renderSheet({ moment: RECUERDO_CON_AUDIO })
      expect(screen.getByLabelText(/reproducir nota de voz/i)).toBeInTheDocument()
    })

    test('sin audio_path no muestra ningún reproductor', () => {
      renderSheet({ moment: RECUERDO })
      expect(screen.queryByLabelText(/reproducir nota de voz/i)).not.toBeInTheDocument()
    })

    test('editar el recuerdo y descartar la nota existente guarda audio_path a null', async () => {
      const user = userEvent.setup()
      const onEdited = vi.fn()
      renderSheet({ moment: RECUERDO_CON_AUDIO, onEdited })

      await user.click(screen.getByRole('button', { name: 'Editar recuerdo' }))
      // La nota YA guardada se ve como preview reproducible, con "Descartar".
      expect(screen.getByLabelText(/reproducir nota de voz/i)).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /descartar/i }))

      await user.click(screen.getByRole('button', { name: 'Guardar' }))

      expect(updateMomentMock).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({ audioPath: null }),
      )
      expect(onEdited).toHaveBeenCalledTimes(1)
    })
  })

  describe('clip de vídeo corto (#649)', () => {
    const RECUERDO_CON_VIDEO: Moment = {
      ...RECUERDO,
      videoUrl: 'https://example.test/clip.mp4',
    }

    test('con videoUrl, pinta el player nativo bajo el héroe con la portada como poster', () => {
      renderSheet({ moment: RECUERDO_CON_VIDEO })
      const player = screen.getByTestId('moment-video-player')
      expect(player).toHaveAttribute('src', 'https://example.test/clip.mp4')
      expect(player).toHaveAttribute('poster', RECUERDO_CON_VIDEO.imageUrl as string)
      expect(player).toHaveAttribute('controls')
    })

    test('sin videoUrl (recuerdo normal o reto), no pinta ningún player', () => {
      renderSheet({ moment: RECUERDO })
      expect(screen.queryByTestId('moment-video-player')).not.toBeInTheDocument()
    })

    test('editar el recuerdo y quitar el clip guarda video_path a null', async () => {
      const user = userEvent.setup()
      const onEdited = vi.fn()
      renderSheet({ moment: RECUERDO_CON_VIDEO, onEdited })

      await user.click(screen.getByRole('button', { name: 'Editar recuerdo' }))
      expect(screen.getByRole('button', { name: 'Quitar clip' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Quitar clip' }))
      // Tras quitarlo, el bloque del clip desaparece del formulario.
      expect(screen.queryByRole('button', { name: 'Quitar clip' })).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Guardar' }))

      expect(updateMomentMock).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({ videoPath: null }),
      )
      expect(onEdited).toHaveBeenCalledTimes(1)
    })

    test('editar SIN tocar el clip no envía videoPath (undefined = no tocarlo)', async () => {
      const user = userEvent.setup()
      renderSheet({ moment: RECUERDO_CON_VIDEO })

      await user.click(screen.getByRole('button', { name: 'Editar recuerdo' }))
      await user.click(screen.getByRole('button', { name: 'Guardar' }))

      expect(updateMomentMock).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({ videoPath: undefined }),
      )
    })
  })
})

// --- Foto sorpresa en el héroe de la hoja (issue #655) -------------------------
describe('MomentSheet — foto sorpresa (issue #655)', () => {
  const SORPRESA_LABEL = 'Foto sorpresa: se revela al cerrar el reto'

  test('reto EN JUEGO con foto sorpresa, NO propio: sin <img>, con candado', () => {
    const { container } = renderSheet({ moment: RETO_ACTIVO_SORPRESA })
    expect(container.querySelector('img')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: SORPRESA_LABEL })).toBeInTheDocument()
  })

  test('reto EN JUEGO con foto sorpresa, PROPIO (isOwn): pinta la foto con el sello', () => {
    const { container } = renderSheet({
      moment: { ...RETO_ACTIVO_SORPRESA, isOwn: true },
    })
    expect(container.querySelector('img')).toHaveAttribute('src', RETO_ACTIVO_SORPRESA.imageUrl)
    expect(screen.getByRole('img', { name: SORPRESA_LABEL })).toBeInTheDocument()
  })

  test('foto PISTA (photoIsHint: true) en juego: visible, sin candado', () => {
    const { container } = renderSheet({
      moment: { ...RETO_ACTIVO_SORPRESA, photoIsHint: true },
    })
    expect(container.querySelector('img')).toHaveAttribute('src', RETO_ACTIVO_SORPRESA.imageUrl)
    expect(screen.queryByRole('img', { name: SORPRESA_LABEL })).not.toBeInTheDocument()
  })

  test('reto CERRADO con foto que era sorpresa: ya visible, sin candado', () => {
    const { container } = renderSheet({ moment: RETO_CERRADO })
    expect(container.querySelector('img')).toHaveAttribute('src', RETO_CERRADO.imageUrl)
    expect(screen.queryByRole('img', { name: SORPRESA_LABEL })).not.toBeInTheDocument()
  })
})
