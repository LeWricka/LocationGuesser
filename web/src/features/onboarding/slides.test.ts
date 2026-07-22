import { describe, expect, test } from 'vitest'
import { getSlides } from './slides'

describe('getSlides', () => {
  test('cada contexto de creación trae sus slides', () => {
    expect(getSlides('create-trip').length).toBeGreaterThan(0)
    expect(getSlides('add-moment').length).toBeGreaterThan(0)
    expect(getSlides('create-challenge').length).toBeGreaterThan(0)
  })

  test('el tutorial único de entrada cubre el bucle en 4-5 slides (#742)', () => {
    const slides = getSlides('entry')
    // Una idea por slide, arco completo pero corto (máx 5).
    expect(slides.length).toBeGreaterThanOrEqual(4)
    expect(slides.length).toBeLessThanOrEqual(5)
    // Ninguna slide queda coja: título e imagen reales en cada paso.
    for (const slide of slides) {
      expect(slide.title.trim().length).toBeGreaterThan(0)
      expect(slide.image.length).toBeGreaterThan(0)
    }
  })

  // Onboarding nuevo (pieza 1/4): `welcome` ya no usa slides — pinta el marco de
  // una pantalla `GuestWelcomeFrame` (ver OnboardingGate). `guest-register`
  // (registro post-valor) tampoco. Ambos devuelven vacío a propósito.
  test('welcome y guest-register no traen slides (contenido propio, no slideshow)', () => {
    expect(getSlides('welcome')).toEqual([])
    expect(getSlides('guest-register')).toEqual([])
  })

  // Onboarding nuevo (pieza 2/4): `reto_share` (entrada por reto suelto) tampoco
  // usa el slideshow genérico — RetoShareIntro/RetoShareExplainSequence.
  test('reto_share no trae slides (contenido propio, no slideshow)', () => {
    expect(getSlides('reto_share')).toEqual([])
  })
})
