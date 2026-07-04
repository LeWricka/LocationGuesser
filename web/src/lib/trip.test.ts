import { describe, test, expect } from 'vitest'
import { isMomentPhotoVisible, parseLegacyDescription, resolveMomentPhoto } from './trip'
import type { Moment } from './trip'

type MomentInput = Pick<Moment, 'isChallenge' | 'status' | 'photoIsHint'>

function m(over: Partial<MomentInput>): MomentInput {
  return { isChallenge: true, status: 'active', photoIsHint: true, ...over }
}

type PhotoInput = Pick<Moment, 'isChallenge' | 'status' | 'photoIsHint' | 'isOwn' | 'imageUrl'>

function pm(over: Partial<PhotoInput>): PhotoInput {
  return {
    isChallenge: true,
    status: 'active',
    photoIsHint: false,
    isOwn: false,
    imageUrl: 'https://example.test/foto.jpg',
    ...over,
  }
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

describe('resolveMomentPhoto (issue #655, spoiler del carrusel/hoja/recap)', () => {
  test('sorpresa oculta para el NO-CREADOR de un reto EN JUEGO: sin foto, con sello', () => {
    expect(resolveMomentPhoto(pm({ status: 'active', photoIsHint: false, isOwn: false }))).toEqual({
      src: null,
      surprise: true,
    })
  })

  test('sorpresa oculta para el NO-CREADOR de un reto de PRÁCTICA (nunca cierra)', () => {
    expect(
      resolveMomentPhoto(pm({ status: 'practice', photoIsHint: false, isOwn: false })),
    ).toEqual({ src: null, surprise: true })
  })

  test('visible al CERRAR el reto: la foto se pinta y ya no lleva sello', () => {
    const src = 'https://example.test/foto.jpg'
    expect(
      resolveMomentPhoto(pm({ status: 'closed', photoIsHint: false, isOwn: false, imageUrl: src })),
    ).toEqual({ src, surprise: false })
  })

  test('el CREADOR SÍ ve su propia foto sorpresa en juego, pero con el sello', () => {
    const src = 'https://example.test/foto.jpg'
    expect(
      resolveMomentPhoto(pm({ status: 'active', photoIsHint: false, isOwn: true, imageUrl: src })),
    ).toEqual({ src, surprise: true })
  })

  test('foto PISTA (photoIsHint: true) siempre visible, sea o no el creador', () => {
    const src = 'https://example.test/foto.jpg'
    expect(
      resolveMomentPhoto(pm({ status: 'active', photoIsHint: true, isOwn: false, imageUrl: src })),
    ).toEqual({ src, surprise: false })
  })

  test('un RECUERDO nunca es spoiler, aunque `isOwn` sea false', () => {
    const src = 'https://example.test/foto.jpg'
    expect(
      resolveMomentPhoto(
        pm({ isChallenge: false, status: 'recuerdo', isOwn: false, imageUrl: src }),
      ),
    ).toEqual({ src, surprise: false })
  })
})

describe('parseLegacyDescription (issue #686, prefijo de fecha legado pre-0037)', () => {
  test('prefijo + cuerpo: separa la fecha (sin emoji) del texto', () => {
    expect(parseLegacyDescription('📅 17 de julio · Una barra de ocho asientos.')).toEqual({
      dateLabel: '17 de julio',
      text: 'Una barra de ocho asientos.',
    })
  })

  test('prefijo solo (sin cuerpo): dateLabel presente, text null', () => {
    expect(parseLegacyDescription('📅 1 de septiembre')).toEqual({
      dateLabel: '1 de septiembre',
      text: null,
    })
  })

  test('sin prefijo: dateLabel null, text es la descripción tal cual', () => {
    expect(parseLegacyDescription('Un día cualquiera sin fecha incrustada.')).toEqual({
      dateLabel: null,
      text: 'Un día cualquiera sin fecha incrustada.',
    })
  })

  test('descripción null: ambos campos null', () => {
    expect(parseLegacyDescription(null)).toEqual({ dateLabel: null, text: null })
  })

  test('cuerpo con varias líneas tras el separador se conserva completo', () => {
    expect(parseLegacyDescription('📅 3 de marzo · Primera línea.\nSegunda línea.')).toEqual({
      dateLabel: '3 de marzo',
      text: 'Primera línea.\nSegunda línea.',
    })
  })
})
