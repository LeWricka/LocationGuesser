import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ChallengePrefill } from './challengePrefill'

// Unificación (issue de convertir un momento en reto): el origen "recuerdo"
// (`fromMomentId`) ya NO abre un asistente aparte (`CreateChallengeImmersive`,
// eliminado) — abre el MISMO `CreateLocationChallenge` que un reto nuevo, solo
// que PRE-RELLENADO. Este test verifica el cableado de `CreateChallengeFlow`
// (carga del recuerdo → prefill → qué componente/props recibe), no el
// asistente en sí (cubierto en CreateLocationChallenge.test.tsx).

const getChallengeMock = vi.fn()
vi.mock('../../lib/challenges', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/challenges')>()
  return { ...actual, getChallenge: (...args: unknown[]) => getChallengeMock(...args) }
})

const signedImageUrlMock = vi.fn()
vi.mock('../../lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/storage')>()
  return { ...actual, signedImageUrl: (...args: unknown[]) => signedImageUrlMock(...args) }
})

// Doble de CreateLocationChallenge: expone los props que nos interesan
// (prefill, onBack) sin montar mapa/Street View reales.
const createLocationChallengeSpy = vi.fn()
vi.mock('./CreateLocationChallenge', () => ({
  CreateLocationChallenge: (props: { prefill?: ChallengePrefill; onBack: () => void }) => {
    createLocationChallengeSpy(props)
    return (
      <div data-testid="create-location-challenge">
        <button type="button" onClick={props.onBack}>
          atrás (doble)
        </button>
      </div>
    )
  },
}))

import { CreateChallengeFlow } from './CreateChallengeFlow'

beforeEach(() => {
  getChallengeMock.mockReset()
  signedImageUrlMock.mockReset()
  createLocationChallengeSpy.mockClear()
})

describe('CreateChallengeFlow — origen recuerdo (fromMomentId)', () => {
  test('carga el recuerdo y abre CreateLocationChallenge PRE-RELLENADO (pin, foto y título)', async () => {
    getChallengeMock.mockResolvedValue({
      id: 'm-1',
      title: 'La Sagrada Família',
      image_path: 'u-me/recuerdo.jpg',
      place_lat: 41.38,
      place_lng: 2.17,
    })
    signedImageUrlMock.mockResolvedValue('https://signed.example/recuerdo.jpg')

    render(
      <CreateChallengeFlow
        groupId="g-1"
        groupName="España 2026"
        fromMomentId="m-1"
        onBack={() => {}}
        onCreated={() => {}}
      />,
    )

    expect(await screen.findByTestId('create-location-challenge')).toBeInTheDocument()
    expect(getChallengeMock).toHaveBeenCalledWith('m-1')
    expect(createLocationChallengeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        prefill: {
          point: { lat: 41.38, lng: 2.17 },
          imagePath: 'u-me/recuerdo.jpg',
          photoUrl: 'https://signed.example/recuerdo.jpg',
          title: 'La Sagrada Família',
        },
      }),
    )
  })

  test('atrás desde el asistente (origen recuerdo) sale del flujo entero, sin selector de tipo', async () => {
    getChallengeMock.mockResolvedValue({
      id: 'm-1',
      title: 'La Sagrada Família',
      image_path: null,
      place_lat: null,
      place_lng: null,
    })
    const onBack = vi.fn()
    const user = userEvent.setup()
    render(
      <CreateChallengeFlow
        groupId="g-1"
        groupName="España 2026"
        fromMomentId="m-1"
        onBack={onBack}
        onCreated={() => {}}
      />,
    )

    await screen.findByTestId('create-location-challenge')
    await user.click(screen.getByRole('button', { name: 'atrás (doble)' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  test('si falla la carga del recuerdo, el asistente igual se abre pero SIN prefill', async () => {
    getChallengeMock.mockRejectedValue(new Error('red caída'))

    render(
      <CreateChallengeFlow
        groupId="g-1"
        groupName="España 2026"
        fromMomentId="m-1"
        onBack={() => {}}
        onCreated={() => {}}
      />,
    )

    expect(await screen.findByTestId('create-location-challenge')).toBeInTheDocument()
    expect(createLocationChallengeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ prefill: undefined }),
    )
  })
})

describe('CreateChallengeFlow — origen FAB (sin recuerdo)', () => {
  test('sin fromMomentId: primero el selector de tipo; "¿Dónde estamos?" abre el asistente SIN prefill', async () => {
    const user = userEvent.setup()
    render(
      <CreateChallengeFlow
        groupId="g-1"
        groupName="España 2026"
        onBack={() => {}}
        onCreated={() => {}}
      />,
    )

    await user.click(await screen.findByRole('button', { name: /¿Dónde estamos\?/i }))

    expect(await screen.findByTestId('create-location-challenge')).toBeInTheDocument()
    expect(getChallengeMock).not.toHaveBeenCalled()
    expect(createLocationChallengeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ prefill: undefined }),
    )
  })
})
