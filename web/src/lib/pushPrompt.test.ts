import { describe, test, expect, beforeEach } from 'vitest'
import {
  isPushPromptSnoozed,
  snoozePushPrompt,
  shouldShowPushPrompt,
  type PushPromptGate,
} from './pushPrompt'

function idealGate(overrides: Partial<PushPromptGate> = {}): PushPromptGate {
  return {
    configured: true,
    capable: true,
    permission: 'default',
    subscribed: false,
    loading: false,
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('shouldShowPushPrompt', () => {
  test('se muestra con el gate ideal: configurado, capaz, permiso default, sin suscripción, sin snooze', () => {
    expect(shouldShowPushPrompt(idealGate())).toBe(true)
  })

  test('no se muestra mientras se resuelve el estado inicial', () => {
    expect(shouldShowPushPrompt(idealGate({ loading: true }))).toBe(false)
  })

  test('no se muestra sin VAPID configurada', () => {
    expect(shouldShowPushPrompt(idealGate({ configured: false }))).toBe(false)
  })

  test('no se muestra si el navegador no es capaz (p.ej. iOS Safari sin instalar)', () => {
    expect(shouldShowPushPrompt(idealGate({ capable: false }))).toBe(false)
  })

  test('no se muestra con el permiso ya concedido (ya está activo)', () => {
    expect(shouldShowPushPrompt(idealGate({ permission: 'granted' }))).toBe(false)
  })

  test('no se muestra con el permiso ya denegado (reofrecerlo sería insistir)', () => {
    expect(shouldShowPushPrompt(idealGate({ permission: 'denied' }))).toBe(false)
  })

  test('no se muestra con una suscripción activa en este dispositivo', () => {
    expect(shouldShowPushPrompt(idealGate({ subscribed: true }))).toBe(false)
  })

  test('no se muestra si está en snooze', () => {
    snoozePushPrompt()
    expect(shouldShowPushPrompt(idealGate())).toBe(false)
  })
})

describe('snooze', () => {
  test('sin snooze previo, no está snoozeado', () => {
    expect(isPushPromptSnoozed()).toBe(false)
  })

  test('snoozePushPrompt bloquea durante los días pedidos y no más', () => {
    const now = Date.now()
    snoozePushPrompt(7, now)
    expect(isPushPromptSnoozed(now + 6 * 24 * 60 * 60 * 1000)).toBe(true)
    expect(isPushPromptSnoozed(now + 8 * 24 * 60 * 60 * 1000)).toBe(false)
  })

  test('respeta un número de días distinto (p.ej. 1)', () => {
    const now = Date.now()
    snoozePushPrompt(1, now)
    expect(isPushPromptSnoozed(now + 12 * 60 * 60 * 1000)).toBe(true)
    expect(isPushPromptSnoozed(now + 25 * 60 * 60 * 1000)).toBe(false)
  })
})
