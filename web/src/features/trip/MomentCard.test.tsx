import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MomentCard } from './MomentCard'
import type { Moment } from '../../lib/trip'

// Fábrica de un reto EN JUEGO: solo lo que la tarjeta mira. `isOwn` se fuerza en
// cada test (issue #578: el CTA "Adivina →" depende de quién creó el reto).
function activeChallenge(overrides: Partial<Moment>): Moment {
  return {
    challengeId: 'c1',
    title: 'Reto activo',
    description: null,
    status: 'active',
    isChallenge: true,
    date: '2026-07-01T10:00:00.000Z',
    deadlineAt: '2026-07-02T10:00:00.000Z',
    imageUrl: null,
    imagePath: null,
    lat: null,
    lng: null,
    guessedCount: 0,
    isOwn: false,
    guessSeconds: null,
    svPanoId: null,
    country: null,
    ...overrides,
  }
}

describe('MomentCard — reto EN JUEGO (issue #578)', () => {
  test('reto AJENO: pinta "Adivina →" y dispara onPlay al tocarlo', async () => {
    const user = userEvent.setup()
    const onPlay = vi.fn()
    render(
      <MomentCard moment={activeChallenge({ isOwn: false })} onExpand={() => {}} onPlay={onPlay} />,
    )

    expect(screen.getByText('EN JUEGO')).toBeInTheDocument()
    const cta = screen.getByRole('button', { name: 'Adivina →' })
    await user.click(cta)
    expect(onPlay).toHaveBeenCalledTimes(1)
  })

  test('reto PROPIO: NO ofrece "Adivina →" — muestra el recuento de jugadas', () => {
    render(
      <MomentCard
        moment={activeChallenge({ isOwn: true, guessedCount: 3 })}
        onExpand={() => {}}
        onPlay={vi.fn()}
      />,
    )

    // El badge "en juego" se mantiene: el reto sigue en curso.
    expect(screen.getByText('EN JUEGO')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Adivina →' })).not.toBeInTheDocument()
    expect(screen.getByText('3 han jugado')).toBeInTheDocument()
  })

  test('reto PROPIO sin jugadas todavía: "Esperando jugadas"', () => {
    render(
      <MomentCard
        moment={activeChallenge({ isOwn: true, guessedCount: 0 })}
        onExpand={() => {}}
        onPlay={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Adivina →' })).not.toBeInTheDocument()
    expect(screen.getByText('Esperando jugadas')).toBeInTheDocument()
  })

  test('reto PROPIO sin prop onPlay (como lo cablea TripDiario): tampoco pinta el CTA', () => {
    // TripDiario ya no pasa onPlay para un momento propio en juego; nos aseguramos
    // de que MomentCard decide por `moment.isOwn`, no solo por la ausencia de onPlay.
    render(
      <MomentCard moment={activeChallenge({ isOwn: true, guessedCount: 1 })} onExpand={() => {}} />,
    )

    expect(screen.queryByRole('button', { name: 'Adivina →' })).not.toBeInTheDocument()
    expect(screen.getByText('1 han jugado')).toBeInTheDocument()
  })
})

describe('MomentCard — foto sorpresa (issue #655, spoiler del carrusel)', () => {
  const SORPRESA_LABEL = 'Foto sorpresa: se revela al cerrar el reto'
  const FOTO = 'https://example.test/foto.jpg'

  test('reto EN JUEGO con foto sorpresa (photoIsHint: false), NO propio: sin <img>, con candado', () => {
    const { container } = render(
      <MomentCard
        moment={activeChallenge({ imageUrl: FOTO, photoIsHint: false, isOwn: false })}
        onExpand={() => {}}
      />,
    )

    expect(container.querySelector('img')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: SORPRESA_LABEL })).toBeInTheDocument()
  })

  test('reto EN JUEGO con foto sorpresa, PROPIO (isOwn): sí pinta su foto, con el sello', () => {
    const { container } = render(
      <MomentCard
        moment={activeChallenge({ imageUrl: FOTO, photoIsHint: false, isOwn: true })}
        onExpand={() => {}}
      />,
    )

    expect(container.querySelector('img')).toHaveAttribute('src', FOTO)
    expect(screen.getByRole('img', { name: SORPRESA_LABEL })).toBeInTheDocument()
  })

  test('reto EN JUEGO con foto PISTA (photoIsHint: true): visible, sin candado', () => {
    const { container } = render(
      <MomentCard
        moment={activeChallenge({ imageUrl: FOTO, photoIsHint: true, isOwn: false })}
        onExpand={() => {}}
      />,
    )

    expect(container.querySelector('img')).toHaveAttribute('src', FOTO)
    expect(screen.queryByRole('img', { name: SORPRESA_LABEL })).not.toBeInTheDocument()
  })

  test('reto CERRADO con foto que era sorpresa: ya visible, sin candado', () => {
    const { container } = render(
      <MomentCard
        moment={activeChallenge({
          status: 'closed',
          imageUrl: FOTO,
          photoIsHint: false,
          isOwn: false,
        })}
        onExpand={() => {}}
      />,
    )

    expect(container.querySelector('img')).toHaveAttribute('src', FOTO)
    expect(screen.queryByRole('img', { name: SORPRESA_LABEL })).not.toBeInTheDocument()
  })
})

describe('MomentCard — asociado a un recuerdo (issue #822)', () => {
  const ASSOCIATED_LABEL = 'Reto creado a partir de un recuerdo con la misma foto'
  const FOTO = 'https://example.test/foto.jpg'

  test('reto CERRADO asociado: pinta el disco Link2', () => {
    render(
      <MomentCard
        moment={activeChallenge({ status: 'closed', imageUrl: FOTO })}
        associatedWithMemory
        onExpand={() => {}}
      />,
    )

    expect(screen.getByRole('img', { name: ASSOCIATED_LABEL })).toBeInTheDocument()
  })

  test('reto CERRADO sin asociación: no pinta el disco', () => {
    render(
      <MomentCard
        moment={activeChallenge({ status: 'closed', imageUrl: FOTO })}
        associatedWithMemory={false}
        onExpand={() => {}}
      />,
    )

    expect(screen.queryByRole('img', { name: ASSOCIATED_LABEL })).not.toBeInTheDocument()
  })

  test('un RECUERDO nunca pinta el disco, aunque llegue associatedWithMemory=true', () => {
    render(
      <MomentCard
        moment={activeChallenge({ status: 'recuerdo', isChallenge: false, imageUrl: FOTO })}
        associatedWithMemory
        onExpand={() => {}}
      />,
    )

    expect(screen.queryByRole('img', { name: ASSOCIATED_LABEL })).not.toBeInTheDocument()
  })

  test('reto EN JUEGO con foto SORPRESA asociado: NO revela el vínculo (sería spoiler)', () => {
    render(
      <MomentCard
        moment={activeChallenge({
          status: 'active',
          photoIsHint: false,
          isOwn: false,
          imageUrl: FOTO,
        })}
        associatedWithMemory
        onExpand={() => {}}
      />,
    )

    expect(screen.queryByRole('img', { name: ASSOCIATED_LABEL })).not.toBeInTheDocument()
    // El sello "Sorpresa" manda esa esquina mientras la foto siga oculta.
    expect(
      screen.getByRole('img', { name: 'Foto sorpresa: se revela al cerrar el reto' }),
    ).toBeInTheDocument()
  })

  test('reto EN JUEGO con foto PISTA asociado: SÍ revela el vínculo (ya es visible)', () => {
    render(
      <MomentCard
        moment={activeChallenge({ status: 'active', photoIsHint: true, imageUrl: FOTO })}
        associatedWithMemory
        onExpand={() => {}}
      />,
    )

    expect(screen.getByRole('img', { name: ASSOCIATED_LABEL })).toBeInTheDocument()
  })
})

describe('MomentCard — badge de clip de vídeo (issue #649)', () => {
  test('con videoUrl, pinta el badge ▶ sobre la portada', () => {
    render(
      <MomentCard
        moment={activeChallenge({
          status: 'recuerdo',
          isChallenge: false,
          videoUrl: 'https://firmada.example/clip.mp4',
        })}
        onExpand={() => {}}
      />,
    )

    expect(screen.getByTestId('video-badge')).toBeInTheDocument()
  })

  test('sin videoUrl (recuerdo sin clip o reto), no pinta el badge', () => {
    render(
      <MomentCard
        moment={activeChallenge({ status: 'recuerdo', isChallenge: false, videoUrl: null })}
        onExpand={() => {}}
      />,
    )

    expect(screen.queryByTestId('video-badge')).not.toBeInTheDocument()
  })
})
