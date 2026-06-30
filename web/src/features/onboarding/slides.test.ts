import { describe, expect, test } from 'vitest'
import { getSlides } from './slides'

describe('getSlides', () => {
  test('cada contexto de creación trae sus slides', () => {
    expect(getSlides('create-trip').length).toBeGreaterThan(0)
    expect(getSlides('add-moment').length).toBeGreaterThan(0)
    expect(getSlides('create-challenge').length).toBeGreaterThan(0)
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
})
