import { describe, test, expect, vi, beforeEach } from 'vitest'

const getGroupMock = vi.fn()
vi.mock('../../lib/groupData', () => ({ getGroup: (...args: unknown[]) => getGroupMock(...args) }))

const lastChallengeImageDataUrlMock = vi.fn()
vi.mock('../../lib/lastChallengeImage', () => ({
  lastChallengeImageDataUrl: (...args: unknown[]) => lastChallengeImageDataUrlMock(...args),
}))

const resolvePlaceCoverMock = vi.fn()
vi.mock('../../lib/placeCover', () => ({
  resolvePlaceCover: (...args: unknown[]) => resolvePlaceCoverMock(...args),
}))

const storagePathToDataUrlMock = vi.fn()
const urlToDataUrlMock = vi.fn()
vi.mock('../create/challengeShareCover', () => ({
  storagePathToDataUrl: (...args: unknown[]) => storagePathToDataUrlMock(...args),
  urlToDataUrl: (...args: unknown[]) => urlToDataUrlMock(...args),
}))

import { resolveTripInviteCover } from './tripInviteCover'

describe('resolveTripInviteCover — cascada de portada de la invitación (#617)', () => {
  beforeEach(() => {
    getGroupMock.mockReset()
    lastChallengeImageDataUrlMock.mockReset()
    resolvePlaceCoverMock.mockReset()
    storagePathToDataUrlMock.mockReset()
    urlToDataUrlMock.mockReset()
  })

  test('1) portada explícita del viaje: no consulta ni el recuerdo ni el lugar', async () => {
    getGroupMock.mockResolvedValue({ cover_image_path: 'g1/portada.jpg' })
    storagePathToDataUrlMock.mockResolvedValue('data:image/jpeg;base64,portada')

    const result = await resolveTripInviteCover('g1', 'Japón en primavera')

    expect(result).toBe('data:image/jpeg;base64,portada')
    expect(storagePathToDataUrlMock).toHaveBeenCalledWith('g1/portada.jpg')
    expect(lastChallengeImageDataUrlMock).not.toHaveBeenCalled()
    expect(resolvePlaceCoverMock).not.toHaveBeenCalled()
  })

  test('2) sin portada propia: cae a la foto del ÚLTIMO recuerdo', async () => {
    getGroupMock.mockResolvedValue({ cover_image_path: null })
    lastChallengeImageDataUrlMock.mockResolvedValue('data:image/jpeg;base64,recuerdo')

    const result = await resolveTripInviteCover('g1', 'Japón en primavera')

    expect(result).toBe('data:image/jpeg;base64,recuerdo')
    expect(lastChallengeImageDataUrlMock).toHaveBeenCalledWith('g1')
    expect(resolvePlaceCoverMock).not.toHaveBeenCalled()
  })

  test('3) sin portada ni recuerdo: cae a la derivada del LUGAR', async () => {
    getGroupMock.mockResolvedValue({ cover_image_path: null })
    lastChallengeImageDataUrlMock.mockResolvedValue(null)
    resolvePlaceCoverMock.mockResolvedValue({
      imageUrl: 'https://wikimedia/japon.jpg',
      pageUrl: null,
      title: 'Japón',
    })
    urlToDataUrlMock.mockResolvedValue('data:image/jpeg;base64,japon')

    const result = await resolveTripInviteCover('g1', 'Japón en primavera')

    expect(result).toBe('data:image/jpeg;base64,japon')
    expect(resolvePlaceCoverMock).toHaveBeenCalledWith('Japón en primavera')
  })

  test('4) nada resuelve en ningún nivel: null (la tarjeta cae al mapa nocturno de marca)', async () => {
    getGroupMock.mockResolvedValue(null)
    lastChallengeImageDataUrlMock.mockResolvedValue(null)
    resolvePlaceCoverMock.mockResolvedValue({ imageUrl: null, pageUrl: null, title: null })

    const result = await resolveTripInviteCover('g1', 'Sin nombre')

    expect(result).toBeNull()
  })

  test('getGroup lanza (best-effort): no rompe, sigue al recuerdo/lugar', async () => {
    getGroupMock.mockRejectedValue(new Error('network'))
    lastChallengeImageDataUrlMock.mockResolvedValue('data:image/jpeg;base64,recuerdo')

    const result = await resolveTripInviteCover('g1', 'Japón en primavera')

    expect(result).toBe('data:image/jpeg;base64,recuerdo')
  })
})
