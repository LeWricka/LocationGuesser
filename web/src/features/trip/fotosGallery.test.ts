import { describe, test, expect } from 'vitest'
import { dayKey, dayLabel, groupPhotosByDay, type GalleryPhoto } from './fotosGallery'

function photo(over: Partial<GalleryPhoto>): GalleryPhoto {
  return {
    src: 'signed://photo.jpg',
    momentId: 'c1',
    momentTitle: 'Un momento',
    date: '2026-06-15T10:00:00.000Z',
    ...over,
  }
}

describe('dayKey / dayLabel', () => {
  test('dayKey toma la fecha UTC (los 10 primeros caracteres del ISO)', () => {
    expect(dayKey('2026-06-15T23:50:00.000Z')).toBe('2026-06-15')
  })

  test('dayLabel da una fecha corta en español, sin punto tras el mes', () => {
    expect(dayLabel('2026-06-15T10:00:00.000Z')).toBe('15 jun')
  })
})

describe('groupPhotosByDay', () => {
  test('agrupa por día conservando el orden cronológico (primer día primero)', () => {
    const photos = [
      photo({ momentId: 'c1', date: '2026-06-15T08:00:00.000Z' }),
      photo({ momentId: 'c2', date: '2026-06-16T08:00:00.000Z' }),
      photo({ momentId: 'c3', date: '2026-06-15T20:00:00.000Z' }),
    ]
    const groups = groupPhotosByDay(photos)
    expect(groups.map((g) => g.key)).toEqual(['2026-06-15', '2026-06-16'])
    // Las dos fotos del 15 caen en el MISMO grupo, en su orden original.
    expect(groups[0].photos.map((p) => p.momentId)).toEqual(['c1', 'c3'])
    expect(groups[1].photos.map((p) => p.momentId)).toEqual(['c2'])
  })

  test('cada foto lleva su índice PLANO (flatIndex) sobre el array de entrada completo', () => {
    const photos = [
      photo({ momentId: 'c1', date: '2026-06-15T08:00:00.000Z' }),
      photo({ momentId: 'c2', date: '2026-06-16T08:00:00.000Z' }),
      photo({ momentId: 'c3', date: '2026-06-15T20:00:00.000Z' }),
    ]
    const groups = groupPhotosByDay(photos)
    expect(groups[0].photos.map((p) => p.flatIndex)).toEqual([0, 2])
    expect(groups[1].photos.map((p) => p.flatIndex)).toEqual([1])
  })

  test('varias fotos de un mismo recuerdo (galería) caen bajo su mismo día', () => {
    const photos = [
      photo({ momentId: 'c1', date: '2026-06-15T08:00:00.000Z', src: 'a.jpg' }),
      photo({ momentId: 'c1', date: '2026-06-15T08:00:00.000Z', src: 'b.jpg' }),
      photo({ momentId: 'c1', date: '2026-06-15T08:00:00.000Z', src: 'c.jpg' }),
    ]
    const groups = groupPhotosByDay(photos)
    expect(groups).toHaveLength(1)
    expect(groups[0].photos.map((p) => p.src)).toEqual(['a.jpg', 'b.jpg', 'c.jpg'])
  })

  test('sin fotos, no hay grupos', () => {
    expect(groupPhotosByDay([])).toEqual([])
  })
})
