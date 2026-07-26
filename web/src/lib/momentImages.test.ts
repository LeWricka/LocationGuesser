import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { MomentImage } from './momentImages'

// Builder encadenable por tabla. `moment_images` resuelve su listado (con order)
// desde `listResult`; capturamos inserts/updates/deletes y los espejos a
// `challenges.image_path` para verificar la lógica de portada.
const listResult: { data: MomentImage[]; error: unknown } = { data: [], error: null }
const calls = {
  insert: vi.fn(),
  delete: vi.fn(),
  // Updates de challenges (espejo de portada): [{ table, patch, id }]
  mirror: vi.fn(),
  // Updates de moment_images (reordenar): [{ id, patch }]
  reorder: vi.fn(),
}

function momentImagesBuilder() {
  const builder: Record<string, unknown> = {}
  builder.select = () => builder
  builder.eq = () => builder
  builder.in = () => builder
  builder.order = () => Promise.resolve(listResult)
  builder.insert = (rows: unknown) => {
    calls.insert(rows)
    return Promise.resolve({ error: null })
  }
  builder.delete = () => {
    const d = {
      eq: (_c: string, id: string) => (calls.delete(id), Promise.resolve({ error: null })),
    }
    return d
  }
  builder.update = (patch: Record<string, unknown>) => ({
    eq: (_col: string, id: string) => {
      calls.reorder({ id, patch })
      // Permite `.then` (await) y el `.then(({error}))` del Promise.all de cover.
      return Promise.resolve({ error: null })
    },
  })
  return builder
}

function challengesBuilder() {
  const builder: Record<string, unknown> = {}
  builder.update = (patch: Record<string, unknown>) => ({
    eq: (_col: string, id: string) => {
      calls.mirror({ patch, id })
      return Promise.resolve({ error: null })
    },
  })
  return builder
}

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) =>
      table === 'moment_images' ? momentImagesBuilder() : challengesBuilder(),
  },
}))

import {
  addMomentImages,
  listGroupMomentImages,
  listMomentImages,
  removeMomentImage,
  setMomentCover,
} from './momentImages'

function img(id: string, sort: number, path = `${id}.jpg`, challengeId = 'c1'): MomentImage {
  return {
    id,
    challenge_id: challengeId,
    image_path: path,
    sort_order: sort,
    taken_at: null,
    gps_lat: null,
    gps_lng: null,
    sort_at: 'now',
    created_at: 'now',
  }
}

function newImage(
  path: string,
  meta: { takenAt?: string | null; lat?: number | null; lng?: number | null } = {},
) {
  return { path, takenAt: meta.takenAt ?? null, lat: meta.lat ?? null, lng: meta.lng ?? null }
}

beforeEach(() => {
  vi.clearAllMocks()
  listResult.data = []
  listResult.error = null
})

describe('listMomentImages', () => {
  test('devuelve las filas tal cual (ya ordenadas por la query)', async () => {
    listResult.data = [img('a', 0), img('b', 1)]
    const out = await listMomentImages('c1')
    expect(out.map((i) => i.id)).toEqual(['a', 'b'])
  })
})

describe('listGroupMomentImages', () => {
  test('sin ids: no consulta y devuelve un mapa vacío', async () => {
    const out = await listGroupMomentImages([])
    expect(out.size).toBe(0)
  })

  test('agrupa las filas de VARIOS momentos por challenge_id, en orden', async () => {
    listResult.data = [
      img('a1', 0, 'a1.jpg', 'c1'),
      img('b1', 0, 'b1.jpg', 'c2'),
      img('a2', 1, 'a2.jpg', 'c1'),
    ]
    const out = await listGroupMomentImages(['c1', 'c2'])
    expect(out.get('c1')?.map((i) => i.id)).toEqual(['a1', 'a2'])
    expect(out.get('c2')?.map((i) => i.id)).toEqual(['b1'])
  })

  test('un momento sin filas de galería no tiene entrada en el mapa', async () => {
    listResult.data = [img('a1', 0, 'a1.jpg', 'c1')]
    const out = await listGroupMomentImages(['c1', 'c2'])
    expect(out.has('c2')).toBe(false)
  })
})

describe('addMomentImages', () => {
  test('galería vacía: inserta desde 0 y espeja la 1ª en challenges.image_path', async () => {
    listResult.data = []
    await addMomentImages('c1', [newImage('x.jpg'), newImage('y.jpg')])
    expect(calls.insert).toHaveBeenCalledWith([
      {
        challenge_id: 'c1',
        image_path: 'x.jpg',
        sort_order: 0,
        taken_at: null,
        gps_lat: null,
        gps_lng: null,
      },
      {
        challenge_id: 'c1',
        image_path: 'y.jpg',
        sort_order: 1,
        taken_at: null,
        gps_lat: null,
        gps_lng: null,
      },
    ])
    // Portada espejada (no había portada previa).
    expect(calls.mirror).toHaveBeenCalledWith({ patch: { image_path: 'x.jpg' }, id: 'c1' })
  })

  test('inserta la meta EXIF (fecha de captura + GPS) de cada foto', async () => {
    listResult.data = []
    await addMomentImages('c1', [
      newImage('x.jpg', { takenAt: '2026-06-01T10:00:00.000Z', lat: 40.4, lng: -3.7 }),
    ])
    expect(calls.insert).toHaveBeenCalledWith([
      {
        challenge_id: 'c1',
        image_path: 'x.jpg',
        sort_order: 0,
        taken_at: '2026-06-01T10:00:00.000Z',
        gps_lat: 40.4,
        gps_lng: -3.7,
      },
    ])
  })

  test('con galería previa: continúa tras el MAYOR sort_order y NO re-espeja portada', async () => {
    // Ojo: el orden de listMomentImages ya no es por sort_order (es sort_at), así
    // que el máximo puede no ser el ÚLTIMO elemento del array.
    listResult.data = [img('a', 2), img('b', 0)]
    await addMomentImages('c1', [newImage('z.jpg')])
    expect(calls.insert).toHaveBeenCalledWith([
      {
        challenge_id: 'c1',
        image_path: 'z.jpg',
        sort_order: 3,
        taken_at: null,
        gps_lat: null,
        gps_lng: null,
      },
    ])
    expect(calls.mirror).not.toHaveBeenCalled()
  })

  test('sin fotos: no hace nada', async () => {
    await addMomentImages('c1', [])
    expect(calls.insert).not.toHaveBeenCalled()
  })
})

describe('setMomentCover', () => {
  test('intercambia el sort_order con la portada actual y espeja su image_path', async () => {
    listResult.data = [img('a', 0, 'a.jpg'), img('b', 1, 'b.jpg'), img('c', 2, 'c.jpg')]
    await setMomentCover('c1', 'c')
    // 'c' (elegida) hereda el sort_order de la portada actual ('a', 0); 'a' se
    // queda con el que tenía 'c' (2). 'b' no se toca.
    expect(calls.reorder).toHaveBeenCalledWith({ id: 'c', patch: { sort_order: 0 } })
    expect(calls.reorder).toHaveBeenCalledWith({ id: 'a', patch: { sort_order: 2 } })
    expect(calls.reorder).toHaveBeenCalledTimes(2)
    expect(calls.mirror).toHaveBeenCalledWith({ patch: { image_path: 'c.jpg' }, id: 'c1' })
  })

  test('la portada es la de menor sort_order, no la posición [0] de la lista', async () => {
    // Lista ordenada por sort_at: 'b' va primero pero 'a' (sort_order 0) es la portada.
    listResult.data = [img('b', 1, 'b.jpg'), img('a', 0, 'a.jpg')]
    await setMomentCover('c1', 'b')
    expect(calls.reorder).toHaveBeenCalledWith({ id: 'b', patch: { sort_order: 0 } })
    expect(calls.reorder).toHaveBeenCalledWith({ id: 'a', patch: { sort_order: 1 } })
    expect(calls.mirror).toHaveBeenCalledWith({ patch: { image_path: 'b.jpg' }, id: 'c1' })
  })

  test('si ya es la portada, no toca nada', async () => {
    listResult.data = [img('a', 0), img('b', 1)]
    await setMomentCover('c1', 'a')
    expect(calls.reorder).not.toHaveBeenCalled()
    expect(calls.mirror).not.toHaveBeenCalled()
  })
})

describe('removeMomentImage', () => {
  test('quita la portada: re-espeja la siguiente', async () => {
    listResult.data = [img('a', 0, 'a.jpg'), img('b', 1, 'b.jpg')]
    await removeMomentImage('c1', 'a')
    expect(calls.delete).toHaveBeenCalledWith('a')
    expect(calls.mirror).toHaveBeenCalledWith({ patch: { image_path: 'b.jpg' }, id: 'c1' })
  })

  test('quita la última foto: deja image_path null', async () => {
    listResult.data = [img('a', 0, 'a.jpg')]
    await removeMomentImage('c1', 'a')
    expect(calls.mirror).toHaveBeenCalledWith({ patch: { image_path: null }, id: 'c1' })
  })

  test('quita una NO-portada: no re-espeja', async () => {
    listResult.data = [img('a', 0), img('b', 1)]
    await removeMomentImage('c1', 'b')
    expect(calls.delete).toHaveBeenCalledWith('b')
    expect(calls.mirror).not.toHaveBeenCalled()
  })

  test('la portada es la de menor sort_order, no la posición [0] de la lista', async () => {
    // Lista ordenada por sort_at: 'b' primero, pero la portada real es 'a' (sort_order 0).
    listResult.data = [img('b', 1, 'b.jpg'), img('a', 0, 'a.jpg')]
    await removeMomentImage('c1', 'b')
    expect(calls.delete).toHaveBeenCalledWith('b')
    // 'b' no era la portada (aunque fuera la [0] de la lista): no re-espeja.
    expect(calls.mirror).not.toHaveBeenCalled()
  })

  test('quita la portada aunque no esté en la posición [0]: re-espeja la siguiente', async () => {
    listResult.data = [img('b', 1, 'b.jpg'), img('a', 0, 'a.jpg')]
    await removeMomentImage('c1', 'a')
    expect(calls.delete).toHaveBeenCalledWith('a')
    expect(calls.mirror).toHaveBeenCalledWith({ patch: { image_path: 'b.jpg' }, id: 'c1' })
  })
})
