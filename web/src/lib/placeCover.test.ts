import { describe, test, expect, vi, beforeEach } from 'vitest'

// Mock del cliente de Supabase: solo necesitamos `functions.invoke`.
const invoke = vi.fn()
vi.mock('./supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}))

import { normalizePlaceName, resolvePlaceCover, clearPlaceCoverCache } from './placeCover'

beforeEach(() => {
  invoke.mockReset()
  clearPlaceCoverCache()
})

describe('normalizePlaceName', () => {
  test('quita el prefijo de viaje y deja el topónimo', () => {
    expect(normalizePlaceName('Finde Madrid')).toBe('Madrid')
    expect(normalizePlaceName('Viaje a París')).toBe('París')
    expect(normalizePlaceName('Escapada a Roma')).toBe('Roma')
    expect(normalizePlaceName('Fin de semana en Lisboa')).toBe('Lisboa')
  })

  test('conserva el nombre si no hay prefijo', () => {
    expect(normalizePlaceName('Madrid')).toBe('Madrid')
    expect(normalizePlaceName('Nueva York')).toBe('Nueva York')
  })

  test('limpia emojis y colapsa espacios', () => {
    expect(normalizePlaceName('  🏖️  Cádiz   ')).toBe('Cádiz')
    expect(normalizePlaceName('Viaje a 🇫🇷 París')).toBe('París')
  })

  test('si el nombre ERA solo el prefijo, devuelve el prefijo limpio (mejor algo que nada)', () => {
    expect(normalizePlaceName('Viaje')).toBe('Viaje')
    expect(normalizePlaceName('Finde')).toBe('Finde')
  })

  test('vacío o solo símbolos → cadena vacía', () => {
    expect(normalizePlaceName('')).toBe('')
    expect(normalizePlaceName('   ')).toBe('')
    expect(normalizePlaceName('✨🎉')).toBe('')
  })
})

describe('resolvePlaceCover', () => {
  test('nombre vacío no llama a la función y devuelve sin imagen', async () => {
    const cover = await resolvePlaceCover('   ')
    expect(cover.imageUrl).toBeNull()
    expect(invoke).not.toHaveBeenCalled()
  })

  test('devuelve la imagen de la función e invoca con el nombre normalizado', async () => {
    invoke.mockResolvedValue({
      data: {
        image_url: 'https://upload.wikimedia.org/madrid.jpg',
        page_url: 'https://es.wikipedia.org/wiki/Madrid',
        title: 'Madrid',
      },
      error: null,
    })
    const cover = await resolvePlaceCover('Finde Madrid')
    expect(cover.imageUrl).toBe('https://upload.wikimedia.org/madrid.jpg')
    expect(cover.title).toBe('Madrid')
    expect(invoke).toHaveBeenCalledWith('place-cover', {
      body: { name: 'Madrid', lang: 'es' },
    })
  })

  test('cachea por nombre normalizado: una sola llamada para "Finde Madrid" y "Madrid"', async () => {
    invoke.mockResolvedValue({
      data: {
        image_url: 'https://upload.wikimedia.org/madrid.jpg',
        page_url: null,
        title: 'Madrid',
      },
      error: null,
    })
    await resolvePlaceCover('Finde Madrid')
    await resolvePlaceCover('Madrid')
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  test('un error de la función no rompe: devuelve sin imagen', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('boom') })
    const cover = await resolvePlaceCover('Sitio Inexistente')
    expect(cover.imageUrl).toBeNull()
  })

  test('una excepción de red no rompe ni cachea (se podrá reintentar)', async () => {
    invoke.mockRejectedValueOnce(new Error('network'))
    const first = await resolvePlaceCover('Madrid')
    expect(first.imageUrl).toBeNull()

    // Segundo intento: como el fallo no se cacheó, vuelve a invocar y ahora acierta.
    invoke.mockResolvedValueOnce({
      data: {
        image_url: 'https://upload.wikimedia.org/madrid.jpg',
        page_url: null,
        title: 'Madrid',
      },
      error: null,
    })
    const second = await resolvePlaceCover('Madrid')
    expect(second.imageUrl).toBe('https://upload.wikimedia.org/madrid.jpg')
    expect(invoke).toHaveBeenCalledTimes(2)
  })
})
