import { describe, test, expect } from 'vitest'
import { PIN_ANCHOR, PIN_SIZE, avatarPinFromProfile, avatarPinSvg, targetPinSvg } from './avatarPin'
import { avatarToken, canonicalEmoji, svgForEmoji } from './avatar'

function decode(uri: string): string {
  expect(uri.startsWith('data:image/svg+xml,')).toBe(true)
  return decodeURIComponent(uri.slice('data:image/svg+xml,'.length))
}

describe('avatarPinSvg', () => {
  test('devuelve un data-URI de SVG', () => {
    expect(avatarPinSvg('🦊').startsWith('data:image/svg+xml,')).toBe(true)
  })

  // Issue #794: la era anterior servía el EMOJI crudo como <text>; ahora es el
  // MISMO dibujo de línea que Avatar.tsx (nunca emoji suelto).
  test('incrusta el dibujo de línea del animal (ANIMAL_SVGS), no el emoji como texto', () => {
    const svg = decode(avatarPinSvg('🦊'))
    const fox = svgForEmoji('🦊')
    expect(fox).toBeTruthy()
    expect(svg).not.toContain('<text')
    expect(svg).not.toContain('🦊')
    // El path del zorro empieza con este trazo característico.
    expect(svg).toContain('M4 6l5 4 3-1 3 1 5-4-1 7')
  })

  test('cambia el path según el animal', () => {
    const fox = decode(avatarPinSvg('🦊'))
    const owl = decode(avatarPinSvg('🦉'))
    expect(fox).not.toBe(owl)
  })

  test('anillo por defecto blanco; "active" lo pasa a teal profundo (issue #795, pin propio)', () => {
    const def = decode(avatarPinSvg('🦊', 'default'))
    const active = decode(avatarPinSvg('🦊', 'active'))
    expect(def).toContain('#ffffff')
    expect(active).toContain('#0f766e')
  })

  test('el data-URI no contiene caracteres que lo rompan (#, <, >) sin codificar', () => {
    const uri = avatarPinSvg('🦊')
    const sinPrefijo = uri.slice('data:image/svg+xml,'.length)
    expect(sinPrefijo).not.toMatch(/[#<>]/)
  })

  // Issue #811: badge de puesto en la esquina sup-derecha, mismo lenguaje que
  // ui/Medal (oro/plata/bronce, neutro a partir del 4º). Sin `rank`, ninguno.
  test('sin rank, no dibuja ningún badge de puesto', () => {
    const svg = decode(avatarPinSvg('🦊'))
    expect(svg).not.toContain('#c9a24b') // oro
    expect(svg).not.toContain('#a9a39a') // plata
    expect(svg).not.toContain('#b07a4e') // bronce
    expect(svg).not.toContain('#575f6c') // neutro
  })

  test('rank 1/2/3 → disco oro/plata/bronce; 4+ → disco neutro', () => {
    expect(decode(avatarPinSvg('🦊', 'default', 1))).toContain('#c9a24b')
    expect(decode(avatarPinSvg('🦊', 'default', 2))).toContain('#a9a39a')
    expect(decode(avatarPinSvg('🦊', 'default', 3))).toContain('#b07a4e')
    expect(decode(avatarPinSvg('🦊', 'default', 4))).toContain('#575f6c')
    expect(decode(avatarPinSvg('🦊', 'default', 10))).toContain('#575f6c')
  })

  test('rank null → igual que sin rank (defensivo: no revienta con votos sin puesto calculable)', () => {
    expect(avatarPinSvg('🦊', 'default', null)).toBe(avatarPinSvg('🦊'))
  })
})

describe('constantes de tamaño', () => {
  test('PIN_SIZE tiene width y height positivos', () => {
    expect(PIN_SIZE.width).toBeGreaterThan(0)
    expect(PIN_SIZE.height).toBeGreaterThan(0)
  })

  // El icono lleva un margen EXTRA (issue #811) a la derecha y arriba para el
  // badge de puesto: la punta ya NO cae en el centro horizontal del icono
  // completo (ese margen es asimétrico), pero sigue dentro de sus límites.
  test('PIN_ANCHOR es la punta abajo, dentro de los límites del icono', () => {
    expect(PIN_ANCHOR.x).toBeGreaterThan(0)
    expect(PIN_ANCHOR.x).toBeLessThan(PIN_SIZE.width)
    expect(PIN_ANCHOR.y).toBeLessThanOrEqual(PIN_SIZE.height)
  })
})

describe('avatarPinFromProfile', () => {
  test('token del set → pin con ese animal', () => {
    const uri = avatarPinFromProfile(avatarToken('🦊'), 'user-1')
    expect(uri).toBe(avatarPinSvg('🦊'))
  })

  test('token antiguo → pin con el animal canónico (nunca un emoji retirado)', () => {
    const canon = canonicalEmoji('🐼')
    const uri = avatarPinFromProfile(avatarToken('🐼'), 'user-1')
    expect(uri).toBe(avatarPinSvg(canon))
  })

  test('null → pin del avatar por defecto del id (estable)', () => {
    const a = avatarPinFromProfile(null, 'user-1')
    const b = avatarPinFromProfile(null, 'user-1')
    expect(a).toBe(b)
    expect(a.startsWith('data:image/svg+xml,')).toBe(true)
  })

  test('imagen → cae al animal por defecto del id (sigue siendo SVG de línea)', () => {
    const uri = avatarPinFromProfile('https://cdn.example.com/a.png', 'user-1')
    expect(uri.startsWith('data:image/svg+xml,')).toBe(true)
  })

  test('own=true → anillo teal profundo (para encontrar tu propio pin entre el resto)', () => {
    const normal = decode(avatarPinFromProfile(avatarToken('🦊'), 'user-1'))
    const own = decode(avatarPinFromProfile(avatarToken('🦊'), 'user-1', true))
    expect(normal).toContain('#ffffff')
    expect(own).toContain('#0f766e')
  })
})

describe('targetPinSvg', () => {
  test('devuelve un data-URI de SVG en disco de oro (se distingue de los pines de jugador)', () => {
    const svg = decode(targetPinSvg())
    expect(svg).toContain('#c9a24b')
    expect(svg).not.toContain('<text')
  })

  test('es estable (misma llamada, mismo resultado)', () => {
    expect(targetPinSvg()).toBe(targetPinSvg())
  })

  test('usa el mismo tamaño/ancla que los pines de avatar (para encajar en el mismo mapa)', () => {
    const svg = decode(targetPinSvg())
    expect(svg).toContain(`width="${PIN_SIZE.width}"`)
    expect(svg).toContain(`height="${PIN_SIZE.height}"`)
  })
})
