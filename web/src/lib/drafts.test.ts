import { describe, test, expect, beforeAll, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import {
  saveDraft,
  loadDraft,
  clearDraft,
  useDraftAutosave,
  serializeFile,
  deserializeFile,
  DRAFT_MAX_AGE_MS,
} from './drafts'

// Cada test usa una clave PROPIA (uuid) para no pisarse entre sí: la base de
// datos falsa (fake-indexeddb, instalada en `test/setup.ts`) vive en memoria
// para todo el proceso de test, no se resetea entre tests de este fichero.
function uniqueKey(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`
}

describe('drafts — saveDraft/loadDraft/clearDraft', () => {
  // jsdom no implementa createObjectURL/revokeObjectURL (mismo mock que
  // AddMoment.test.tsx/VoiceRecorder.test.tsx).
  beforeAll(() => {
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() })
  })

  test('loadDraft de una clave sin guardar devuelve null', async () => {
    expect(await loadDraft(uniqueKey('nope'))).toBeNull()
  })

  test('guarda y recupera un borrador simple', async () => {
    const key = uniqueKey('moment')
    await saveDraft(key, { title: 'Atardecer', description: 'En Santorini' })
    const loaded = await loadDraft<{ title: string; description: string }>(key)
    expect(loaded).toEqual({ title: 'Atardecer', description: 'En Santorini' })
  })

  test('sobrescribe un borrador ya existente con la misma clave', async () => {
    const key = uniqueKey('moment')
    await saveDraft(key, { title: 'Primero' })
    await saveDraft(key, { title: 'Segundo' })
    const loaded = await loadDraft<{ title: string }>(key)
    expect(loaded).toEqual({ title: 'Segundo' })
  })

  test('clearDraft borra el borrador: loadDraft vuelve a devolver null', async () => {
    const key = uniqueKey('moment')
    await saveDraft(key, { title: 'A borrar' })
    expect(await loadDraft(key)).not.toBeNull()
    await clearDraft(key)
    expect(await loadDraft(key)).toBeNull()
  })

  test('clearDraft de una clave inexistente no lanza (best-effort)', async () => {
    await expect(clearDraft(uniqueKey('nunca-existio'))).resolves.toBeUndefined()
  })

  // El caso estrella (issue #718): un draft con 2 fotos (Blob/File reales) —
  // no solo texto — se guarda y se restaura íntegro. `serializeFile` convierte
  // cada `File` a `{ name, type, lastModified, buffer }` antes de guardar
  // (ver comentario de `SerializedFile` en drafts.ts): así el roundtrip es
  // fiable en cualquier entorno, sin depender del soporte nativo de Blobs de
  // IndexedDB de cada navegador.
  test('un borrador con 2 fotos se restaura con los Files reconstruidos (previews incluidos)', async () => {
    const key = uniqueKey('moment-photos')
    const photoA = new File(['contenido-a'], 'playa.jpg', { type: 'image/jpeg' })
    const photoB = new File(['contenido-b'], 'atardecer.jpg', { type: 'image/jpeg' })
    await saveDraft(key, {
      title: 'Día de playa',
      photos: [
        { id: '1', file: await serializeFile(photoA) },
        { id: '2', file: await serializeFile(photoB) },
      ],
    })

    const loaded = await loadDraft<{
      title: string
      photos: { id: string; file: Awaited<ReturnType<typeof serializeFile>> }[]
    }>(key)

    expect(loaded?.title).toBe('Día de playa')
    expect(loaded?.photos).toHaveLength(2)

    // Reconstrucción igual que hace el picker: `deserializeFile` + un preview
    // (`URL.createObjectURL`) por cada foto.
    const restoredFiles = loaded!.photos.map((p) => deserializeFile(p.file))
    const previews = restoredFiles.map((f) => URL.createObjectURL(f))

    expect(restoredFiles[0].name).toBe('playa.jpg')
    expect(restoredFiles[0].type).toBe('image/jpeg')
    expect(await restoredFiles[0].text()).toBe('contenido-a')
    expect(await restoredFiles[1].text()).toBe('contenido-b')
    expect(previews[0]).toMatch(/^blob:/)
    expect(previews[1]).toMatch(/^blob:/)
    previews.forEach((p) => URL.revokeObjectURL(p))
  })

  test('un borrador caducado (>7 días) se ignora y se limpia solo', async () => {
    const key = uniqueKey('moment-viejo')
    const realNow = Date.now
    // Guardamos "hace 8 días": movemos el reloj hacia atrás solo para el save.
    Date.now = () => realNow() - (DRAFT_MAX_AGE_MS + 24 * 60 * 60 * 1000)
    await saveDraft(key, { title: 'Viejo' })
    Date.now = realNow

    expect(await loadDraft(key)).toBeNull()
    // Se limpió solo: una segunda lectura tampoco encuentra nada que borrar de más.
    await expect(clearDraft(key)).resolves.toBeUndefined()
  })

  test('un borrador reciente (<7 días) sí se restaura', async () => {
    const key = uniqueKey('moment-reciente')
    const realNow = Date.now
    Date.now = () => realNow() - (DRAFT_MAX_AGE_MS - 60_000)
    await saveDraft(key, { title: 'Reciente' })
    Date.now = realNow

    expect(await loadDraft<{ title: string }>(key)).toEqual({ title: 'Reciente' })
  })

  test('saveDraft es best-effort: un IndexedDB roto no lanza', async () => {
    const original = globalThis.indexedDB
    // @ts-expect-error -- simulamos un entorno sin IndexedDB (privado/incógnito).
    delete globalThis.indexedDB
    await expect(saveDraft(uniqueKey('roto'), { x: 1 })).resolves.toBeUndefined()
    globalThis.indexedDB = original
  })

  test('loadDraft es best-effort: sin IndexedDB devuelve null en vez de lanzar', async () => {
    const original = globalThis.indexedDB
    // @ts-expect-error -- simulamos un entorno sin IndexedDB.
    delete globalThis.indexedDB
    await expect(loadDraft(uniqueKey('roto'))).resolves.toBeNull()
    globalThis.indexedDB = original
  })
})

describe('useDraftAutosave', () => {
  // Timers REALES con un delay corto (no los 800ms de producción): con timers
  // falsos, avanzar el reloj no hace avanzar las operaciones async de
  // IndexedDB (abren su propia cola de tareas), así que la combinación
  // `vi.useFakeTimers()` + fake-indexeddb se queda colgada sin resolver nunca.
  // Timers reales + un delay de unos ms de la vida real son fiables y rápidos.
  const TEST_DELAY = 30

  test('debounced: guarda tras el último cambio, no en cada cambio', async () => {
    const key = uniqueKey('autosave')
    const { rerender } = renderHook(
      ({ snapshot, enabled }: { snapshot: { title: string }; enabled: boolean }) =>
        useDraftAutosave(key, snapshot, enabled, TEST_DELAY),
      { initialProps: { snapshot: { title: 'a' }, enabled: true } },
    )

    rerender({ snapshot: { title: 'ab' }, enabled: true })
    rerender({ snapshot: { title: 'abc' }, enabled: true })

    // Antes de cumplirse el debounce, nada persistido todavía.
    expect(await loadDraft(key)).toBeNull()

    // Tras el debounce completo desde el ÚLTIMO cambio, se guarda el valor final.
    await waitFor(async () => {
      expect(await loadDraft<{ title: string }>(key)).toEqual({ title: 'abc' })
    })
  })

  test('enabled=false no guarda nada (usado mientras se restaura al montar)', async () => {
    const key = uniqueKey('autosave-disabled')
    renderHook(() => useDraftAutosave(key, { title: 'no debería guardarse' }, false, TEST_DELAY))

    await new Promise((r) => setTimeout(r, TEST_DELAY * 4))
    expect(await loadDraft(key)).toBeNull()
  })

  test('key=null no guarda nada (formulario sin contexto aún, p.ej. sin groupId)', async () => {
    const { rerender } = renderHook(
      ({ key }: { key: string | null }) => useDraftAutosave(key, { title: 'x' }, true, TEST_DELAY),
      { initialProps: { key: null as string | null } },
    )
    await new Promise((r) => setTimeout(r, TEST_DELAY * 4))
    // No hay clave con la que comprobar loadDraft: solo verificamos que no
    // revienta y que, al darle una clave real, SÍ empieza a guardar.
    const key = uniqueKey('autosave-key-llega-tarde')
    rerender({ key })
    await waitFor(async () => {
      expect(await loadDraft<{ title: string }>(key)).toEqual({ title: 'x' })
    })
  })
})
