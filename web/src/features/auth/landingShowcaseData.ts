// Datos de MUESTRA para el showcase de la landing deslogueada (issue #452): un
// "viaje bien montado" que el visitante ve ANTES de entrar, para entender de un
// vistazo QUÉ es Tabide y QUÉ puede hacer (la validación de jul-2026 dice que el
// eslogan es vago y que "ver el producto antes de entrar es clave").
//
// No son placeholders sueltos: es UN viaje coherente (una vuelta al mundo de un
// grupo), con sus momentos-diario, un reto de ejemplo y su marcador. Reutiliza
// las MISMAS fotos empaquetadas que el globo héroe (features/home/assets/*.webp,
// Wikimedia CC, EXIF estripado) para que el showcase refuerce el globo de arriba
// y todo cargue offline y determinista (galería de revisión visual).

import lisboaPhoto from '../home/assets/lisboa.webp'
import romaPhoto from '../home/assets/roma.webp'
import tokioPhoto from '../home/assets/tokio.webp'
import ciudadDelCaboPhoto from '../home/assets/ciudad-del-cabo.webp'

// Un momento del diario: foto a sangre + lugar clavado + nota corta. Es lo que un
// visitante debe reconocer como "un diario visual de viaje en grupo".
export interface ShowcaseMoment {
  id: string
  photo: string
  /** País/ciudad resuelto (eyebrow versalita, como en MomentCard real). */
  place: string
  /** Nota corta del autor (la voz del diario). */
  note: string
  /** Fecha compacta ya formateada ("8 abr"). */
  date: string
  /** Quién lo compartió (identidad del grupo). */
  author: string
}

// El reto de ejemplo: enseña la mecánica de adivinar SIN spoilear el diario.
export interface ShowcaseChallenge {
  photo: string
  /** La pregunta del reto ("¿Dónde tomó Marta esta foto?"). */
  question: string
  author: string
  /** Cuántos ya han adivinado (prueba social del bucle). */
  guessedCount: number
}

// Una fila del marcador: cierra el bucle "gana quien más se acerca".
export interface ShowcaseScoreRow {
  rank: 1 | 2 | 3 | 4
  name: string
  /** Distancia al punto real, ya formateada ("4,2 km"). */
  km: string
  points: number
}

export const SHOWCASE_TRIP_NAME = 'La vuelta al mundo de los García'

// 3 momentos-diario de destinos reconocibles (mismas fotos que el globo). El
// orden cuenta un mini-relato de viaje; cada nota es la voz de un miembro distinto.
export const SHOWCASE_MOMENTS: ShowcaseMoment[] = [
  {
    id: 'lisboa',
    photo: lisboaPhoto,
    place: 'Portugal · Lisboa',
    note: 'El tram 28 subiendo a la Alfama. Nos perdimos y fue lo mejor del día.',
    date: '4 abr',
    author: 'Marta',
  },
  {
    id: 'roma',
    photo: romaPhoto,
    place: 'Italia · Roma',
    note: 'Madrugón para ver el Coliseo sin colas. Mereció la pena cada minuto.',
    date: '9 abr',
    author: 'Javi',
  },
  {
    id: 'ciudad-del-cabo',
    photo: ciudadDelCaboPhoto,
    place: 'Sudáfrica · Ciudad del Cabo',
    note: 'Table Mountain de fondo y el agua helada. Nadie se atrevió a bañarse.',
    date: '21 abr',
    author: 'Nerea',
  },
]

// El reto de ejemplo (mecánica de adivinar): una foto de Tokio con la pregunta.
export const SHOWCASE_CHALLENGE: ShowcaseChallenge = {
  photo: tokioPhoto,
  question: '¿Dónde tomó Marta esta foto?',
  author: 'Marta',
  guessedCount: 5,
}

// El marcador tras jugar el reto: el ganador (más cerca) en oro; el resto por
// distancia. Cierra el "gana quien más se acerca".
export const SHOWCASE_SCORES: ShowcaseScoreRow[] = [
  { rank: 1, name: 'Lucía', km: '3,1 km', points: 4870 },
  { rank: 2, name: 'Javi', km: '18 km', points: 4210 },
  { rank: 3, name: 'Nerea', km: '54 km', points: 3560 },
  { rank: 4, name: 'Pablo', km: '210 km', points: 2140 },
]

// El relato de una línea del bucle (foto-first, cuatro pasos cortos, estilo
// Polarsteps Plan/Track/Relive pero en la voz de Tabide).
export const SHOWCASE_LOOP: string[] = [
  'Comparte un momento del viaje',
  'Tu gente adivina dónde es',
  'Gana quien más se acerca',
  'Revivís el viaje juntos',
]
