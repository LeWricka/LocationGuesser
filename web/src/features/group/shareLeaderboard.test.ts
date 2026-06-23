import { describe, test, expect } from 'vitest'
import { buildShareText, shareDomain } from './shareLeaderboard'

// Caption del mensaje al compartir. Ahora es MÍNIMO: la tabla va en la imagen y
// el texto solo lleva nombre del grupo + enlace + gancho. Función pura.
describe('buildShareText', () => {
  const link = 'https://app/#g=ABC'

  test('una sola línea: gancho + nombre del grupo + enlace', () => {
    const text = buildShareText('Viaje a Italia', link)
    expect(text).toBe('📍 Clasificación de Viaje a Italia 👉 https://app/#g=ABC')
  })

  test('no repite la tabla ni los premios en texto', () => {
    const text = buildShareText('G', link)
    expect(text).not.toContain('🥇')
    expect(text).not.toContain('En juego')
    expect(text).not.toContain('\n')
  })
})

// El pie de la tarjeta-imagen muestra solo el dominio (la imagen no lleva enlace
// clicable). Comprobamos que extrae el host y limpia "www.".
describe('shareDomain', () => {
  test('extrae el host del enlace, con su hash', () => {
    expect(shareDomain('https://locationguesser-sage.vercel.app/#g=ABC')).toBe(
      'locationguesser-sage.vercel.app',
    )
  })

  test('quita el prefijo www.', () => {
    expect(shareDomain('https://www.ejemplo.com/ruta')).toBe('ejemplo.com')
  })

  test('no rompe con un enlace sin protocolo', () => {
    expect(shareDomain('app.local/#g=ABC')).toBe('app.local')
  })
})
