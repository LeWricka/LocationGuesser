import { describe, test, expect } from 'vitest'
import { HOME_DEMO_PINS } from './homeDemoPins'

// Guarda de regresión para el bug de #516 ("pines del globo en sitios imposibles"):
// se investigó a fondo y la causa NO era un swap lat/lng en estos datos (estaban
// bien desde el origen) sino culling/framing del globo (ver HomeGlobe.test.tsx). Aun
// así, esta constelación es la que alimenta la home de bienvenida Y la landing
// deslogueada, así que merece su propia guarda: si alguien reordena un día
// `{ lat, lng }` a `{ lng, lat }` al tocar este fichero, un test que solo comprobara
// rangos (`isValidLatLng`) NO lo detectaría en Europa —una longitud pequeña (p.ej.
// -9.14 de Lisboa) cabe perfectamente como latitud válida—. Por eso comparamos
// contra las coordenadas reales conocidas de cada ciudad, no solo contra el rango.
describe('HOME_DEMO_PINS — coordenadas geográficas', () => {
  const REAL_COORDS: Record<string, { lat: number; lng: number }> = {
    lisboa: { lat: 38.7223, lng: -9.1393 },
    tokio: { lat: 35.6762, lng: 139.6503 },
    'nueva-york': { lat: 40.7128, lng: -74.006 },
    sidney: { lat: -33.8688, lng: 151.2093 },
    'ciudad-del-cabo': { lat: -33.9249, lng: 18.4241 },
    roma: { lat: 41.9028, lng: 12.4964 },
  }

  test('cada pin coincide con la coordenada real de su ciudad (detecta un swap lat/lng)', () => {
    for (const pin of HOME_DEMO_PINS) {
      const real = REAL_COORDS[pin.id]
      expect(real, `sin coordenada de referencia para "${pin.id}"`).toBeDefined()
      expect(pin.lat).toBeCloseTo(real.lat, 1)
      expect(pin.lng).toBeCloseTo(real.lng, 1)
    }
  })

  test('el pin "lead" (más reciente) es único', () => {
    expect(HOME_DEMO_PINS.filter((p) => p.lead)).toHaveLength(1)
  })
})
