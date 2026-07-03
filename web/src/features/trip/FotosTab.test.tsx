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

import { FotosTab } from './FotosTab'

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

function renderTab(moments: Moment[], overrides: Partial<Parameters<typeof FotosTab>[0]> = {}) {
  return render(
    <FotosTab
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

describe('FotosTab — agrupación por día', () => {
  test('agrupa las fotos por día, en orden cronológico (primer día primero)', async () => {
    const moments = [
      moment({
        challengeId: 'c1',
        title: 'Llegada a Kioto',
        date: '2026-06-14T09:00:00.000Z',
      }),
      moment({
        challengeId: 'c2',
        title: 'Bosque de bambú',
        date: '2026-06-15T09:00:00.000Z',
      }),
    ]
    renderTab(moments)

    const headings = await screen.findAllByRole('heading', { level: 3 })
    expect(headings.map((h) => h.textContent)).toEqual(['14 jun', '15 jun'])
  })
})

describe('FotosTab — anti-spoiler (issue #645)', () => {
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

    // El vacío se muestra: la única foto quedó filtrada.
    expect(await screen.findByText('Aún no hay fotos')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reto sorpresa' })).not.toBeInTheDocument()
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
    expect(await screen.findByRole('button', { name: 'Reto con pista' })).toBeInTheDocument()
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
    expect(await screen.findByRole('button', { name: 'Reto ya cerrado' })).toBeInTheDocument()
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
    expect(await screen.findByRole('button', { name: 'El mejor ramen' })).toBeInTheDocument()
  })
})

describe('FotosTab — galería multi-foto de un recuerdo', () => {
  test('usa TODAS las fotos de moment_images, no solo la portada', async () => {
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
            {
              id: 'i3',
              challenge_id: 'c-ramen',
              image_path: 'ramen-3.jpg',
              sort_order: 2,
              created_at: '2026-06-15T10:00:00.000Z',
            },
          ],
        ],
      ]),
    )
    const moments = [moment({ challengeId: 'c-ramen', title: 'El mejor ramen' })]
    renderTab(moments)

    const cells = await screen.findAllByRole('button', { name: 'El mejor ramen' })
    expect(cells).toHaveLength(3)
  })
})

describe('FotosTab — badge ▶ del clip de vídeo (issue #649)', () => {
  test('la portada de un recuerdo con videoUrl pinta el badge ▶', async () => {
    const moments = [
      moment({
        challengeId: 'c-clip',
        title: 'Con clip',
        videoUrl: 'https://firmada.example/clip.mp4',
      }),
    ]
    renderTab(moments)

    const cell = await screen.findByRole('button', { name: 'Con clip' })
    expect(within(cell.parentElement as HTMLElement).getByTestId('video-badge')).toBeInTheDocument()
  })

  test('un recuerdo sin videoUrl no pinta el badge', async () => {
    const moments = [moment({ challengeId: 'c-sin-clip', title: 'Sin clip', videoUrl: null })]
    renderTab(moments)

    await screen.findByRole('button', { name: 'Sin clip' })
    expect(screen.queryByTestId('video-badge')).not.toBeInTheDocument()
  })

  test('en una galería multi-foto, SOLO la portada (primera) lleva el badge', async () => {
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
        videoUrl: 'https://firmada.example/clip.mp4',
      }),
    ]
    renderTab(moments)

    const cells = await screen.findAllByRole('button', { name: 'El mejor ramen' })
    expect(cells).toHaveLength(2)
    expect(screen.getAllByTestId('video-badge')).toHaveLength(1)
  })
})

describe('FotosTab — estado vacío', () => {
  test('dueño: mensaje + CTA "Añadir momento"', async () => {
    renderTab([])
    expect(await screen.findByText('Aún no hay fotos')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Añadir momento' })).toBeInTheDocument()
  })

  test('miembro (no dueño): solo el mensaje, sin CTA', async () => {
    renderTab([], { canCreate: false })
    expect(await screen.findByText('Aún no hay fotos')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Añadir momento' })).not.toBeInTheDocument()
  })
})

describe('FotosTab — tocar una foto abre el visor', () => {
  test('tap → lightbox a pantalla completa con la foto', async () => {
    const user = userEvent.setup()
    const moments = [moment({ challengeId: 'c1', title: 'El bosque de bambú' })]
    renderTab(moments)

    const cell = await screen.findByRole('button', { name: 'El bosque de bambú' })
    await user.click(cell)

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByRole('img', { name: 'El bosque de bambú' })).toBeInTheDocument()
  })

  test('"Ver el momento" cierra el visor y abre la hoja de ESE momento', async () => {
    const user = userEvent.setup()
    const onOpenMoment = vi.fn()
    const target = moment({ challengeId: 'c-target', title: 'Templo dorado' })
    renderTab([target], { onOpenMoment })

    await user.click(await screen.findByRole('button', { name: 'Templo dorado' }))
    await screen.findByRole('dialog')

    await user.click(screen.getByRole('button', { name: 'Ver el momento' }))

    expect(onOpenMoment).toHaveBeenCalledWith(expect.objectContaining({ challengeId: 'c-target' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
