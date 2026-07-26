import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { MomentImage } from './momentImages'

// Builder encadenable por tabla. `moment_images` resuelve su listado (con order)
// desde `listResult`; capturamos inserts/updates/deletes y los espejos a
// `challenges.image_path` para verificar la lógica de portada.
const listResult: { data: MomentImage[]; error: unknown } = { data: [], error: null }
// Fila de `challenges` (flag de orden manual + portada) que devuelve el mock
// al consultarla (`getMomentGalleryMeta`/`getPhotosManualOrder`/
// `listMomentImages`/`setMomentCover`/`removeMomentImage`). Default: orden
// por fecha (#951) y sin portada.
const challengeMetaResult: {
  data: { photos_manual_order: boolean; image_path: string | null } | null
  error: unknown
} = {
  data: { photos_manual_order: false, image_path: null },
  error: null,
}
// Columna/orden con que `listMomentImages` consultó `moment_images.order(...)`
// en la última llamada — verifica que respeta el flag (sort_order vs sort_at).
const orderCalls: { column: string; ascending: boolean }[] = []
const calls = {
  insert: vi.fn(),
  delete: vi.fn(),
  // Updates de challenges (espejo de portada + flag de orden manual): [{ patch, id }]
  mirror: vi.fn(),
  // Updates de moment_images (reordenar): [{ id, patch }]
  reorder: vi.fn(),
}

function momentImagesBuilder() {
  const builder: Record<string, unknown> = {}
  builder.select = () => builder
  builder.eq = () => builder
  builder.in = () => builder
  builder.order = (column: string, opts: { ascending: boolean }) => {
    orderCalls.push({ column, ascending: opts.ascending })
    return Promise.resolve(listResult)
  }
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
  // `getMomentGalleryMeta`: select('photos_manual_order, image_path').eq('id', id).single()
  builder.select = () => ({
    eq: () => ({
      single: () => Promise.resolve(challengeMetaResult),
    }),
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
  getMomentGalleryMeta,
  getPhotosManualOrder,
  listGroupMomentImages,
  listMomentImages,
  removeMomentImage,
  reorderMomentImages,
  setMomentCover,
  setPhotosAutoOrder,
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
  challengeMetaResult.data = { photos_manual_order: false, image_path: null }
  challengeMetaResult.error = null
  orderCalls.length = 0
})

describe('listMomentImages', () => {
  test('devuelve las filas tal cual (ya ordenadas por la query)', async () => {
    listResult.data = [img('a', 0), img('b', 1)]
    const out = await listMomentImages('c1')
    expect(out.map((i) => i.id)).toEqual(['a', 'b'])
  })

  test('orden AUTO (flag false, #951): consulta ordenada por sort_at', async () => {
    challengeMetaResult.data = { photos_manual_order: false, image_path: null }
    listResult.data = [img('a', 0), img('b', 1)]
    await listMomentImages('c1')
    expect(orderCalls.at(-1)).toEqual({ column: 'sort_at', ascending: true })
  })

  test('orden MANUAL (flag true, #952): consulta ordenada por sort_order', async () => {
    challengeMetaResult.data = { photos_manual_order: true, image_path: null }
    listResult.data = [img('a', 0), img('b', 1)]
    await listMomentImages('c1')
    expect(orderCalls.at(-1)).toEqual({ column: 'sort_order', ascending: true })
  })
})

describe('getPhotosManualOrder', () => {
  test('devuelve el flag de challenges.photos_manual_order', async () => {
    challengeMetaResult.data = { photos_manual_order: true, image_path: null }
    expect(await getPhotosManualOrder('c1')).toBe(true)
  })

  test('sin dato: por defecto false (orden por fecha)', async () => {
    challengeMetaResult.data = null
    expect(await getPhotosManualOrder('c1')).toBe(false)
  })
})

describe('getMomentGalleryMeta', () => {
  test('devuelve el flag de orden manual y el path de portada de challenges', async () => {
    challengeMetaResult.data = { photos_manual_order: true, image_path: 'a.jpg' }
    expect(await getMomentGalleryMeta('c1')).toEqual({ manualOrder: true, coverPath: 'a.jpg' })
  })

  test('sin dato: manualOrder false y coverPath null', async () => {
    challengeMetaResult.data = null
    expect(await getMomentGalleryMeta('c1')).toEqual({ manualOrder: false, coverPath: null })
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

describe('setMomentCover (#954: SIN reordenar — la portada es solo challenges.image_path)', () => {
  test('fija image_path a la foto elegida, SIN tocar sort_order de nadie', async () => {
    listResult.data = [img('a', 0, 'a.jpg'), img('b', 1, 'b.jpg'), img('c', 2, 'c.jpg')]
    challengeMetaResult.data = { photos_manual_order: false, image_path: 'a.jpg' }
    await setMomentCover('c1', 'c')
    expect(calls.reorder).not.toHaveBeenCalled()
    expect(calls.mirror).toHaveBeenCalledWith({ patch: { image_path: 'c.jpg' }, id: 'c1' })
  })

  test('la portada actual se determina por image_path, no por sort_order ni posición', async () => {
    // Lista ordenada por sort_at: 'b' va primero, pero la portada real (por
    // challenges.image_path) es 'a'. Elegir 'b' como nueva portada solo espeja
    // su path, no reordena nada.
    listResult.data = [img('b', 1, 'b.jpg'), img('a', 0, 'a.jpg')]
    challengeMetaResult.data = { photos_manual_order: false, image_path: 'a.jpg' }
    await setMomentCover('c1', 'b')
    expect(calls.reorder).not.toHaveBeenCalled()
    expect(calls.mirror).toHaveBeenCalledWith({ patch: { image_path: 'b.jpg' }, id: 'c1' })
  })

  test('si ya es la portada (mismo image_path), no toca nada', async () => {
    listResult.data = [img('a', 0, 'a.jpg'), img('b', 1, 'b.jpg')]
    challengeMetaResult.data = { photos_manual_order: false, image_path: 'a.jpg' }
    await setMomentCover('c1', 'a')
    expect(calls.reorder).not.toHaveBeenCalled()
    expect(calls.mirror).not.toHaveBeenCalled()
  })
})

describe('removeMomentImage (#954: portada por image_path, no por sort_order)', () => {
  test('quita la portada (coincide con challenges.image_path): re-espeja la primera restante', async () => {
    listResult.data = [img('a', 0, 'a.jpg'), img('b', 1, 'b.jpg')]
    challengeMetaResult.data = { photos_manual_order: false, image_path: 'a.jpg' }
    await removeMomentImage('c1', 'a')
    expect(calls.delete).toHaveBeenCalledWith('a')
    expect(calls.mirror).toHaveBeenCalledWith({ patch: { image_path: 'b.jpg' }, id: 'c1' })
  })

  test('quita la última foto: deja image_path null', async () => {
    listResult.data = [img('a', 0, 'a.jpg')]
    challengeMetaResult.data = { photos_manual_order: false, image_path: 'a.jpg' }
    await removeMomentImage('c1', 'a')
    expect(calls.mirror).toHaveBeenCalledWith({ patch: { image_path: null }, id: 'c1' })
  })

  test('quita una NO-portada: no re-espeja', async () => {
    listResult.data = [img('a', 0, 'a.jpg'), img('b', 1, 'b.jpg')]
    challengeMetaResult.data = { photos_manual_order: false, image_path: 'a.jpg' }
    await removeMomentImage('c1', 'b')
    expect(calls.delete).toHaveBeenCalledWith('b')
    expect(calls.mirror).not.toHaveBeenCalled()
  })

  test('la portada se determina por image_path, no por sort_order ni posición [0] de la lista', async () => {
    // Lista ordenada por sort_at: 'b' primero (y sort_order mayor), pero la
    // portada real (por challenges.image_path) es 'a'.
    listResult.data = [img('b', 1, 'b.jpg'), img('a', 0, 'a.jpg')]
    challengeMetaResult.data = { photos_manual_order: false, image_path: 'a.jpg' }
    await removeMomentImage('c1', 'b')
    expect(calls.delete).toHaveBeenCalledWith('b')
    // 'b' no era la portada real (aunque fuera la [0] de la lista): no re-espeja.
    expect(calls.mirror).not.toHaveBeenCalled()
  })

  test('quita la portada real aunque no esté en la posición [0]: re-espeja la primera restante EN ORDEN DE VISUALIZACIÓN', async () => {
    listResult.data = [img('b', 1, 'b.jpg'), img('a', 0, 'a.jpg')]
    challengeMetaResult.data = { photos_manual_order: false, image_path: 'a.jpg' }
    await removeMomentImage('c1', 'a')
    expect(calls.delete).toHaveBeenCalledWith('a')
    // Queda solo 'b' (única restante, primera en orden de visualización).
    expect(calls.mirror).toHaveBeenCalledWith({ patch: { image_path: 'b.jpg' }, id: 'c1' })
  })
})

describe('reorderMomentImages', () => {
  test('reasigna sort_order 0..N-1 según el nuevo orden (arrastrar y soltar)', async () => {
    listResult.data = [img('a', 0, 'a.jpg'), img('b', 1, 'b.jpg'), img('c', 2, 'c.jpg')]
    await reorderMomentImages('c1', ['c', 'a', 'b'])
    expect(calls.reorder).toHaveBeenCalledWith({ id: 'c', patch: { sort_order: 0 } })
    expect(calls.reorder).toHaveBeenCalledWith({ id: 'a', patch: { sort_order: 1 } })
    expect(calls.reorder).toHaveBeenCalledWith({ id: 'b', patch: { sort_order: 2 } })
    expect(calls.reorder).toHaveBeenCalledTimes(3)
  })

  test('activa el orden manual en challenges.photos_manual_order', async () => {
    listResult.data = [img('a', 0, 'a.jpg'), img('b', 1, 'b.jpg')]
    await reorderMomentImages('c1', ['b', 'a'])
    expect(calls.mirror).toHaveBeenCalledWith({
      patch: { photos_manual_order: true },
      id: 'c1',
    })
  })

  test('NO toca challenges.image_path: reordenar no debe cambiar la portada (issue #954)', async () => {
    listResult.data = [img('a', 0, 'a.jpg'), img('b', 1, 'b.jpg'), img('c', 2, 'c.jpg')]
    await reorderMomentImages('c1', ['c', 'a', 'b'])
    expect(calls.mirror).not.toHaveBeenCalledWith(
      expect.objectContaining({
        patch: expect.objectContaining({ image_path: expect.anything() }),
      }),
    )
    // El único update a `challenges` es el flag de orden manual.
    expect(calls.mirror).toHaveBeenCalledTimes(1)
    expect(calls.mirror).toHaveBeenCalledWith({
      patch: { photos_manual_order: true },
      id: 'c1',
    })
  })

  test('lista vacía: no hace nada', async () => {
    await reorderMomentImages('c1', [])
    expect(calls.reorder).not.toHaveBeenCalled()
    expect(calls.mirror).not.toHaveBeenCalled()
  })
})

describe('setPhotosAutoOrder', () => {
  test('apaga el flag de orden manual (vuelve a orden por fecha)', async () => {
    await setPhotosAutoOrder('c1')
    expect(calls.mirror).toHaveBeenCalledWith({
      patch: { photos_manual_order: false },
      id: 'c1',
    })
  })
})
