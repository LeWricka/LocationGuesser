import { describe, test, expect, vi } from 'vitest'

// El cliente de Supabase se mockea para que importar push.ts no toque red. No se
// usa en los tests de no-op (push está desactivado en MODE='test'), pero push.ts
// lo importa en la cabecera.
vi.mock('./supabase', () => ({ supabase: {} }))

import {
  isPushSupported,
  isPushConfigured,
  isBrowserPushCapable,
  getPermission,
  subscribeToPush,
  unsubscribeFromPush,
  urlBase64ToUint8Array,
} from './push'

describe('isPushSupported', () => {
  // En MODE='test' (vitest) el push está SIEMPRE desactivado: la app debe ir
  // exactamente igual que un navegador sin clave VAPID / sin soporte.
  test('no-op en tests: nunca soportado', () => {
    expect(isPushSupported()).toBe(false)
  })

  test('getPermission reporta unsupported cuando no hay soporte', () => {
    expect(getPermission()).toBe('unsupported')
  })

  // En tests, tanto la config (VAPID) como la capacidad del navegador son false:
  // así la UI no ofrece la opción ni intenta tocar APIs del navegador.
  test('isPushConfigured y isBrowserPushCapable son false en tests', () => {
    expect(isPushConfigured()).toBe(false)
    expect(isBrowserPushCapable()).toBe(false)
  })
})

describe('subscribe/unsubscribe sin soporte', () => {
  test("subscribeToPush devuelve 'unsupported' sin tocar APIs", async () => {
    await expect(subscribeToPush('u1')).resolves.toBe('unsupported')
  })

  test("unsubscribeFromPush devuelve 'unsupported' sin tocar APIs", async () => {
    await expect(unsubscribeFromPush('u1')).resolves.toBe('unsupported')
  })
})

describe('urlBase64ToUint8Array', () => {
  test('decodifica base64url y añade padding', () => {
    // 'hello' en base64 estándar es 'aGVsbG8='. La clave VAPID viene en base64url
    // (sin padding, con - y _). Comprobamos que reconstruye los bytes correctos.
    const out = urlBase64ToUint8Array('aGVsbG8')
    expect(Array.from(out)).toEqual([104, 101, 108, 108, 111]) // 'hello'
  })

  test('traduce los caracteres base64url (- _) a (+ /)', () => {
    // Bytes [251, 255] → base64 '+/8=' → base64url '-_8'. Verifica el reemplazo.
    const out = urlBase64ToUint8Array('-_8')
    expect(Array.from(out)).toEqual([251, 255])
  })

  test('devuelve un Uint8Array de la longitud esperada', () => {
    const out = urlBase64ToUint8Array('aGVsbG8')
    expect(out).toBeInstanceOf(Uint8Array)
    expect(out.length).toBe(5)
  })
})
