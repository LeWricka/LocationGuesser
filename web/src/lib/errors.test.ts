import { describe, test, expect } from 'vitest'
import { describeError } from './errors'

describe('describeError', () => {
  test('Error nativo: usa el message', () => {
    expect(describeError(new Error('algo falló'))).toBe('algo falló')
  })

  test('Error nativo sin message: cae al name', () => {
    expect(describeError(new TypeError())).toBe('TypeError')
  })

  test('error tipo PostgREST: combina message/details/hint y añade el code', () => {
    const err = {
      message: 'no es miembro del grupo',
      details: 'fila no encontrada',
      hint: 'únete primero',
      code: 'PGRST116',
    }
    expect(describeError(err)).toBe(
      'no es miembro del grupo · fila no encontrada · únete primero (PGRST116)',
    )
  })

  test('error tipo PostgREST con solo message', () => {
    expect(describeError({ message: 'permiso denegado', code: '42501' })).toBe(
      'permiso denegado (42501)',
    )
  })

  test('error tipo PostgREST sin texto pero con code', () => {
    expect(describeError({ code: 'PGRST301' })).toBe('Error PGRST301')
  })

  test('cadena suelta lanzada como error', () => {
    expect(describeError('boom')).toBe('boom')
  })

  test('objeto raro sin campos conocidos: JSON, nunca [object Object]', () => {
    const out = describeError({ foo: 'bar', n: 1 })
    expect(out).not.toBe('[object Object]')
    expect(out).toContain('foo')
  })

  test('null/undefined: mensaje genérico', () => {
    expect(describeError(null)).toBe('Error desconocido')
    expect(describeError(undefined)).toBe('Error desconocido')
  })

  test('referencia circular (no serializable): mensaje genérico', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(describeError(circular)).toBe('Error desconocido')
  })
})
