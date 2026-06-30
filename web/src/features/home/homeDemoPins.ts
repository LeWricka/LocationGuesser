import type { GlobePin } from '../../ui'

// Pines DEMO curados para el globo de la landing (deslogueada): una constelación de
// destinos reconocibles que da vida al globo héroe sin datos del usuario (aún no hay
// sesión). No son placeholders: son lugares de un "viaje de muestra" coherente. Sin
// foto (no hay assets de lugares en el bundle): caen al pin de ubicación de acento, que
// destaca sobre el satélite. El más reciente lleva el anillo cálido ("lead").
//
// REPARTIDOS por el mundo (varios continentes) a propósito: una constelación global se ve
// más aspiracional Y mantiene el encuadre a zoom bajo → el globo SIEMPRE se lee esférico
// (un puñado de pines agrupados en Iberia/Italia forzaba un fit cercano que aplanaba la
// proyección; ver HomeGlobe). Además la landing pinta el globo en modo DECORATIVO "mundo"
// (no hace fit a estos pines), así que esto es también una red de seguridad visual.
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
    id: 'tokio',
    lat: 35.6762,
    lng: 139.6503,
    title: 'Tokio',
    imageUrl: null,
    targetId: DEMO_TARGET,
  },
  {
    id: 'nueva-york',
    lat: 40.7128,
    lng: -74.006,
    title: 'Nueva York',
    imageUrl: null,
    targetId: DEMO_TARGET,
  },
  {
    id: 'sidney',
    lat: -33.8688,
    lng: 151.2093,
    title: 'Sídney',
    imageUrl: null,
    targetId: DEMO_TARGET,
  },
  {
    id: 'ciudad-del-cabo',
    lat: -33.9249,
    lng: 18.4241,
    title: 'Ciudad del Cabo',
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
