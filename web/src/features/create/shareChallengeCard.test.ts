import { describe, test, expect } from 'vitest'
import { buildShareCaption } from './shareChallengeCard'

// El caption es lo ÚNICO que lleva el enlace (issue #595): la tarjeta-imagen no
// lo estampa nunca. Función pura.
describe('buildShareCaption', () => {
  test('lleva el gancho del reto + el enlace, en líneas separadas', () => {
    const text = buildShareCaption('Iker', 'https://momentu.art/j/abc123')
    expect(text).toContain('¡Adivina dónde está!')
    expect(text).toContain('Iker te reta')
    expect(text.endsWith('https://momentu.art/j/abc123')).toBe(true)
  })

  test('el enlace va SIEMPRE al final, en su propia línea', () => {
    const text = buildShareCaption('Ana', 'https://momentu.art/j/xyz')
    const lines = text.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toBe('https://momentu.art/j/xyz')
  })
})
