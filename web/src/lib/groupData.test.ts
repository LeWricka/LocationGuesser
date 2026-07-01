import { describe, test, expect, vi } from 'vitest'

// El módulo importa `./supabase`, que lanza sin env vars. Mockeamos un cliente
// encadenable: aísla las funciones puras y deja inspeccionar el update de premios,
// el rename, el delete y el insert (crear viaje).
const updateSpy = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
const deleteSpy = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
const insertSpy = vi.fn<() => Promise<{ error: { message: string } | null }>>(() =>
  Promise.resolve({ error: null }),
)
vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ update: updateSpy, delete: deleteSpy, insert: insertSpy })),
  },
}))
// groupData importa signedImageUrl (para listTripPhotos); no lo ejercitamos aquí.
vi.mock('./storage', () => ({ signedImageUrl: vi.fn(() => Promise.resolve(null)) }))

import {
  buildGroupInsert,
  createGroup,
  deleteGroup,
  isLive,
  normalizePrizes,
  normalizeTripData,
  splitByStatus,
  updateGroupCover,
  updateGroupName,
  updateGroupPrizes,
  updateGroupTripData,
} from './groupData'

const now = new Date('2026-06-19T12:00:00.000Z')
const future = '2026-06-19T18:00:00.000Z'
const past = '2026-06-19T06:00:00.000Z'

describe('isLive', () => {
  test('plazo futuro está en vivo', () => {
    expect(isLive({ deadline_at: future }, now)).toBe(true)
  })

  test('plazo pasado está cerrado', () => {
    expect(isLive({ deadline_at: past }, now)).toBe(false)
  })
})

describe('splitByStatus', () => {
  test('separa en vivo de anteriores conservando el orden', () => {
    const challenges = [
      { id: 'a', deadline_at: future },
      { id: 'b', deadline_at: past },
      { id: 'c', deadline_at: future },
    ]
    const { live, past: closed } = splitByStatus(challenges, now)
    expect(live.map((c) => c.id)).toEqual(['a', 'c'])
    expect(closed.map((c) => c.id)).toEqual(['b'])
  })

  test('lista vacía da dos listas vacías', () => {
    expect(splitByStatus([], now)).toEqual({ live: [], past: [] })
  })
})

describe('normalizePrizes', () => {
  test('recorta cada premio y mantiene el orden de los puestos', () => {
    expect(normalizePrizes({ first: '  elige restaurante  ', last: ' paga las cañas ' })).toEqual({
      first: 'elige restaurante',
      last: 'paga las cañas',
    })
  })

  test('descarta claves vacías o de solo espacios', () => {
    expect(normalizePrizes({ first: 'manda', second: '   ', third: '' })).toEqual({
      first: 'manda',
    })
  })

  test('todas vacías → null (borra los premios)', () => {
    expect(normalizePrizes({ first: '  ', last: '' })).toBeNull()
    expect(normalizePrizes({})).toBeNull()
  })
})

describe('updateGroupPrizes', () => {
  test('guarda el jsonb normalizado (recortado, sin claves vacías)', async () => {
    updateSpy.mockClear()
    await updateGroupPrizes('ABC', { first: '  manda  ', second: '   ', last: 'invita' })
    expect(updateSpy).toHaveBeenCalledWith({ prizes: { first: 'manda', last: 'invita' } })
  })

  test('todos los premios vacíos → null', async () => {
    updateSpy.mockClear()
    await updateGroupPrizes('ABC', { first: '   ', last: '' })
    expect(updateSpy).toHaveBeenCalledWith({ prizes: null })
  })
})

describe('updateGroupName', () => {
  test('recorta el nombre y lo guarda', async () => {
    updateSpy.mockClear()
    await updateGroupName('ABC', '  Finde en Madrid  ')
    expect(updateSpy).toHaveBeenCalledWith({ name: 'Finde en Madrid' })
  })

  test('nombre vacío → null (cae al código del grupo)', async () => {
    updateSpy.mockClear()
    await updateGroupName('ABC', '   ')
    expect(updateSpy).toHaveBeenCalledWith({ name: null })
  })
})

describe('normalizeTripData', () => {
  test('recorta textos y pasa vacíos a null', () => {
    expect(
      normalizeTripData({
        startsOn: '2026-06-04',
        endsOn: '2026-06-18',
        description: '  templos y ramen ',
        companions: '   ',
      }),
    ).toEqual({
      starts_on: '2026-06-04',
      ends_on: '2026-06-18',
      description: 'templos y ramen',
      companions: null,
    })
  })

  test('rango invertido (vuelta antes de la salida) se endereza', () => {
    const row = normalizeTripData({
      startsOn: '2026-06-18',
      endsOn: '2026-06-04',
      description: null,
      companions: null,
    })
    expect(row.starts_on).toBe('2026-06-04')
    expect(row.ends_on).toBe('2026-06-18')
  })
})

describe('updateGroupTripData', () => {
  test('guarda las fechas/descripción/acompañantes normalizados', async () => {
    updateSpy.mockClear()
    await updateGroupTripData('ABC', {
      startsOn: '2026-06-04',
      endsOn: '2026-06-18',
      description: '  de qué va ',
      companions: 'Marta',
    })
    expect(updateSpy).toHaveBeenCalledWith({
      starts_on: '2026-06-04',
      ends_on: '2026-06-18',
      description: 'de qué va',
      companions: 'Marta',
    })
  })
})

describe('updateGroupCover', () => {
  test('fija la portada con el path dado', async () => {
    updateSpy.mockClear()
    await updateGroupCover('ABC', 'foto-1.jpg')
    expect(updateSpy).toHaveBeenCalledWith({ cover_image_path: 'foto-1.jpg' })
  })

  test('null quita la portada (vuelve a la derivada)', async () => {
    updateSpy.mockClear()
    await updateGroupCover('ABC', null)
    expect(updateSpy).toHaveBeenCalledWith({ cover_image_path: null })
  })
})

describe('deleteGroup', () => {
  test('borra el grupo por su id', async () => {
    deleteSpy.mockClear()
    await deleteGroup('ABC')
    expect(deleteSpy).toHaveBeenCalled()
  })
})

describe('buildGroupInsert', () => {
  test('recorta el nombre y normaliza los datos del viaje', () => {
    expect(
      buildGroupInsert('ABC', 'user-1', {
        name: '  Japón en otoño  ',
        startsOn: '2026-10-12',
        endsOn: '2026-10-26',
        description: '  templos y ramen ',
        companions: ' Marta y Diego ',
      }),
    ).toEqual({
      id: 'ABC',
      name: 'Japón en otoño',
      created_by: 'user-1',
      starts_on: '2026-10-12',
      ends_on: '2026-10-26',
      description: 'templos y ramen',
      companions: 'Marta y Diego',
      cover_image_path: null,
    })
  })

  test('campos opcionales vacíos o ausentes → null', () => {
    expect(
      buildGroupInsert('ABC', 'user-1', {
        name: 'Solo nombre',
        startsOn: '',
        description: '   ',
      }),
    ).toEqual({
      id: 'ABC',
      name: 'Solo nombre',
      created_by: 'user-1',
      starts_on: null,
      ends_on: null,
      description: null,
      companions: null,
      cover_image_path: null,
    })
  })

  test('nombre vacío → null (cae al código del grupo en la cabecera)', () => {
    expect(buildGroupInsert('ABC', 'user-1', { name: '   ' }).name).toBeNull()
  })

  test('rango invertido (vuelta antes de la salida) se endereza', () => {
    const row = buildGroupInsert('ABC', 'user-1', {
      name: 'Viaje',
      startsOn: '2026-10-26',
      endsOn: '2026-10-12',
    })
    expect(row.starts_on).toBe('2026-10-12')
    expect(row.ends_on).toBe('2026-10-26')
  })
})

describe('createGroup', () => {
  test('inserta la fila construida en groups', async () => {
    insertSpy.mockClear()
    await createGroup('ABC', 'user-1', { name: 'Japón', startsOn: '2026-10-12' })
    expect(insertSpy).toHaveBeenCalledWith({
      id: 'ABC',
      name: 'Japón',
      created_by: 'user-1',
      starts_on: '2026-10-12',
      ends_on: null,
      description: null,
      companions: null,
      cover_image_path: null,
    })
  })

  test('propaga el error de Supabase como Error', async () => {
    insertSpy.mockReturnValueOnce(Promise.resolve({ error: { message: 'boom' } }))
    await expect(createGroup('ABC', 'user-1', { name: 'X' })).rejects.toThrow('boom')
  })
})
