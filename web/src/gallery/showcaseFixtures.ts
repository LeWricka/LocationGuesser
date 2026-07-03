// Fixtures del SHOWCASE de la landing (issue #652): las capturas de junio (#462)
// enseñaban el diseño VIEJO y fotos-stub grises (el gradiente con la etiqueta en
// texto de `fakeSupabase.photoDataUri`). Aquí sembramos las pantallas ACTUALES con
// FOTOS REALES: los MISMOS 5 lugares/licencias que ya vive el repo para el globo de
// la landing (homeDemoPins — Wikimedia Commons, ver ese fichero para autor/licencia
// de cada una), pero en una talla MAYOR (`./assets/*-lg.webp`, ~1280px de ancho).
//
// Las miniaturas de 200×200 de `homeDemoPins.ts` están pensadas para el disco de un
// pin (48px): de sobra para eso, pero pixeladas si se estiran a sangre completa (la
// escena de "jugar") o a una tarjeta grande (la portada del dashboard, ~360px de
// ancho). De ahí el segundo juego de tallas, SOLO para la galería (no se empaquetan
// en producción: `gallery.html` solo entra en el build con `GALLERY=1`, ver
// `vite.config.ts`), recortadas del MISMO archivo fuente de Commons a mayor
// resolución y re-optimizadas a webp (sin EXIF/GPS).
//
// Aparte de `fixtures.ts` a propósito (issue #652 lo pide: minimiza el conflicto
// con el trabajo en paralelo de #645 sobre `cases.tsx`) y porque estas pantallas se
// capturan SIN pasar por el cliente Supabase falso: `HomeDashboard`, `TripDiario` y
// `GameScene` son presentacionales puros (reciben sus datos por props), así que
// aquí basta con maquetar props ricas — no hace falta tocar `fakeSupabase.ts` ni el
// "mundo" sembrado de `fixtures.ts`.
//
// Solo dato REAL reutilizado de fuera: `HOME_DEMO_PINS` (la constelación de fotos
// del globo de la landing deslogueada, a talla de pin), para que el globo de la
// home logueada del showcase luzca la MISMA riqueza de fotos que la landing.

import lisboaPhoto from './assets/lisboa-lg.webp'
import tokioPhoto from './assets/tokio-lg.webp'
import sidneyPhoto from './assets/sidney-lg.webp'
import ciudadDelCaboPhoto from './assets/ciudad-del-cabo-lg.webp'
import romaPhoto from './assets/roma-lg.webp'
import type { HomeGroup, HomePinned } from '../ui'
import type { Moment, RoutePoint } from '../lib/trip'
import type { GameSceneData } from '../features/play/GameScene'

// ── showcase-home: dashboard logueado con portadas y pines-foto reales ───────
export const SHOWCASE_HOME_GROUPS: HomeGroup[] = [
  {
    id: 'showcase-japon',
    name: 'Japón en primavera',
    status: 'toplay',
    owned: true,
    coverUrl: tokioPhoto,
    startsOn: '2026-06-04',
    endsOn: '2026-06-18',
  },
  {
    id: 'showcase-lisboa',
    name: 'Escapada a Lisboa',
    status: 'live',
    owned: true,
    coverUrl: lisboaPhoto,
    startsOn: '2026-05-02',
    endsOn: '2026-05-05',
  },
  {
    id: 'showcase-sidney',
    name: 'Finde en Sídney',
    status: 'idle',
    owned: false,
    closed: true,
    coverUrl: sidneyPhoto,
    startsOn: '2026-03-14',
    endsOn: '2026-03-17',
  },
]

export const SHOWCASE_HOME_PINNED: HomePinned = {
  groupId: 'showcase-japon',
  challengeId: 'showcase-fushimi',
  title: '¿Dónde tomó Marta esta foto?',
  groupName: 'Japón en primavera',
  deadlineAt: '2026-06-15T23:00:00.000Z',
  coverUrl: tokioPhoto,
}

// ── showcase-viaje: diario con momentos reales (recuerdo/reto activo/reto
// cerrado) y su ruta de pines-foto. 100% presentacional (TripDiario recibe todo
// por props), así que no hace falta ningún "mundo" servido por el cliente falso.
export const SHOWCASE_MOMENTS: Moment[] = [
  {
    challengeId: 'showcase-lisboa-tranvia',
    title: 'El tranvía 28',
    description: 'Subiendo por Alfama a última hora, cuando ya no hay colas.',
    status: 'recuerdo',
    isChallenge: false,
    date: '2026-06-10T09:00:00.000Z',
    deadlineAt: null,
    imageUrl: lisboaPhoto,
    imagePath: null,
    lat: 38.7223,
    lng: -9.1393,
    guessedCount: 0,
    isOwn: false,
    guessSeconds: null,
    svPanoId: null,
    country: { code: 'PT', name: 'PORTUGAL', flag: '🇵🇹' },
  },
  {
    challengeId: 'showcase-tokio-noche',
    title: '¿Dónde nos perdimos esta noche?',
    description: 'Luces de neón hasta donde alcanza la vista.',
    status: 'closed',
    isChallenge: true,
    date: '2026-06-12T20:00:00.000Z',
    deadlineAt: '2026-06-13T20:00:00.000Z',
    imageUrl: tokioPhoto,
    imagePath: null,
    lat: 35.6762,
    lng: 139.6503,
    guessedCount: 3,
    isOwn: false,
    guessSeconds: 30,
    svPanoId: null,
    country: { code: 'JP', name: 'JAPÓN', flag: '🇯🇵' },
  },
  {
    challengeId: 'showcase-sidney-atardecer',
    title: '¿A qué hora es este atardecer?',
    description: null,
    status: 'active',
    isChallenge: true,
    date: '2026-06-14T18:00:00.000Z',
    deadlineAt: '2026-06-16T18:00:00.000Z',
    // Anti-spoiler (ver lib/trip.ts): un reto EN JUEGO nunca lleva su lat/lng
    // real, aunque su foto (la pregunta, no la respuesta) sí se ve siempre.
    imageUrl: sidneyPhoto,
    imagePath: null,
    lat: null,
    lng: null,
    guessedCount: 1,
    isOwn: false,
    guessSeconds: 45,
    svPanoId: null,
  },
  {
    challengeId: 'showcase-capetown-mesa',
    title: 'Mesa redonda al amanecer',
    description: 'Subimos antes de que abriera el teleférico.',
    status: 'recuerdo',
    isChallenge: false,
    date: '2026-06-08T07:00:00.000Z',
    deadlineAt: null,
    imageUrl: ciudadDelCaboPhoto,
    imagePath: null,
    lat: -33.9249,
    lng: 18.4241,
    guessedCount: 0,
    isOwn: false,
    guessSeconds: null,
    svPanoId: null,
    country: { code: 'ZA', name: 'SUDÁFRICA', flag: '🇿🇦' },
  },
]

// Ruta cronológica: solo los momentos CERRADOS/recuerdo con coordenada visible
// entran en la polyline (el activo, sin lat/lng, queda fuera a propósito).
export const SHOWCASE_ROUTE: RoutePoint[] = [
  {
    challengeId: 'showcase-capetown-mesa',
    lat: -33.9249,
    lng: 18.4241,
    title: 'Mesa redonda al amanecer',
    imageUrl: ciudadDelCaboPhoto,
    date: '2026-06-08T07:00:00.000Z',
  },
  {
    challengeId: 'showcase-lisboa-tranvia',
    lat: 38.7223,
    lng: -9.1393,
    title: 'El tranvía 28',
    imageUrl: lisboaPhoto,
    date: '2026-06-10T09:00:00.000Z',
  },
  {
    challengeId: 'showcase-tokio-noche',
    lat: 35.6762,
    lng: 139.6503,
    title: '¿Dónde nos perdimos esta noche?',
    imageUrl: tokioPhoto,
    date: '2026-06-12T20:00:00.000Z',
  },
]

export const SHOWCASE_SELECTED_MOMENT = 'showcase-tokio-noche'

// ── showcase-jugar: la escena de JUGAR a pantalla completa (foto real), 100%
// presentacional vía `GameScene` (extraída de PlayChallenge, sin estado propio):
// sin pasar por PlayChallenge ni por ningún backend, así que no depende de un
// challenge sembrado. El mini-mapa de adivinar sigue stubeado (esquina, pequeño),
// pero la ESCENA protagonista es la foto real a sangre.
export const SHOWCASE_JUGAR_TITLE = '¿Dónde tomó Iker esta foto?'
export const SHOWCASE_JUGAR_SCENE: GameSceneData = { kind: 'photo', photoUrl: romaPhoto }

// ── showcase-reveal: anillo teal + puntos, sin el mapa a sangre del revelado
// real (issue #652: a 62svh de alto, el stub de mapa —un rectángulo azul pizarra
// liso— se comía media pantalla y no vendía nada). Composición recortada al
// bloque que SÍ luce: la tarjeta con el anillo (ScoreRing es puro SVG/CSS, sin
// dependencia de mapas/SDK), más la foto sorpresa real revelada debajo.
export const SHOWCASE_REVEAL_TITLE = '¿A qué hora es este atardecer?'
export const SHOWCASE_REVEAL_POINTS = 4880
export const SHOWCASE_REVEAL_MAX_POINTS = 5000
export const SHOWCASE_REVEAL_DISTANCE_KM = 1.2
export const SHOWCASE_REVEAL_RANK = { position: 1, total: 4 }
export const SHOWCASE_REVEAL_PHOTO = sidneyPhoto
