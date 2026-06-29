import { describe, test, expect } from 'vitest'
import { buildResultShareText } from './shareResult'

// Caption al compartir TU resultado. Una sola línea: gancho + enlace. Es el único
// texto que sale del usuario, así que aquí blindamos el NO-SPOILER: nada que
// delate la ubicación (coordenadas, "km", "puntos", nombre de lugar, mapa).
describe('buildResultShareText', () => {
  const link = 'https://app/#g=ABC&c=42'

  test('una sola línea: gancho con el grupo + enlace', () => {
    const text = buildResultShareText('Viaje a Italia', link)
    expect(text).toBe('📍 Vive este viaje conmigo en Viaje a Italia 👉 https://app/#g=ABC&c=42')
  })

  test('no filtra el rendimiento ni la ubicación en el texto', () => {
    const text = buildResultShareText('G', link)
    expect(text).not.toContain('\n')
    // El caption no revela datos: ni puntos, ni distancia, ni coordenadas.
    expect(text.toLowerCase()).not.toContain('km')
    expect(text.toLowerCase()).not.toContain('punto')
    expect(text).not.toMatch(/-?\d+\.\d+/) // sin pares de coordenadas tipo 41.40
  })
})
