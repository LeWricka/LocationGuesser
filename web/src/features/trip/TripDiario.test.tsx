import { describe, test, expect, vi } from 'vitest'
import { render, within } from '@testing-library/react'
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
      groupId="g1"
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
