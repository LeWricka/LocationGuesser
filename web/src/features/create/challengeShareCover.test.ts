import { describe, test, expect, vi, beforeEach } from 'vitest'

const getGroupMock = vi.fn()
vi.mock('../../lib/groupData', () => ({ getGroup: (...args: unknown[]) => getGroupMock(...args) }))

const signedImageUrlMock = vi.fn()
vi.mock('../../lib/storage', () => ({
  signedImageUrl: (...args: unknown[]) => signedImageUrlMock(...args),
}))

const resolvePlaceCoverMock = vi.fn()
vi.mock('../../lib/placeCover', () => ({
  resolvePlaceCover: (...args: unknown[]) => resolvePlaceCoverMock(...args),
}))

import { resolveChallengeShareCover } from './challengeShareCover'

// Respuesta de `fetch` con un blob descargable (jsdom soporta Blob/FileReader).
function okImageResponse(): Response {
  return { ok: true, blob: async () => new Blob(['img-bytes'], { type: 'image/jpeg' }) } as Response
}

describe('resolveChallengeShareCover — cascada de portada de la tarjeta (#595)', () => {
  beforeEach(() => {
    getGroupMock.mockReset()
    signedImageUrlMock.mockReset()
    resolvePlaceCoverMock.mockReset()
    vi.stubGlobal('fetch', vi.fn())
  })

  test('1) foto del propio reto: no consulta el grupo ni el lugar', async () => {
    signedImageUrlMock.mockResolvedValue('https://storage/foto-reto.jpg')
    vi.mocked(fetch).mockResolvedValue(okImageResponse())

    const result = await resolveChallengeShareCover('u1/foto.jpg', 'g1', 'Lisboa')

    expect(result).toMatch(/^data:/)
    expect(signedImageUrlMock).toHaveBeenCalledWith('u1/foto.jpg')
    expect(getGroupMock).not.toHaveBeenCalled()
    expect(resolvePlaceCoverMock).not.toHaveBeenCalled()
  })

  test('2) sin foto del reto: cae a la portada PROPIA del viaje', async () => {
    getGroupMock.mockResolvedValue({ cover_image_path: 'g1/portada.jpg' })
    signedImageUrlMock.mockResolvedValue('https://storage/portada.jpg')
    vi.mocked(fetch).mockResolvedValue(okImageResponse())

    const result = await resolveChallengeShareCover(null, 'g1', 'Lisboa')

    expect(result).toMatch(/^data:/)
    expect(signedImageUrlMock).toHaveBeenCalledWith('g1/portada.jpg')
    expect(resolvePlaceCoverMock).not.toHaveBeenCalled()
  })

  test('3) sin foto propia ni portada del viaje: cae a la derivada del LUGAR', async () => {
    getGroupMock.mockResolvedValue({ cover_image_path: null })
    resolvePlaceCoverMock.mockResolvedValue({
      imageUrl: 'https://wikimedia/lisboa.jpg',
      pageUrl: null,
      title: 'Lisboa',
    })
    vi.mocked(fetch).mockResolvedValue(okImageResponse())

    const result = await resolveChallengeShareCover(null, 'g1', 'Lisboa')

    expect(result).toMatch(/^data:/)
    expect(resolvePlaceCoverMock).toHaveBeenCalledWith('Lisboa')
  })

  test('4) nada resuelve en ningún nivel: null (la tarjeta cae al mapa nocturno de marca)', async () => {
    getGroupMock.mockResolvedValue(null)
    resolvePlaceCoverMock.mockResolvedValue({ imageUrl: null, pageUrl: null, title: null })

    const result = await resolveChallengeShareCover(null, 'g1', 'Sin nombre')

    expect(result).toBeNull()
  })

  test('la foto del reto falla al descargar: sigue a la portada del viaje (best-effort)', async () => {
    signedImageUrlMock.mockResolvedValueOnce('https://storage/foto-reto.jpg')
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response)
    getGroupMock.mockResolvedValue({ cover_image_path: 'g1/portada.jpg' })
    signedImageUrlMock.mockResolvedValueOnce('https://storage/portada.jpg')
    vi.mocked(fetch).mockResolvedValueOnce(okImageResponse())

    const result = await resolveChallengeShareCover('u1/foto.jpg', 'g1', 'Lisboa')

    expect(result).toMatch(/^data:/)
  })

  test('getGroup lanza (best-effort): no rompe, sigue a la portada del lugar', async () => {
    getGroupMock.mockRejectedValue(new Error('network'))
    resolvePlaceCoverMock.mockResolvedValue({
      imageUrl: 'https://wikimedia/lisboa.jpg',
      pageUrl: null,
      title: 'Lisboa',
    })
    vi.mocked(fetch).mockResolvedValue(okImageResponse())

    const result = await resolveChallengeShareCover(null, 'g1', 'Lisboa')

    expect(result).toMatch(/^data:/)
  })
})
