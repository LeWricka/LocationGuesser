import { describe, test, expect } from 'vitest'
import { isValidLatLng } from './useWorldTrips'

// Guardarraíl de coordenadas: `isValidLatLng` protege la pipeline de pins del globo
// de la home contra pares lat/lng que estén fuera de rango (p.ej. intercambiados).
// Si lat=135 (debería ser lng) llega a `setLngLat([pin.lng, pin.lat])`, MapLibre lo
// interpreta como longitud=135 → el pin aparece en el océano Índico, no en su sitio.
// La guarda descarta ese punto sin reventar el mapa.

describe('isValidLatLng — guarda de rangos de coordenadas', () => {
  test('acepta coords reales: París, Tokio, Melbourne', () => {
    expect(isValidLatLng(48.8566, 2.3522)).toBe(true) // París
    expect(isValidLatLng(35.6762, 139.6503)).toBe(true) // Tokio
    expect(isValidLatLng(-37.8136, 144.9631)).toBe(true) // Melbourne
  })

  test('acepta los extremos exactos de los rangos', () => {
    expect(isValidLatLng(90, 180)).toBe(true)
    expect(isValidLatLng(-90, -180)).toBe(true)
    expect(isValidLatLng(0, 0)).toBe(true)
  })

  test('RECHAZA lat fuera de [−90, 90] — síntoma claro de swap lat↔lng', () => {
    // Si lat=135.7 y lng=35.0 (Tokio intercambiado), lat está fuera de rango → descartado.
    // Sin esta guarda, setLngLat([35.0, 135.7]) sería correcto, pero si el swap va al revés
    // (lat=135.7 lng=35.0 pasado a setLngLat([35.0, 135.7])) el pin caería bien — la guarda
    // evita el caso opuesto (lat=135.7 pasado como latitud → posición errónea).
    expect(isValidLatLng(135.7, 35.0)).toBe(false) // lat>90: Tokio intercambiado
    expect(isValidLatLng(-91, 10)).toBe(false)
    expect(isValidLatLng(91, 10)).toBe(false)
  })

  test('RECHAZA lng fuera de [−180, 180]', () => {
    expect(isValidLatLng(35.0, 181)).toBe(false)
    expect(isValidLatLng(35.0, -181)).toBe(false)
  })

  test('RECHAZA NaN e Infinity (corrupción de datos)', () => {
    expect(isValidLatLng(NaN, 2.35)).toBe(false)
    expect(isValidLatLng(48.85, NaN)).toBe(false)
    expect(isValidLatLng(Infinity, 2.35)).toBe(false)
    expect(isValidLatLng(48.85, Infinity)).toBe(false)
  })
})
