import { describe, test, expect, beforeEach } from 'vitest'
import { parseGroupCode, joinByCode } from './navigation'

describe('parseGroupCode', () => {
  test('extrae el código de un enlace completo', () => {
    expect(parseGroupCode('https://app.test/#g=ABC123')).toBe('ABC123')
  })

  test('ignora el reto cuando el enlace lleva &c=', () => {
    expect(parseGroupCode('https://app.test/#g=ABC123&c=xyz')).toBe('ABC123')
  })

  test('acepta el código a secas', () => {
    expect(parseGroupCode('ABC123')).toBe('ABC123')
  })

  test('recorta espacios y se queda con el primer token', () => {
    expect(parseGroupCode('  ABC123  ')).toBe('ABC123')
  })

  test('decodifica valores percent-encoded', () => {
    expect(parseGroupCode('#g=a%20b')).toBe('a b')
  })

  test('cadena vacía → null', () => {
    expect(parseGroupCode('   ')).toBeNull()
  })
})

describe('joinByCode', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  test('navega a #g=<code> con un código válido', () => {
    expect(joinByCode('ABC123')).toBe(true)
    expect(window.location.hash).toBe('#g=ABC123')
  })

  test('no navega con entrada vacía', () => {
    expect(joinByCode('  ')).toBe(false)
    expect(window.location.hash).toBe('')
  })
})
