import { describe, test, expect } from 'vitest'
import { isMomentPhotoVisible } from './trip'
import type { Moment } from './trip'

type MomentInput = Pick<Moment, 'isChallenge' | 'status' | 'photoIsHint'>

function m(over: Partial<MomentInput>): MomentInput {
  return { isChallenge: true, status: 'active', photoIsHint: true, ...over }
}

describe('isMomentPhotoVisible (issue #645, anti-spoiler de la pestaña Fotos)', () => {
  test('un recuerdo siempre es visible (nunca es spoiler)', () => {
    expect(
      isMomentPhotoVisible(m({ isChallenge: false, status: 'recuerdo', photoIsHint: false })),
    ).toBe(true)
  })

  test('un reto EN JUEGO con foto sorpresa (photoIsHint: false) se OCULTA', () => {
    expect(isMomentPhotoVisible(m({ status: 'active', photoIsHint: false }))).toBe(false)
  })

  test('un reto de PRÁCTICA con foto sorpresa también se oculta (nunca cierra)', () => {
    expect(isMomentPhotoVisible(m({ status: 'practice', photoIsHint: false }))).toBe(false)
  })

  test('un reto EN JUEGO con foto pista (photoIsHint: true) es visible', () => {
    expect(isMomentPhotoVisible(m({ status: 'active', photoIsHint: true }))).toBe(true)
  })

  test('un reto CERRADO siempre es visible, aunque su foto fuera sorpresa', () => {
    expect(isMomentPhotoVisible(m({ status: 'closed', photoIsHint: false }))).toBe(true)
  })
})
