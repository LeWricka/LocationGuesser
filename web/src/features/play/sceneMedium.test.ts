import { describe, test, expect } from 'vitest'
import { sceneMedium } from './sceneMedium'

describe('sceneMedium', () => {
  test('usa Street View cuando hay sv_pano_id', () => {
    expect(sceneMedium({ sv_pano_id: 'abc123', image_path: null })).toBe('streetview')
  })

  test('Street View tiene prioridad sobre la foto (no spoilers)', () => {
    expect(sceneMedium({ sv_pano_id: 'abc123', image_path: 'fotos/x.jpg' })).toBe('streetview')
  })

  test('reto legacy sin SV pero con foto muestra la foto', () => {
    expect(sceneMedium({ sv_pano_id: null, image_path: 'fotos/x.jpg' })).toBe('photo')
  })

  test('sin SV ni foto no hay medio que mostrar', () => {
    expect(sceneMedium({ sv_pano_id: null, image_path: null })).toBe('none')
  })
})
