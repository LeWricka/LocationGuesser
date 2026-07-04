import { describe, test, expect } from 'vitest'
import {
  buildInviteCaption,
  challengesLabel,
  travelersLabel,
  tripInviteMetaLine,
} from './tripInviteText'

describe('challengesLabel', () => {
  test('sin retos: "aún sin retos"', () => {
    expect(challengesLabel(0)).toBe('aún sin retos')
  })
  test('singular', () => {
    expect(challengesLabel(1)).toBe('1 reto')
  })
  test('plural', () => {
    expect(challengesLabel(4)).toBe('4 retos')
  })
})

describe('travelersLabel', () => {
  test('singular', () => {
    expect(travelersLabel(1)).toBe('1 viajero')
  })
  test('plural', () => {
    expect(travelersLabel(5)).toBe('5 viajeros')
  })
})

describe('tripInviteMetaLine', () => {
  test('con miembros: "N viajeros · N retos"', () => {
    expect(tripInviteMetaLine(5, 3)).toBe('5 viajeros · 3 retos')
  })
  test('miembros aún no resueltos (null): solo la línea de retos', () => {
    expect(tripInviteMetaLine(null, 3)).toBe('3 retos')
  })
  test('sin retos todavía', () => {
    expect(tripInviteMetaLine(2, 0)).toBe('2 viajeros · aún sin retos')
  })
})

// El caption es lo ÚNICO que lleva el enlace (issue #617): la tarjeta-imagen no
// lo estampa nunca. Función pura.
describe('buildInviteCaption', () => {
  test('lleva el gancho del viaje + el enlace, en líneas separadas', () => {
    const text = buildInviteCaption('Iker', 'Japón en primavera', 'https://momentu.art/v/abc123')
    expect(text).toContain('Iker te invita a vivir su viaje')
    expect(text).toContain('«Japón en primavera»')
    expect(text.endsWith('https://momentu.art/v/abc123')).toBe(true)
  })

  test('el enlace va SIEMPRE al final, en su propia línea', () => {
    const text = buildInviteCaption('Ana', 'Lisboa', 'https://momentu.art/v/xyz')
    const lines = text.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toBe('https://momentu.art/v/xyz')
  })
})
