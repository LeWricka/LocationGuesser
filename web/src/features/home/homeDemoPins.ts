import type { GlobePin } from '../../ui'

// Miniaturas REALES de cada destino, empaquetadas en el bundle (no hotlink): así cargan
// siempre (offline, sin depender de Wikimedia en runtime) y entran en la galería de
// revisión visual. Todas con licencia libre, recortadas a 200×200 webp (<10 KB c/u) y con
// los metadatos EXIF/GPS estripados. Fuente + licencia de cada una (Wikimedia Commons):
//
//  - lisboa.webp          — "Tram 28 Lisbon" por Romazur · CC BY-SA 3.0
//  - tokio.webp           — "Skyscrapers of Shinjuku 2009 January" por Morio · CC BY-SA 3.0
//  - nueva-york.webp      — "Lower Manhattan from Governors Island August 2017 panorama"
//                           por King of Hearts · CC BY-SA 4.0
//  - sidney.webp          — "Sydney Opera House - Dec 2008" por Diliff · CC BY-SA 3.0
//  - ciudad-del-cabo.webp — "Table Mountain DanieVDM" por Danie van der Merwe · CC BY 2.0
//  - roma.webp            — "Colosseo 2020" (FeaturedPics) · CC BY-SA 4.0
import lisboaPhoto from './assets/lisboa.webp'
import tokioPhoto from './assets/tokio.webp'
import nuevaYorkPhoto from './assets/nueva-york.webp'
import sidneyPhoto from './assets/sidney.webp'
import ciudadDelCaboPhoto from './assets/ciudad-del-cabo.webp'
import romaPhoto from './assets/roma.webp'

// Pines DEMO curados para el globo de la landing (deslogueada): una constelación de
// destinos reconocibles que da vida al globo héroe sin datos del usuario (aún no hay
// sesión). No son placeholders: son lugares de un "viaje de muestra" coherente, cada uno
// con su FOTO real clavada (el wow estilo Polarsteps). Si una imagen fallara al cargar, el
// pin cae al disco de acento con la inicial del lugar (red de seguridad en HomeGlobe).
// El más reciente lleva el anillo cálido ("lead").
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
    imageUrl: lisboaPhoto,
    targetId: DEMO_TARGET,
  },
  {
    id: 'tokio',
    lat: 35.6762,
    lng: 139.6503,
    title: 'Tokio',
    imageUrl: tokioPhoto,
    targetId: DEMO_TARGET,
  },
  {
    id: 'nueva-york',
    lat: 40.7128,
    lng: -74.006,
    title: 'Nueva York',
    imageUrl: nuevaYorkPhoto,
    targetId: DEMO_TARGET,
  },
  {
    id: 'sidney',
    lat: -33.8688,
    lng: 151.2093,
    title: 'Sídney',
    imageUrl: sidneyPhoto,
    targetId: DEMO_TARGET,
  },
  {
    id: 'ciudad-del-cabo',
    lat: -33.9249,
    lng: 18.4241,
    title: 'Ciudad del Cabo',
    imageUrl: ciudadDelCaboPhoto,
    targetId: DEMO_TARGET,
  },
  {
    id: 'roma',
    lat: 41.9028,
    lng: 12.4964,
    title: 'Roma',
    imageUrl: romaPhoto,
    targetId: DEMO_TARGET,
    lead: true,
  },
]
