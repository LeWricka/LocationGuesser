import { describe, expect, test } from 'vitest'
import { toReportableError } from './observability'

describe('toReportableError', () => {
  test('un Error real se devuelve tal cual (comportamiento intacto)', () => {
    const original = new TypeError('boom')
    const { error, extra } = toReportableError(original)
    expect(error).toBe(original)
    expect(extra).toBeUndefined()
  })

  test('error de Supabase/PostgREST (objeto plano) → Error con message + code (issue moment_images 42501)', () => {
    const supabaseErr = {
      code: '42501',
      details: null,
      hint: null,
      message: 'new row violates row-level security policy for table "moment_images"',
    }
    const { error, extra } = toReportableError(supabaseErr)
    expect(error).toBeInstanceOf(Error)
    // El message es lo que Sentry usa para titular/agrupar/buscar.
    expect(error.message).toBe(
      'new row violates row-level security policy for table "moment_images"',
    )
    expect(error.name).toBe('SupabaseError(42501)')
    expect(extra).toEqual({ code: '42501' })
  })

  test('objeto sin message → Error con representación segura, sin petar', () => {
    const { error } = toReportableError({ foo: 1 })
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toContain('Non-Error')
  })

  test('string → Error con el texto', () => {
    const { error } = toReportableError('algo falló')
    expect(error.message).toBe('algo falló')
  })

  test('objeto circular → no lanza (safeStringify)', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() => toReportableError(circular)).not.toThrow()
  })
})
