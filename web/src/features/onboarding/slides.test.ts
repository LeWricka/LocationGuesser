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

  test('welcome personaliza el titular con el nombre del viaje', () => {
    const slides = getSlides('welcome', { tripName: 'Japón 2026' })
    expect(slides[0].title).toContain('Japón 2026')
  })

  test('welcome cae a copy genérico sin nombre de viaje', () => {
    const slides = getSlides('welcome')
    expect(slides.length).toBeGreaterThan(0)
    // Sin nombre, el titular no debe quedar con un hueco vacío.
    expect(slides[0].title).not.toContain('undefined')
    expect(slides[0].title.trim().length).toBeGreaterThan(0)
  })

  test('welcome ignora un nombre en blanco (cae a genérico)', () => {
    const generic = getSlides('welcome').at(0)?.title
    const blank = getSlides('welcome', { tripName: '   ' }).at(0)?.title
    expect(blank).toBe(generic)
  })

  // Issue #752: si el dueño ya definió qué se juega, el receptor lo ve desde el
  // primer paso de su bienvenida — el gancho de motivación no puede esperar a
  // que entre al viaje.
  test('welcome añade los premios al cuerpo del primer paso si los hay', () => {
    const slides = getSlides('welcome', {
      tripName: 'Japón 2026',
      prizesSummary: '1º manda  ·  Último invita',
    })
    expect(slides[0].body).toContain('En juego: 1º manda  ·  Último invita')
  })

  test('welcome sin premios no menciona "En juego"', () => {
    const slides = getSlides('welcome', { tripName: 'Japón 2026' })
    expect(slides[0].body).not.toContain('En juego')
  })
})
