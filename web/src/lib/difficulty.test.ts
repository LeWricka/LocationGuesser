import { describe, test, expect } from 'vitest'
import {
  difficultyFromMedia,
  isValidMedia,
  sceneMediumFromMedia,
  DIFFICULTY_MEDIA,
} from './difficulty'

describe('difficultyFromMedia', () => {
  test('foto + Street View → fácil', () => {
    expect(difficultyFromMedia({ hasPhoto: true, hasStreetView: true })).toBe('facil')
  })

  test('solo Street View → medio', () => {
    expect(difficultyFromMedia({ hasPhoto: false, hasStreetView: true })).toBe('medio')
  })

  test('solo foto → difícil', () => {
    expect(difficultyFromMedia({ hasPhoto: true, hasStreetView: false })).toBe('dificil')
  })

  test('sin foto ni Street View → null (combinación inválida)', () => {
    expect(difficultyFromMedia({ hasPhoto: false, hasStreetView: false })).toBeNull()
  })

  test('cada dificultad se deriva de SUS propios medios (ida y vuelta)', () => {
    for (const [difficulty, media] of Object.entries(DIFFICULTY_MEDIA)) {
      expect(difficultyFromMedia(media)).toBe(difficulty)
    }
  })
})

describe('isValidMedia — regla dura "medium != none"', () => {
  test('válido si hay foto', () => {
    expect(isValidMedia({ hasPhoto: true, hasStreetView: false })).toBe(true)
  })

  test('válido si hay Street View', () => {
    expect(isValidMedia({ hasPhoto: false, hasStreetView: true })).toBe(true)
  })

  test('válido si hay ambos', () => {
    expect(isValidMedia({ hasPhoto: true, hasStreetView: true })).toBe(true)
  })

  test('INVÁLIDO sin ninguno (un reto debe mostrar al menos foto o SV)', () => {
    expect(isValidMedia({ hasPhoto: false, hasStreetView: false })).toBe(false)
  })
})

describe('sceneMediumFromMedia', () => {
  test('Street View manda sobre la foto cuando hay ambos (sin spoiler)', () => {
    expect(sceneMediumFromMedia({ hasPhoto: true, hasStreetView: true })).toBe('streetview')
  })

  test('solo Street View → streetview', () => {
    expect(sceneMediumFromMedia({ hasPhoto: false, hasStreetView: true })).toBe('streetview')
  })

  test('solo foto → photo', () => {
    expect(sceneMediumFromMedia({ hasPhoto: true, hasStreetView: false })).toBe('photo')
  })

  test('nada → none', () => {
    expect(sceneMediumFromMedia({ hasPhoto: false, hasStreetView: false })).toBe('none')
  })
})
