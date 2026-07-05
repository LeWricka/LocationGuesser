import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hasWebGL, resetWebGLSupportCache } from './webglSupport'

describe('hasWebGL', () => {
  beforeEach(() => {
    resetWebGLSupportCache()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('devuelve true y suelta el contexto de prueba cuando el navegador soporta WebGL', () => {
    const loseContext = vi.fn()
    const fakeGl = { getExtension: vi.fn(() => ({ loseContext })) }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      fakeGl as unknown as RenderingContext,
    )

    expect(hasWebGL()).toBe(true)
    expect(fakeGl.getExtension).toHaveBeenCalledWith('WEBGL_lose_context')
    expect(loseContext).toHaveBeenCalledOnce()
  })

  it('devuelve false si el navegador no da ningún contexto WebGL', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

    expect(hasWebGL()).toBe(false)
  })

  it('devuelve false sin lanzar si getContext lanza (WebGL bloqueado)', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('WebGL bloqueado')
    })

    expect(hasWebGL()).toBe(false)
  })

  it('cachea el resultado: solo pide el contexto UNA VEZ aunque se llame varias veces', () => {
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({} as unknown as RenderingContext)

    expect(hasWebGL()).toBe(true)
    expect(hasWebGL()).toBe(true)
    expect(hasWebGL()).toBe(true)
    expect(getContext).toHaveBeenCalledOnce()
  })
})
