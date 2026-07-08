import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { MomentImage } from '../../lib/momentImages'
import type { Moment } from '../../lib/trip'

/**
 * Regresión de la issue "Bitácora parpadea" (#725): a diferencia de
 * `BitacoraTab.test.tsx` (que sustituye `signedImageUrl` entero por un mock
 * determinista y por tanto nunca habría cazado este bug), aquí dejamos correr
 * el `signedImageUrl` REAL (con su caché por `path`, ver `lib/storage.ts`) y
 * solo sustituimos el cliente Supabase de más abajo por un firmador
 * INESTABLE — token incremental en cada llamada, el comportamiento REAL de
 * `createSignedUrl` sin memoizar. Si la caché de `signedImageUrl` desapareciera,
 * este test lo detectaría: el `src` de una foto ya pintada cambiaría de
 * identidad en cuanto `BitacoraTab` volviera a firmar su galería (lo que pasa
 * cada vez que `useTripData` recibe un evento de Realtime y `moments` cambia
 * de referencia, aunque el contenido sea el mismo).
 */
const listGroupMomentImagesMock = vi.fn<(ids: string[]) => Promise<Map<string, MomentImage[]>>>()
vi.mock('../../lib/momentImages', () => ({
  listGroupMomentImages: (ids: string[]) => listGroupMomentImagesMock(ids),
}))

let signCallCount = 0
vi.mock('../../lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrl: (path: string) => {
          signCallCount += 1
          return Promise.resolve({
            data: { signedUrl: `https://firmada.example/${path}?t=${signCallCount}` },
            error: null,
          })
        },
      }),
    },
  },
}))

import { BitacoraTab } from './BitacoraTab'
import { clearSignedUrlCache } from '../../lib/storage'

function moment(over: Partial<Moment> & Pick<Moment, 'challengeId' | 'title'>): Moment {
  return {
    description: null,
    status: 'recuerdo',
    isChallenge: false,
    date: '2026-06-15T10:00:00.000Z',
    deadlineAt: null,
    imageUrl: null,
    imagePath: null,
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

beforeEach(() => {
  vi.clearAllMocks()
  signCallCount = 0
  clearSignedUrlCache()
  listGroupMomentImagesMock.mockResolvedValue(
    new Map([
      [
        'c1',
        [
          {
            id: 'i1',
            challenge_id: 'c1',
            image_path: 'gal/foto-1.jpg',
            sort_order: 0,
            created_at: '2026-06-15T10:00:00.000Z',
          },
        ],
      ],
    ]),
  )
})

describe('BitacoraTab — no parpadea al re-firmar (issue #725)', () => {
  test('una nueva referencia de `moments` (mismo contenido) no remonta el <img> ni le cambia el src', async () => {
    const momentsA: Moment[] = [moment({ challengeId: 'c1', title: 'Bosque de bambú' })]
    const { rerender } = render(
      <BitacoraTab
        groupId="g1"
        moments={momentsA}
        canCreate={false}
        onAddMoment={vi.fn()}
        onOpenMoment={vi.fn()}
      />,
    )

    const imgBefore = await screen.findByRole('img', { name: 'Bosque de bambú' })
    const srcBefore = imgBefore.getAttribute('src')
    expect(srcBefore).toBe('https://firmada.example/gal/foto-1.jpg?t=1')

    // Simula lo que hace `useTripData` en cada `refresh()` (p.ej. cualquier
    // voto de cualquier jugador vía Realtime): un `moments` NUEVO, mismo
    // contenido, referencia distinta — dispara de nuevo el efecto de carga de
    // `BitacoraTab` (deps `[groupId, moments]`), que vuelve a pedir la galería
    // y a firmar sus fotos.
    const momentsB: Moment[] = [moment({ challengeId: 'c1', title: 'Bosque de bambú' })]
    rerender(
      <BitacoraTab
        groupId="g1"
        moments={momentsB}
        canCreate={false}
        onAddMoment={vi.fn()}
        onOpenMoment={vi.fn()}
      />,
    )

    // Confirma que SÍ hubo una segunda vuelta de carga (si no, el test no
    // probaría nada): sin la caché de `signedImageUrl`, esta segunda vuelta
    // habría firmado con un token nuevo (`?t=2`).
    await waitFor(() => expect(listGroupMomentImagesMock).toHaveBeenCalledTimes(2))

    const imgAfter = await screen.findByRole('img', { name: 'Bosque de bambú' })
    // Mismo nodo DOM: la `key` estable (momentId/flatIndex) evita el
    // desmontaje/remontaje que forzaría al navegador a decodificar de cero.
    expect(imgAfter).toBe(imgBefore)
    // Mismo `src`: la caché de `signedImageUrl` por `path` evita que el mismo
    // fichero reciba una URL de identidad distinta — sin ella, el navegador
    // trataría la foto como un recurso nuevo y la recargaría (el parpadeo).
    expect(imgAfter.getAttribute('src')).toBe(srcBefore)
  })
})
