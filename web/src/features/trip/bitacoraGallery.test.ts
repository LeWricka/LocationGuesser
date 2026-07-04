import { describe, test, expect } from 'vitest'
import { dayKey, dayLabel, groupMomentsByDay, type BitacoraMomentInput } from './bitacoraGallery'

function momentInput(over: Partial<BitacoraMomentInput> = {}): BitacoraMomentInput {
  return {
    momentId: 'c1',
    momentTitle: 'Un momento',
    date: '2026-06-15T10:00:00.000Z',
    description: null,
    dateLabel: null,
    audioUrl: null,
    videoUrl: null,
    placeLabel: null,
    photos: ['signed://photo.jpg'],
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

describe('groupMomentsByDay — agrupación por día', () => {
  test('agrupa por día conservando el orden cronológico (primer día primero)', () => {
    const moments = [
      momentInput({ momentId: 'c1', date: '2026-06-15T08:00:00.000Z' }),
      momentInput({ momentId: 'c2', date: '2026-06-16T08:00:00.000Z' }),
      momentInput({ momentId: 'c3', date: '2026-06-15T20:00:00.000Z' }),
    ]
    const { days } = groupMomentsByDay(moments)
    expect(days.map((d) => d.key)).toEqual(['2026-06-15', '2026-06-16'])
    // Los dos momentos del 15 caen en el MISMO día, en su orden original.
    expect(days[0].moments.map((m) => m.momentId)).toEqual(['c1', 'c3'])
    expect(days[1].moments.map((m) => m.momentId)).toEqual(['c2'])
  })

  test('sin momentos, no hay días', () => {
    expect(groupMomentsByDay([]).days).toEqual([])
  })
})

describe('groupMomentsByDay — fotos abribles y flatIndex', () => {
  test('un recuerdo con varias fotos las conserva TODAS, con su índice plano', () => {
    const moments = [
      momentInput({ momentId: 'c1', photos: ['a.jpg', 'b.jpg', 'c.jpg'] }),
      momentInput({
        momentId: 'c2',
        date: '2026-06-16T08:00:00.000Z',
        photos: ['d.jpg'],
      }),
    ]
    const { days, flatPhotos } = groupMomentsByDay(moments)
    expect(days[0].moments[0].photos.map((p) => p.src)).toEqual(['a.jpg', 'b.jpg', 'c.jpg'])
    expect(days[0].moments[0].photos.map((p) => p.flatIndex)).toEqual([0, 1, 2])
    expect(days[1].moments[0].photos.map((p) => p.flatIndex)).toEqual([3])
    expect(flatPhotos.map((p) => p.src)).toEqual(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'])
    expect(flatPhotos.every((p) => p.momentId === (p.src === 'd.jpg' ? 'c2' : 'c1'))).toBe(true)
  })

  test('con clip de vídeo, la portada NO cuenta como foto abrible (issue #649)', () => {
    const moments = [
      momentInput({
        momentId: 'c-clip',
        videoUrl: 'signed://clip.mp4',
        photos: ['portada.jpg', 'extra.jpg'],
      }),
    ]
    const { days, flatPhotos } = groupMomentsByDay(moments)
    const m = days[0].moments[0]
    expect(m.videoUrl).toBe('signed://clip.mp4')
    expect(m.videoPoster).toBe('portada.jpg')
    // Solo la foto EXTRA es abrible; la portada quedó de poster del vídeo.
    expect(m.photos.map((p) => p.src)).toEqual(['extra.jpg'])
    expect(flatPhotos.map((p) => p.src)).toEqual(['extra.jpg'])
  })

  test('con clip de vídeo y una sola foto (la portada), no queda ninguna abrible', () => {
    const moments = [
      momentInput({ momentId: 'c-clip', videoUrl: 'signed://clip.mp4', photos: ['portada.jpg'] }),
    ]
    const { days, flatPhotos } = groupMomentsByDay(moments)
    expect(days[0].moments[0].photos).toEqual([])
    expect(days[0].moments[0].videoPoster).toBe('portada.jpg')
    expect(flatPhotos).toEqual([])
  })
})

describe('groupMomentsByDay — lugares del día (cabecera)', () => {
  test('compone la etiqueta con los lugares únicos del día, en orden de aparición', () => {
    const moments = [
      momentInput({ momentId: 'c1', placeLabel: 'SALENTO' }),
      momentInput({ momentId: 'c2', placeLabel: 'VALLE DE COCORA' }),
      momentInput({ momentId: 'c3', placeLabel: 'SALENTO' }),
    ]
    const { days } = groupMomentsByDay(moments)
    expect(days[0].placesLabel).toBe('SALENTO · VALLE DE COCORA')
  })

  test('sin ningún lugar resuelto en el día, la etiqueta es null', () => {
    const moments = [momentInput({ placeLabel: null })]
    const { days } = groupMomentsByDay(moments)
    expect(days[0].placesLabel).toBeNull()
  })
})
