import { describe, expect, it } from 'vitest'
import type { RoutePoint } from '../../lib/trip'
import { drawnRouteCount } from './routeDraw'

function point(challengeId: string): RoutePoint {
  return { challengeId, lat: 0, lng: 0, title: challengeId, imageUrl: null, date: '2026-01-01' }
}

const route = [point('a'), point('b'), point('c'), point('d')]

describe('drawnRouteCount', () => {
  it('en reposo dibuja la ruta entera', () => {
    expect(drawnRouteCount(route, 'b', false)).toBe(route.length)
  })

  it('sin selección dibuja la ruta entera aunque esté en play', () => {
    expect(drawnRouteCount(route, null, true)).toBe(route.length)
  })

  it('en play dibuja hasta el seleccionado, inclusive', () => {
    expect(drawnRouteCount(route, 'a', true)).toBe(1)
    expect(drawnRouteCount(route, 'b', true)).toBe(2)
    expect(drawnRouteCount(route, 'd', true)).toBe(route.length)
  })

  it('si el seleccionado no está en la ruta (p.ej. el activo) no corta: la dibuja entera', () => {
    expect(drawnRouteCount(route, 'desconocido', true)).toBe(route.length)
  })

  it('ruta vacía → 0', () => {
    expect(drawnRouteCount([], 'a', true)).toBe(0)
  })
})
