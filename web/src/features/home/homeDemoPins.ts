import type { GlobePin } from '../../ui'

// Pines DEMO curados para el globo de la landing (deslogueada): una constelación de
// destinos reconocibles que da vida al globo héroe sin datos del usuario (aún no hay
// sesión). No son placeholders: son lugares de un "viaje de muestra" coherente. Sin
// foto (no hay assets de lugares en el bundle): caen al pin de ubicación de acento, que
// destaca sobre el satélite. El más reciente lleva el anillo cálido ("lead").
//
// targetId es un marcador simbólico: en la landing, tocar un pin abre el alta (no hay
// viaje real al que entrar todavía).
export const DEMO_TARGET = 'demo'

export const HOME_DEMO_PINS: GlobePin[] = [
  {
    id: 'lisboa',
    lat: 38.7223,
    lng: -9.1393,
    title: 'Lisboa',
    imageUrl: null,
    targetId: DEMO_TARGET,
  },
  {
    id: 'porto',
    lat: 41.1579,
    lng: -8.6291,
    title: 'Oporto',
    imageUrl: null,
    targetId: DEMO_TARGET,
  },
  {
    id: 'pirineos',
    lat: 42.6,
    lng: 0.9,
    title: 'Pirineos',
    imageUrl: null,
    targetId: DEMO_TARGET,
  },
  {
    id: 'roma',
    lat: 41.9028,
    lng: 12.4964,
    title: 'Roma',
    imageUrl: null,
    targetId: DEMO_TARGET,
    lead: true,
  },
]
