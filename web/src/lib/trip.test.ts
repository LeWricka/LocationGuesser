import { describe, test, expect } from 'vitest'
import {
  associatedChallengeIds,
  fuseMemoryWithChallenge,
  isMomentPhotoVisible,
  pairedChallengeByMemoryId,
  parseLegacyDescription,
  resolveMomentPhoto,
} from './trip'
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

type AssocInput = Pick<
  Moment,
  'challengeId' | 'isChallenge' | 'imagePath' | 'status' | 'photoIsHint'
>

function am(over: Partial<AssocInput> & Pick<AssocInput, 'challengeId'>): AssocInput {
  return {
    isChallenge: false,
    status: 'recuerdo',
    imagePath: null,
    photoIsHint: true,
    ...over,
  }
}

describe('associatedChallengeIds (issue #822, reto ↔ recuerdo con la misma foto)', () => {
  test('un reto que comparte image_path con un recuerdo queda marcado', () => {
    const moments = [
      am({ challengeId: 'recuerdo-1', imagePath: 'foto.jpg' }),
      am({ challengeId: 'reto-1', isChallenge: true, status: 'closed', imagePath: 'foto.jpg' }),
    ]
    expect(associatedChallengeIds(moments)).toEqual(new Set(['reto-1']))
  })

  test('sin ningún recuerdo con esa foto, el reto no queda marcado', () => {
    const moments = [
      am({ challengeId: 'recuerdo-1', imagePath: 'otra-foto.jpg' }),
      am({ challengeId: 'reto-1', isChallenge: true, status: 'closed', imagePath: 'foto.jpg' }),
    ]
    expect(associatedChallengeIds(moments)).toEqual(new Set())
  })

  test('dos momentos SIN foto (imagePath null) nunca se marcan como asociados', () => {
    const moments = [
      am({ challengeId: 'recuerdo-1', imagePath: null }),
      am({ challengeId: 'reto-1', isChallenge: true, status: 'closed', imagePath: null }),
    ]
    expect(associatedChallengeIds(moments)).toEqual(new Set())
  })

  test('un reto EN JUEGO con foto SORPRESA nunca se marca (sería un spoiler)', () => {
    const moments = [
      am({ challengeId: 'recuerdo-1', imagePath: 'foto.jpg' }),
      am({
        challengeId: 'reto-1',
        isChallenge: true,
        status: 'active',
        photoIsHint: false,
        imagePath: 'foto.jpg',
      }),
    ]
    expect(associatedChallengeIds(moments)).toEqual(new Set())
  })

  test('un reto EN JUEGO con foto PISTA sí se marca (ya es visible)', () => {
    const moments = [
      am({ challengeId: 'recuerdo-1', imagePath: 'foto.jpg' }),
      am({
        challengeId: 'reto-1',
        isChallenge: true,
        status: 'active',
        photoIsHint: true,
        imagePath: 'foto.jpg',
      }),
    ]
    expect(associatedChallengeIds(moments)).toEqual(new Set(['reto-1']))
  })

  test('dos retos que comparten foto entre sí (sin ningún recuerdo) no se marcan', () => {
    const moments = [
      am({ challengeId: 'reto-1', isChallenge: true, status: 'closed', imagePath: 'foto.jpg' }),
      am({ challengeId: 'reto-2', isChallenge: true, status: 'closed', imagePath: 'foto.jpg' }),
    ]
    expect(associatedChallengeIds(moments)).toEqual(new Set())
  })
})

// Factory de un Moment COMPLETO (a diferencia de `am`, que solo lleva los
// campos que mira `associatedChallengeIds`): `pairedChallengeByMemoryId`/
// `fuseMemoryWithChallenge` necesitan el resto (status de juego, isOwn,
// guessedCount…) para construir la fusión.
function fullMoment(over: Partial<Moment> & Pick<Moment, 'challengeId' | 'title'>): Moment {
  return {
    description: null,
    status: 'recuerdo',
    isChallenge: false,
    date: '2026-06-15T10:00:00.000Z',
    deadlineAt: null,
    imageUrl: 'https://cdn.test/portada.jpg',
    imagePath: 'portada.jpg',
    lat: null,
    lng: null,
    guessedCount: 0,
    isOwn: false,
    guessSeconds: null,
    svPanoId: null,
    photoIsHint: true,
    ...over,
  }
}

describe('pairedChallengeByMemoryId (issue #839, fusión momento↔reto)', () => {
  test('empareja el recuerdo con el reto que nace de su misma foto', () => {
    const memory = fullMoment({ challengeId: 'recuerdo-1', title: 'Llegada al campamento' })
    const challenge = fullMoment({
      challengeId: 'reto-1',
      title: 'Llegada al campamento',
      isChallenge: true,
      status: 'active',
      photoIsHint: true,
    })
    const paired = pairedChallengeByMemoryId([memory, challenge])
    expect(paired.get('recuerdo-1')).toBe(challenge)
    expect(paired.size).toBe(1)
  })

  test('un reto SIN recuerdo asociado no aparece en el mapa', () => {
    const challenge = fullMoment({
      challengeId: 'reto-suelto',
      title: 'Reto suelto',
      isChallenge: true,
      status: 'closed',
    })
    expect(pairedChallengeByMemoryId([challenge]).size).toBe(0)
  })

  test('un reto EN JUEGO con foto SORPRESA no se empareja (sería spoiler)', () => {
    const memory = fullMoment({ challengeId: 'recuerdo-1', title: 'Recuerdo' })
    const challenge = fullMoment({
      challengeId: 'reto-1',
      title: 'Reto',
      isChallenge: true,
      status: 'active',
      photoIsHint: false,
    })
    expect(pairedChallengeByMemoryId([memory, challenge]).size).toBe(0)
  })

  test('con dos retos asociados al MISMO recuerdo, se queda con el primero en orden', () => {
    const memory = fullMoment({ challengeId: 'recuerdo-1', title: 'Recuerdo' })
    const challengeA = fullMoment({
      challengeId: 'reto-a',
      title: 'Reto A',
      isChallenge: true,
      status: 'closed',
    })
    const challengeB = fullMoment({
      challengeId: 'reto-b',
      title: 'Reto B',
      isChallenge: true,
      status: 'closed',
    })
    const paired = pairedChallengeByMemoryId([memory, challengeA, challengeB])
    expect(paired.get('recuerdo-1')).toBe(challengeA)
    expect(paired.size).toBe(1)
  })
})

describe('fuseMemoryWithChallenge (issue #839, la tarjeta fusionada)', () => {
  test('conserva la identidad/contenido del recuerdo y adopta el estado de juego del reto', () => {
    const memory = fullMoment({
      challengeId: 'recuerdo-1',
      title: 'Llegada al campamento',
      description: 'Primer día',
      imageUrl: 'https://cdn.test/foto.jpg',
      imagePath: 'foto.jpg',
      lat: 40.1,
      lng: -3.2,
      isOwn: false,
      guessedCount: 0,
    })
    const challenge = fullMoment({
      challengeId: 'reto-1',
      title: 'Llegada al campamento',
      isChallenge: true,
      status: 'active',
      deadlineAt: '2026-06-16T10:00:00.000Z',
      isOwn: true,
      guessedCount: 3,
      guessSeconds: 60,
      svPanoId: 'pano-1',
      photoIsHint: true,
    })

    const fused = fuseMemoryWithChallenge(memory, challenge)

    // Identidad/contenido: del RECUERDO (id de pin/selección en el mapa, foto, lugar).
    expect(fused.challengeId).toBe('recuerdo-1')
    expect(fused.title).toBe('Llegada al campamento')
    expect(fused.description).toBe('Primer día')
    expect(fused.imageUrl).toBe('https://cdn.test/foto.jpg')
    expect(fused.lat).toBe(40.1)
    expect(fused.lng).toBe(-3.2)

    // Estado de juego: del RETO (chip/CTA/cuenta de jugadas/guarda de dueño).
    expect(fused.isChallenge).toBe(true)
    expect(fused.status).toBe('active')
    expect(fused.deadlineAt).toBe('2026-06-16T10:00:00.000Z')
    expect(fused.isOwn).toBe(true)
    expect(fused.guessedCount).toBe(3)
    expect(fused.guessSeconds).toBe(60)
    expect(fused.svPanoId).toBe('pano-1')
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
