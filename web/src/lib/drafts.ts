import { useEffect, useRef } from 'react'
import { reportError } from './observability'

// BORRADORES PERSISTENTES — issue #718. Reporte del dueño: creando un recuerdo
// con fotos/clip/descripción, sale a mirar una notificación y al volver todo
// está perdido. Nuestras recargas CONTROLADAS ya respetan los formularios
// (`safeUpdateRoute.ts`, #647/#683); lo que se lleva por delante el formulario
// es, casi seguro, el DESCARTE DE PESTAÑA de Android (Chrome mata pestañas
// pesadas al cambiar de app; al volver, recarga de cero) — inevitable desde la
// web. La única defensa real es un borrador que sobreviva a esa recarga.
//
// `localStorage` NO vale: las fotos/clips de un recuerdo son `Blob`/`File` de
// varios MB, y `localStorage` solo guarda strings (y tiene un tope de unos
// 5MB). IndexedDB sí guarda Blobs nativos (structured clone) sin serializar a
// base64, así que es la única opción razonable sin traer una librería.
//
// API deliberadamente mínima (clave→valor, sin índices ni cursores): cada
// formulario largo (AddMoment, CreateGroup, CreateLocationChallenge,
// CreateNumberChallenge) tiene una clave propia (p.ej. `moment:<groupId>`) y
// guarda ahí una foto fiel de su estado — el propio formulario decide qué
// forma tiene esa foto y cómo reconstruir previews/Files al restaurar.
//
// Best-effort en TODO: un fallo de IndexedDB (privado/incógnito con cuota 0,
// modo estricto de Safari, lo que sea) nunca debe romper el formulario — solo
// se pierde el autosave, que es exactamente el estado de partida sin esta lib.

const DB_NAME = 'lg-drafts'
const DB_VERSION = 1
const STORE_NAME = 'drafts'

/** Los drafts más viejos que esto se ignoran y se limpian solos (issue #718). */
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/** Debounce por defecto del autosave: ~800ms tras el último cambio (issue #718). */
export const DRAFT_AUTOSAVE_DELAY_MS = 800

interface StoredDraft<T> {
  data: T
  savedAt: number
}

/**
 * Forma serializada de un `File`/`Blob` para meter en un draft (fotos, el
 * fotograma-portada de un clip, el propio clip, la nota de voz…).
 *
 * NO guardamos el `File`/`Blob` tal cual: aunque el estándar de IndexedDB
 * permite clonarlos de forma nativa (structured clone), el soporte real ha
 * sido históricamente desigual entre navegadores (Safari < 14 lanzaba
 * `DataCloneError` al intentarlo) y no es algo que podamos verificar en tests
 * (jsdom no clona Blobs de verdad — jsdom#3363). Serializar a mano a
 * `ArrayBuffer` + metadatos es robusto en CUALQUIER entorno que soporte
 * IndexedDB, incluida esta suite de tests, así que es la opción fiable.
 */
export interface SerializedBlob {
  type: string
  buffer: ArrayBuffer
}

/** Igual que `SerializedBlob`, pero de un `File` (conserva nombre y fecha). */
export interface SerializedFile extends SerializedBlob {
  name: string
  lastModified: number
}

/** Serializa un `File` a una forma segura de meter en IndexedDB. */
export async function serializeFile(file: File): Promise<SerializedFile> {
  return {
    name: file.name,
    type: file.type,
    lastModified: file.lastModified,
    buffer: await file.arrayBuffer(),
  }
}

/** Reconstruye el `File` original a partir de su forma serializada. */
export function deserializeFile(serialized: SerializedFile): File {
  return new File([serialized.buffer], serialized.name, {
    type: serialized.type,
    lastModified: serialized.lastModified,
  })
}

/** Serializa un `Blob` suelto (p.ej. una nota de voz, sin nombre de fichero). */
export async function serializeBlob(blob: Blob): Promise<SerializedBlob> {
  return { type: blob.type, buffer: await blob.arrayBuffer() }
}

/** Reconstruye el `Blob` original a partir de su forma serializada. */
export function deserializeBlob(serialized: SerializedBlob): Blob {
  return new Blob([serialized.buffer], { type: serialized.type })
}

// Abre (o crea) la base de datos. Se abre y cierra en cada operación en vez de
// mantener una conexión viva: el volumen de escrituras es bajo (un draft
// debounced cada ~800ms mientras se edita un formulario), así que no
// compensa la complejidad de cachear la conexión y gestionar su cierre.
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible en este entorno'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('No se pudo abrir IndexedDB'))
  })
}

/**
 * Guarda (o sobrescribe) el borrador de `key`. BEST-EFFORT: cualquier fallo
 * (cuota agotada, IndexedDB deshabilitado…) se reporta y se traga — nunca
 * lanza, para no romper el formulario que llama a esto en cada autosave.
 */
export async function saveDraft<T>(key: string, data: T): Promise<void> {
  try {
    const db = await openDb()
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const stored: StoredDraft<T> = { data, savedAt: Date.now() }
        tx.objectStore(STORE_NAME).put(stored, key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error('No se pudo guardar el borrador'))
      })
    } finally {
      db.close()
    }
  } catch (err) {
    reportError(err, { area: 'drafts', stage: 'save', key })
  }
}

/**
 * Carga el borrador de `key`, o `null` si no hay, falló la lectura, o caducó
 * (>7 días, issue #718 — un borrador de un viaje de hace meses no vale la
 * pena resucitarlo, y menos con fotos que ya no representan el intento
 * actual). Un borrador caducado se limpia solo, best-effort.
 */
export async function loadDraft<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb()
    let stored: StoredDraft<T> | undefined
    try {
      stored = await new Promise<StoredDraft<T> | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const req = tx.objectStore(STORE_NAME).get(key)
        req.onsuccess = () => resolve(req.result as StoredDraft<T> | undefined)
        req.onerror = () => reject(req.error ?? new Error('No se pudo leer el borrador'))
      })
    } finally {
      db.close()
    }
    if (!stored) return null
    if (Date.now() - stored.savedAt > DRAFT_MAX_AGE_MS) {
      void clearDraft(key)
      return null
    }
    return stored.data
  } catch (err) {
    reportError(err, { area: 'drafts', stage: 'load', key })
    return null
  }
}

/**
 * Borra el borrador de `key` (al guardar con éxito, o al descartarlo a mano
 * desde el toast de restauración). Best-effort, igual que el resto.
 */
export async function clearDraft(key: string): Promise<void> {
  try {
    const db = await openDb()
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).delete(key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error('No se pudo borrar el borrador'))
      })
    } finally {
      db.close()
    }
  } catch (err) {
    reportError(err, { area: 'drafts', stage: 'clear', key })
  }
}

/**
 * Autosave debounced de un formulario largo (issue #718): cada vez que
 * `snapshot` cambia de referencia, arma un temporizador de `delay`ms; si no
 * hay un cambio nuevo antes de que cumpla, guarda. Debounced en vez de en
 * cada tecla: escribir una descripción larga no debe golpear IndexedDB en
 * cada pulsación.
 *
 * `enabled=false` desarma el autosave por completo (ni arranca temporizadores
 * ni guarda): imprescindible mientras el formulario está RESTAURANDO su
 * borrador al montar — si no, el primer render (con el estado inicial vacío)
 * dispararía un guardado que pisaría el borrador real antes de leerlo.
 */
export function useDraftAutosave<T>(
  key: string | null,
  snapshot: T,
  enabled: boolean,
  delay: number = DRAFT_AUTOSAVE_DELAY_MS,
): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled || !key) return
    timerRef.current = setTimeout(() => {
      void saveDraft(key, snapshot)
    }, delay)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [key, snapshot, enabled, delay])
}
