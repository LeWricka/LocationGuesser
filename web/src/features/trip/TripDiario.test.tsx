import { describe, test, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Moment } from '../../lib/trip'

// El mapa (Leaflet/MapLibre) es pesado e irrelevante para esta interacción: la
// selección/vuelo del mapa lo prueban TripMapLeaflet/TripMapGlobe por su cuenta.
vi.mock('./TripMap', () => ({ TripMap: () => <div data-testid="map" /> }))

import { TripDiario } from './TripDiario'

function moment(overrides: Partial<Moment>): Moment {
  return {
    challengeId: 'c1',
    title: 'Momento',
    description: null,
    status: 'recuerdo',
    isChallenge: false,
    date: '2026-07-01T10:00:00.000Z',
    deadlineAt: null,
    imageUrl: null,
    imagePath: null,
    lat: 40.4,
    lng: -3.7,
    guessedCount: 0,
    isOwn: false,
    guessSeconds: null,
    svPanoId: null,
    country: null,
    ...overrides,
  }
}

const MOMENTS: Moment[] = [
  moment({ challengeId: 'a', title: 'Playa' }),
  moment({ challengeId: 'b', title: 'Montaña' }),
]

// Cada tarjeta del carrusel vive en su propio `[data-cid]` (mismo elemento que usa
// el scroll-sync de TripPage); escopamos las queries ahí porque el timeline de
// arriba también lleva un botón con el título del momento como aria-label.
function renderDiario(props: Partial<Parameters<typeof TripDiario>[0]> = {}) {
  const onSelectFromMap = vi.fn()
  const onExpand = vi.fn()
  const { container } = render(
    <TripDiario
      moments={MOMENTS}
      route={[]}
      selectedId="a"
      canCreate={false}
      onSelectFromMap={onSelectFromMap}
      onExpand={onExpand}
      onPlay={vi.fn()}
      onAddMoment={vi.fn()}
      onInvite={vi.fn()}
      {...props}
    />,
  )
  const cardButton = (challengeId: string, title: string) => {
    const slide = container.querySelector<HTMLElement>(`[data-cid="${challengeId}"]`)
    if (!slide) throw new Error(`no se encontró la tarjeta ${challengeId}`)
    return within(slide).getByRole('button', { name: title })
  }
  return { onSelectFromMap, onExpand, cardButton }
}

// Issue #605, punto 2: tocar una tarjeta del carrusel que NO es la activa debe
// SELECCIONARLA (el mapa vuela a su pin) sin abrir el detalle; tocar la YA activa
// abre el detalle. Antes un solo toque hacía SIEMPRE las dos cosas a la vez.
describe('TripDiario — tap en el carrusel (#605)', () => {
  test('tocar una tarjeta NO activa selecciona (vía onSelectFromMap) y NO abre el detalle', async () => {
    const user = userEvent.setup()
    const { onSelectFromMap, onExpand, cardButton } = renderDiario({ selectedId: 'a' })

    // "Montaña" (b) no es la activa (la activa es "a" = Playa).
    await user.click(cardButton('b', 'Montaña'))

    expect(onSelectFromMap).toHaveBeenCalledWith('b')
    expect(onExpand).not.toHaveBeenCalled()
  })

  test('tocar la tarjeta YA activa abre el detalle y NO reselecciona', async () => {
    const user = userEvent.setup()
    const { onSelectFromMap, onExpand, cardButton } = renderDiario({ selectedId: 'a' })

    await user.click(cardButton('a', 'Playa'))

    expect(onExpand).toHaveBeenCalledWith(MOMENTS[0])
    expect(onSelectFromMap).not.toHaveBeenCalled()
  })
})

// Issue #839: un reto ASOCIADO a un recuerdo (misma foto, `pairedChallengeByMemoryId`
// en `lib/trip.ts`) repetía la MISMA foto en dos paradas de la timeline y dos
// tarjetas del carrusel. Ahora se funde en UNA sola tarjeta — la del recuerdo,
// con el estado de juego del reto superpuesto (`fuseMemoryWithChallenge`).
describe('TripDiario — fusión momento↔reto (issue #839)', () => {
  const memory = moment({
    challengeId: 'recuerdo-1',
    title: 'Llegada al campamento',
    isChallenge: false,
    status: 'recuerdo',
    imagePath: 'foto.jpg',
    imageUrl: 'https://cdn.test/foto.jpg',
  })
  const challenge = moment({
    challengeId: 'reto-1',
    title: 'Llegada al campamento',
    isChallenge: true,
    status: 'active',
    photoIsHint: true,
    deadlineAt: '2026-07-02T10:00:00.000Z',
    imagePath: 'foto.jpg',
  })

  function renderFused(props: Partial<Parameters<typeof TripDiario>[0]> = {}) {
    const onPlay = vi.fn()
    const onExpand = vi.fn()
    const { container } = render(
      <TripDiario
        moments={[memory, challenge]}
        route={[]}
        selectedId="recuerdo-1"
        canCreate={false}
        onSelectFromMap={vi.fn()}
        onExpand={onExpand}
        onPlay={onPlay}
        onAddMoment={vi.fn()}
        onInvite={vi.fn()}
        {...props}
      />,
    )
    return { container, onPlay, onExpand }
  }

  test('pinta UNA sola parada/tarjeta para el par (no dos)', () => {
    const { container } = renderFused()

    // Solo el id del RECUERDO vive en el carrusel; el reto asociado no pinta
    // su propia tarjeta duplicada.
    expect(container.querySelector('[data-cid="recuerdo-1"]')).toBeInTheDocument()
    expect(container.querySelector('[data-cid="reto-1"]')).not.toBeInTheDocument()
    expect(container.querySelectorAll('[data-cid]')).toHaveLength(1)
  })

  test('la tarjeta fusionada pinta el estado de juego del reto ("Adivina →")', () => {
    renderFused()
    expect(screen.getByText('EN JUEGO')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adivina →' })).toBeInTheDocument()
  })

  test('"Adivina →" lanza el id REAL del reto asociado, no el del recuerdo', async () => {
    const user = userEvent.setup()
    const { onPlay } = renderFused()

    await user.click(screen.getByRole('button', { name: 'Adivina →' }))

    expect(onPlay).toHaveBeenCalledWith('reto-1')
  })

  test('tocar la tarjeta fusionada YA activa abre el detalle del RECUERDO original', async () => {
    const user = userEvent.setup()
    const { container, onExpand } = renderFused()
    const slide = container.querySelector<HTMLElement>('[data-cid="recuerdo-1"]')
    if (!slide) throw new Error('no se encontró la tarjeta fusionada')

    await user.click(within(slide).getByRole('button', { name: 'Llegada al campamento' }))

    // El objeto que recibe `onExpand` es el recuerdo REAL, no la versión
    // fusionada de presentación (que llevaría `isChallenge: true`/status del reto).
    expect(onExpand).toHaveBeenCalledWith(memory)
  })

  test('un reto EN JUEGO con foto SORPRESA no se fusiona: sigue pintándose SUELTO (anti-spoiler existente, sin tocar)', () => {
    const surpriseChallenge = moment({
      challengeId: 'reto-sorpresa',
      title: 'Reto sorpresa',
      isChallenge: true,
      status: 'active',
      photoIsHint: false,
      imagePath: 'foto.jpg',
    })
    const { container } = render(
      <TripDiario
        moments={[memory, surpriseChallenge]}
        route={[]}
        selectedId={null}
        canCreate={false}
        onSelectFromMap={vi.fn()}
        onExpand={vi.fn()}
        onPlay={vi.fn()}
        onAddMoment={vi.fn()}
        onInvite={vi.fn()}
      />,
    )

    // `pairedChallengeByMemoryId`/`associatedChallengeIds` (lib/trip.ts) NO
    // asocian un reto sorpresa aún en juego (sería spoiler) — así que NO se
    // fusiona: sigue pintando su PROPIA tarjeta, como antes de este cambio.
    expect(container.querySelector('[data-cid="recuerdo-1"]')).toBeInTheDocument()
    expect(container.querySelector('[data-cid="reto-sorpresa"]')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-cid]')).toHaveLength(2)
  })

  test('un reto SIN recuerdo asociado sigue pintándose suelto, con su propio id en "Adivina" (no regresión)', async () => {
    const user = userEvent.setup()
    const onPlay = vi.fn()
    const soloReto = moment({
      challengeId: 'reto-suelto',
      title: 'Reto suelto',
      isChallenge: true,
      status: 'active',
      photoIsHint: true,
      imagePath: 'otra-foto.jpg',
    })
    const { container } = render(
      <TripDiario
        moments={[soloReto]}
        route={[]}
        selectedId="reto-suelto"
        canCreate={false}
        onSelectFromMap={vi.fn()}
        onExpand={vi.fn()}
        onPlay={onPlay}
        onAddMoment={vi.fn()}
        onInvite={vi.fn()}
      />,
    )

    expect(container.querySelectorAll('[data-cid]')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Adivina →' }))
    expect(onPlay).toHaveBeenCalledWith('reto-suelto')
  })
})
