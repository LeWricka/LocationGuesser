import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MomentImage } from '../../lib/momentImages'
import type { Moment } from '../../lib/trip'

// Capa de datos: la pestaña solo orquesta estas dos funciones (galería extra de
// un recuerdo + firmado); aislamos la BD/Storage igual que MomentGallery.test.tsx.
const listGroupMomentImagesMock = vi.fn<(ids: string[]) => Promise<Map<string, MomentImage[]>>>()
vi.mock('../../lib/momentImages', () => ({
  listGroupMomentImages: (ids: string[]) => listGroupMomentImagesMock(ids),
}))
vi.mock('../../lib/storage', () => ({
  signedImageUrl: (path: string) => Promise.resolve(`signed://${path}`),
}))

import { BitacoraTab } from './BitacoraTab'

function moment(over: Partial<Moment> & Pick<Moment, 'challengeId' | 'title'>): Moment {
  return {
    description: null,
    status: 'recuerdo',
    isChallenge: false,
    date: '2026-06-15T10:00:00.000Z',
    deadlineAt: null,
    imageUrl: 'https://cdn.test/portada.jpg',
    imagePath: 'portada.jpg',
    lat: null,
    lng: null,
    guessedCount: 0,
    isOwn: false,
    guessSeconds: null,
    svPanoId: null,
    photoIsHint: true,
    ...over,
  }
}

function renderTab(moments: Moment[], overrides: Partial<Parameters<typeof BitacoraTab>[0]> = {}) {
  return render(
    <BitacoraTab
      groupId="g1"
      moments={moments}
      canCreate={overrides.canCreate ?? true}
      onAddMoment={overrides.onAddMoment ?? vi.fn()}
      onOpenMoment={overrides.onOpenMoment ?? vi.fn()}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  listGroupMomentImagesMock.mockResolvedValue(new Map())
})

describe('BitacoraTab — agrupación por día', () => {
  test('agrupa los momentos por día, en orden cronológico (primer día primero)', async () => {
    const moments = [
      moment({ challengeId: 'c1', title: 'Llegada a Kioto', date: '2026-06-14T09:00:00.000Z' }),
      moment({ challengeId: 'c2', title: 'Bosque de bambú', date: '2026-06-15T09:00:00.000Z' }),
    ]
    renderTab(moments)

    const headings = await screen.findAllByRole('heading', { level: 3 })
    expect(headings.map((h) => h.textContent)).toEqual(['14 jun', '15 jun'])
  })
})

describe('BitacoraTab — anti-spoiler (issue #645)', () => {
  test('un reto EN JUEGO con foto sorpresa (photoIsHint: false) NO aparece', async () => {
    const moments = [
      moment({
        challengeId: 'c-oculto',
        title: 'Reto sorpresa',
        isChallenge: true,
        status: 'active',
        photoIsHint: false,
      }),
    ]
    renderTab(moments)

    expect(await screen.findByText('Tu bitácora está vacía')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Reto sorpresa' })).not.toBeInTheDocument()
  })

  test('un reto EN JUEGO con foto PISTA (photoIsHint: true) sí aparece', async () => {
    const moments = [
      moment({
        challengeId: 'c-pista',
        title: 'Reto con pista',
        isChallenge: true,
        status: 'active',
        photoIsHint: true,
      }),
    ]
    renderTab(moments)
    expect(await screen.findByRole('heading', { name: 'Reto con pista' })).toBeInTheDocument()
  })

  test('un reto CERRADO aparece aunque su foto fuera sorpresa (ya revelado)', async () => {
    const moments = [
      moment({
        challengeId: 'c-cerrado',
        title: 'Reto ya cerrado',
        isChallenge: true,
        status: 'closed',
        photoIsHint: false,
      }),
    ]
    renderTab(moments)
    expect(await screen.findByRole('heading', { name: 'Reto ya cerrado' })).toBeInTheDocument()
  })

  test('un recuerdo nunca se oculta (no es spoiler)', async () => {
    const moments = [
      moment({
        challengeId: 'c-recuerdo',
        title: 'El mejor ramen',
        isChallenge: false,
        status: 'recuerdo',
        photoIsHint: false,
      }),
    ]
    renderTab(moments)
    expect(await screen.findByRole('heading', { name: 'El mejor ramen' })).toBeInTheDocument()
  })
})

describe('BitacoraTab — recuerdo (kicker, título, descripción, fotos)', () => {
  test('pinta kicker de lugar, título, descripción y TODAS las fotos a ancho completo', async () => {
    listGroupMomentImagesMock.mockResolvedValue(
      new Map([
        [
          'c-ramen',
          [
            {
              id: 'i1',
              challenge_id: 'c-ramen',
              image_path: 'ramen-1.jpg',
              sort_order: 0,
              created_at: '2026-06-15T10:00:00.000Z',
            },
            {
              id: 'i2',
              challenge_id: 'c-ramen',
              image_path: 'ramen-2.jpg',
              sort_order: 1,
              created_at: '2026-06-15T10:00:00.000Z',
            },
          ],
        ],
      ]),
    )
    const moments = [
      moment({
        challengeId: 'c-ramen',
        title: 'El mejor ramen',
        description: 'Una barra de ocho asientos.',
        country: { code: 'JP', name: 'JAPÓN', flag: '🇯🇵' },
      }),
    ]
    renderTab(moments)

    expect(await screen.findByRole('heading', { name: 'El mejor ramen' })).toBeInTheDocument()
    expect(screen.getByText('JAPÓN')).toBeInTheDocument()
    expect(screen.getByText('Una barra de ocho asientos.')).toBeInTheDocument()
    // Ancho completo, apiladas: DOS fotos abribles, no una rejilla con "+N".
    expect(screen.getAllByRole('button', { name: 'Ampliar foto: El mejor ramen' })).toHaveLength(2)
  })

  test('un recuerdo sin descripción no deja hueco: solo kicker + título + su foto', async () => {
    const moments = [
      moment({ challengeId: 'c-quieto', title: 'Atardecer en el puente', description: null }),
    ]
    renderTab(moments)

    await screen.findByRole('heading', { name: 'Atardecer en el puente' })
    expect(
      screen.getByRole('button', { name: 'Ampliar foto: Atardecer en el puente' }),
    ).toBeInTheDocument()
  })

  test('tocar el título abre la hoja de ESE momento (no el visor)', async () => {
    const user = userEvent.setup()
    const onOpenMoment = vi.fn()
    const target = moment({ challengeId: 'c-target', title: 'Templo dorado' })
    renderTab([target], { onOpenMoment })

    await user.click(await screen.findByRole('heading', { name: 'Templo dorado' }))

    expect(onOpenMoment).toHaveBeenCalledWith(expect.objectContaining({ challengeId: 'c-target' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('BitacoraTab — prefijo de fecha legado (issue #686)', () => {
  test('separa el prefijo "📅 <fecha>" de la descripción y lo pinta junto al kicker', async () => {
    const moments = [
      moment({
        challengeId: 'c-legado',
        title: 'Tarde en el mirador',
        description: '📅 17 de julio · Una tarde tranquila.',
      }),
    ]
    renderTab(moments)

    await screen.findByRole('heading', { name: 'Tarde en el mirador' })
    // El cuerpo se pinta LIMPIO, sin el emoji (que rompía la letra capitular).
    expect(screen.getByText('Una tarde tranquila.')).toBeInTheDocument()
    expect(screen.queryByText(/📅/)).not.toBeInTheDocument()
    // La fecha sigue visible, junto al kicker (sin lugar en este caso).
    expect(screen.getByText('17 de julio')).toBeInTheDocument()
  })

  test('sin lugar resuelto, el kicker muestra solo la fecha legada', async () => {
    const moments = [
      moment({
        challengeId: 'c-solo-fecha',
        title: 'Solo fecha',
        description: '📅 1 de septiembre',
      }),
    ]
    renderTab(moments)

    expect(await screen.findByText('1 de septiembre')).toBeInTheDocument()
  })

  test('lugar y fecha legada conviven en el mismo nodo de texto del kicker', async () => {
    const moments = [
      moment({
        challengeId: 'c-lugar-fecha',
        title: 'Con lugar y fecha',
        description: '📅 3 de marzo · Un día completo.',
        country: { code: 'CO', name: 'COLOMBIA', flag: '🇨🇴' },
      }),
    ]
    renderTab(moments)

    await screen.findByRole('heading', { name: 'Con lugar y fecha' })
    expect(screen.getByText('COLOMBIA · 3 de marzo')).toBeInTheDocument()
  })
})

describe('BitacoraTab — nota de voz inline (issue #648)', () => {
  test('con nota de voz, el reproductor aparece SIN abrir el recuerdo', async () => {
    const moments = [
      moment({
        challengeId: 'c-voz',
        title: 'La cena en el callejón',
        audioUrl: 'https://firmada.example/nota.webm',
      }),
    ]
    renderTab(moments)

    await screen.findByRole('heading', { name: 'La cena en el callejón' })
    expect(screen.getByRole('button', { name: 'Reproducir nota de voz' })).toBeInTheDocument()
  })

  test('sin nota de voz, no hay reproductor', async () => {
    const moments = [moment({ challengeId: 'c-sin-voz', title: 'Sin nota', audioUrl: null })]
    renderTab(moments)

    await screen.findByRole('heading', { name: 'Sin nota' })
    expect(screen.queryByRole('button', { name: 'Reproducir nota de voz' })).not.toBeInTheDocument()
  })
})

describe('BitacoraTab — clip de vídeo (issue #649)', () => {
  test('con clip, la primera "foto" es un <video> con controles y poster; el resto sigue siendo fotos', async () => {
    listGroupMomentImagesMock.mockResolvedValue(
      new Map([
        [
          'c-clip',
          [
            {
              id: 'i1',
              challenge_id: 'c-clip',
              image_path: 'portada.jpg',
              sort_order: 0,
              created_at: '2026-06-15T10:00:00.000Z',
            },
            {
              id: 'i2',
              challenge_id: 'c-clip',
              image_path: 'extra.jpg',
              sort_order: 1,
              created_at: '2026-06-15T10:00:00.000Z',
            },
          ],
        ],
      ]),
    )
    const moments = [
      moment({
        challengeId: 'c-clip',
        title: 'Con clip',
        videoUrl: 'https://firmada.example/clip.mp4',
      }),
    ]
    renderTab(moments)

    await screen.findByRole('heading', { name: 'Con clip' })
    const video = screen.getByTestId('moment-video-player')
    expect(video.tagName).toBe('VIDEO')
    expect(video).toHaveAttribute('src', 'https://firmada.example/clip.mp4')
    expect(video).toHaveAttribute('poster', 'signed://portada.jpg')
    // Solo la foto EXTRA (no la portada, ya de poster) es abrible en el visor.
    expect(screen.getAllByRole('button', { name: 'Ampliar foto: Con clip' })).toHaveLength(1)
  })

  test('sin clip, no hay <video>', async () => {
    const moments = [moment({ challengeId: 'c-sin-clip', title: 'Sin clip', videoUrl: null })]
    renderTab(moments)

    await screen.findByRole('heading', { name: 'Sin clip' })
    expect(screen.queryByTestId('moment-video-player')).not.toBeInTheDocument()
  })
})

describe('BitacoraTab — estado vacío', () => {
  test('dueño: mensaje + CTA "Añadir momento"', async () => {
    renderTab([])
    expect(await screen.findByText('Tu bitácora está vacía')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Añadir momento' })).toBeInTheDocument()
  })

  test('miembro (no dueño): solo el mensaje, sin CTA', async () => {
    renderTab([], { canCreate: false })
    expect(await screen.findByText('Tu bitácora está vacía')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Añadir momento' })).not.toBeInTheDocument()
  })
})

describe('BitacoraTab — tocar una foto abre el visor', () => {
  test('tap → lightbox a pantalla completa con la foto', async () => {
    const user = userEvent.setup()
    const moments = [moment({ challengeId: 'c1', title: 'El bosque de bambú' })]
    renderTab(moments)

    const photoBtn = await screen.findByRole('button', {
      name: 'Ampliar foto: El bosque de bambú',
    })
    await user.click(photoBtn)

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByRole('img', { name: 'El bosque de bambú' })).toBeInTheDocument()
  })

  test('"Ver el momento" cierra el visor y abre la hoja de ESE momento', async () => {
    const user = userEvent.setup()
    const onOpenMoment = vi.fn()
    const target = moment({ challengeId: 'c-target', title: 'Templo dorado' })
    renderTab([target], { onOpenMoment })

    await user.click(await screen.findByRole('button', { name: 'Ampliar foto: Templo dorado' }))
    await screen.findByRole('dialog')

    await user.click(screen.getByRole('button', { name: 'Ver el momento' }))

    expect(onOpenMoment).toHaveBeenCalledWith(expect.objectContaining({ challengeId: 'c-target' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
