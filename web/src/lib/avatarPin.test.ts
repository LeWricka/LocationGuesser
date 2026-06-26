import { describe, test, expect } from 'vitest'
import {
  PIN_ANCHOR,
  PIN_LABEL_ORIGIN,
  PIN_SIZE,
  avatarPinFromProfile,
  avatarPinSvg,
} from './avatarPin'
import { avatarToken, bgForEmoji } from './avatar'

describe('avatarPinSvg', () => {
  test('devuelve un data-URI de SVG', () => {
    const uri = avatarPinSvg('🦊', '#5b8def')
    expect(uri.startsWith('data:image/svg+xml,')).toBe(true)
  })

  test('contiene el emoji (decodificando el data-URI)', () => {
    const uri = avatarPinSvg('🐼', '#ff5e7e')
    expect(decodeURIComponent(uri)).toContain('🐼')
  })

  test('cambia con el color de fondo', () => {
    const azul = avatarPinSvg('🦊', '#5b8def')
    const rojo = avatarPinSvg('🦊', '#ff5e7e')
    expect(azul).not.toBe(rojo)
  })

  test('color sólido se usa como fill directo', () => {
    const svg = decodeURIComponent(avatarPinSvg('🦊', '#abcdef'))
    expect(svg).toContain('fill="#abcdef"')
    expect(svg).not.toContain('linearGradient')
  })

  test('gradiente define un linearGradient con sus colores', () => {
    const svg = decodeURIComponent(
      avatarPinSvg('🦊', 'linear-gradient(135deg, #ff8a5b 0%, #ff5e7e 100%)'),
    )
    expect(svg).toContain('<linearGradient')
    expect(svg).toContain('#ff8a5b')
    expect(svg).toContain('#ff5e7e')
    expect(svg).toContain('fill="url(#g)"')
  })

  test('el data-URI no contiene caracteres que lo rompan (#, <, >)', () => {
    const uri = avatarPinSvg('🦊', 'linear-gradient(135deg, #ff8a5b 0%, #ff5e7e 100%)')
    const sinPrefijo = uri.slice('data:image/svg+xml,'.length)
    expect(sinPrefijo).not.toMatch(/[#<>]/)
  })
})

describe('constantes de tamaño', () => {
  test('PIN_SIZE tiene width y height positivos', () => {
    expect(PIN_SIZE.width).toBeGreaterThan(0)
    expect(PIN_SIZE.height).toBeGreaterThan(0)
  })

  test('PIN_ANCHOR es la punta abajo-centro', () => {
    expect(PIN_ANCHOR.x).toBe(PIN_SIZE.width / 2)
    expect(PIN_ANCHOR.y).toBe(PIN_SIZE.height)
  })

  test('PIN_LABEL_ORIGIN queda debajo del pin', () => {
    expect(PIN_LABEL_ORIGIN.y).toBeGreaterThan(PIN_SIZE.height)
  })
})

describe('avatarPinFromProfile', () => {
  test('token emoji → pin con ese emoji y su fondo', () => {
    const uri = avatarPinFromProfile(avatarToken('🐼'), 'user-1')
    expect(uri).toBe(avatarPinSvg('🐼', bgForEmoji('🐼').background))
  })

  test('null → pin del avatar por defecto del id (estable)', () => {
    const a = avatarPinFromProfile(null, 'user-1')
    const b = avatarPinFromProfile(null, 'user-1')
    expect(a).toBe(b)
    expect(a.startsWith('data:image/svg+xml,')).toBe(true)
  })

  test('imagen → cae al emoji por defecto del id (sigue siendo SVG)', () => {
    const uri = avatarPinFromProfile('https://cdn.example.com/a.png', 'user-1')
    expect(uri.startsWith('data:image/svg+xml,')).toBe(true)
  })
})
