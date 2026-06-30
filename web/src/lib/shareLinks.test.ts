import { describe, test, expect } from 'vitest'
import {
  tripPath,
  challengePath,
  tripShareUrl,
  challengeShareUrl,
  tripShareText,
  challengeShareText,
  whatsappShareUrl,
} from './shareLinks'

describe('rutas limpias', () => {
  test('tripPath / challengePath usan el prefijo correcto', () => {
    expect(tripPath('abc123')).toBe('/v/abc123')
    expect(challengePath('11111111-2222')).toBe('/j/11111111-2222')
  })

  test('codifican caracteres especiales del code', () => {
    expect(tripPath('a/b c')).toBe('/v/a%2Fb%20c')
  })

  test('URL absoluta a partir del origen', () => {
    expect(tripShareUrl('https://lugares.app', 'abc')).toBe('https://lugares.app/v/abc')
    expect(challengeShareUrl('https://lugares.app', 'xyz')).toBe('https://lugares.app/j/xyz')
  })

  test('no duplica la barra si el origen ya la trae', () => {
    expect(tripShareUrl('https://lugares.app/', 'abc')).toBe('https://lugares.app/v/abc')
  })
})

describe('copy cálido por tipo', () => {
  test('viaje: invita a vivir el viaje con el título', () => {
    expect(tripShareText('Iker', 'Finde en Madrid')).toBe(
      'Iker te invita a vivir su viaje «Finde en Madrid» 🌍 — mira cada parada en el mapa y adivina dónde estaba.',
    )
  })

  test('reto: reta a clavar el punto antes de la cuenta atrás', () => {
    expect(challengeShareText('Iker')).toBe(
      'Iker te reta 🎯 — ¿adivinas dónde está esta foto? Clava el punto antes de que acabe la cuenta atrás.',
    )
  })

  test('los emojis (contenido) se mantienen', () => {
    expect(tripShareText('A', 'B')).toContain('🌍')
    expect(challengeShareText('A')).toContain('🎯')
  })
})

describe('whatsappShareUrl', () => {
  test('compone wa.me con texto + url codificados', () => {
    const url = whatsappShareUrl('Hola mundo', 'https://lugares.app/v/abc')
    expect(url.startsWith('https://wa.me/?text=')).toBe(true)
    expect(decodeURIComponent(url.split('text=')[1])).toBe('Hola mundo https://lugares.app/v/abc')
  })
})
