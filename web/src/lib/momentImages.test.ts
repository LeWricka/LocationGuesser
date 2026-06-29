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
  listMomentImages,
  removeMomentImage,
  setMomentCover,
} from './momentImages'

function img(id: string, sort: number, path = `${id}.jpg`): MomentImage {
  return { id, challenge_id: 'c1', image_path: path, sort_order: sort, created_at: 'now' }
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

describe('addMomentImages', () => {
  test('galería vacía: inserta desde 0 y espeja la 1ª en challenges.image_path', async () => {
    listResult.data = []
    await addMomentImages('c1', ['x.jpg', 'y.jpg'])
    expect(calls.insert).toHaveBeenCalledWith([
      { challenge_id: 'c1', image_path: 'x.jpg', sort_order: 0 },
      { challenge_id: 'c1', image_path: 'y.jpg', sort_order: 1 },
    ])
    // Portada espejada (no había portada previa).
    expect(calls.mirror).toHaveBeenCalledWith({ patch: { image_path: 'x.jpg' }, id: 'c1' })
  })

  test('con galería previa: continúa el sort_order y NO re-espeja portada', async () => {
    listResult.data = [img('a', 0), img('b', 2)]
    await addMomentImages('c1', ['z.jpg'])
    expect(calls.insert).toHaveBeenCalledWith([
      { challenge_id: 'c1', image_path: 'z.jpg', sort_order: 3 },
    ])
    expect(calls.mirror).not.toHaveBeenCalled()
  })

  test('sin paths: no hace nada', async () => {
    await addMomentImages('c1', [])
    expect(calls.insert).not.toHaveBeenCalled()
  })
})

describe('setMomentCover', () => {
  test('mueve la elegida al frente y espeja su image_path', async () => {
    listResult.data = [img('a', 0, 'a.jpg'), img('b', 1, 'b.jpg'), img('c', 2, 'c.jpg')]
    await setMomentCover('c1', 'c')
    // 'c' pasa a sort_order 0; 'a'→1, 'b'→2. 'c' cambia (2→0), 'a' (0→1), 'b' (1→2).
    expect(calls.reorder).toHaveBeenCalledWith({ id: 'c', patch: { sort_order: 0 } })
    expect(calls.reorder).toHaveBeenCalledWith({ id: 'a', patch: { sort_order: 1 } })
    expect(calls.reorder).toHaveBeenCalledWith({ id: 'b', patch: { sort_order: 2 } })
    expect(calls.mirror).toHaveBeenCalledWith({ patch: { image_path: 'c.jpg' }, id: 'c1' })
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
})
