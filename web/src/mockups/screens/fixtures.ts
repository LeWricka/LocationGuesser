// Fixtures de los mockups: datos estáticos para las 5 pantallas del camino feliz.
// Sin red, sin Supabase, sin Google Maps real. El mapa y el Street View se stubean
// con imágenes o placeholders estáticos.
//
// Imágenes reutilizadas del repo (no hay datos externos):
//  - web/src/assets/landing/*.webp — capturas de producto (home, marcador, resultado)
//  - web/src/features/home/assets/*.webp — fotos de ciudades del globo
//
// Todos los avatares son emojis (texto) para no depender de URLs externas.

export const FIXTURE_NOMBRE = 'Lewis'
export const FIXTURE_EMAIL = 'lewis@tabide.app'

export const FIXTURE_VIAJE = {
  nombre: 'Japón en primavera',
  descripcion: 'Dos semanas entre templos, ramen y trenes bala.',
  fechas: '4–18 jun · 14 días',
}

export interface FixtureMomento {
  id: string
  titulo: string
  lugar: string
  fecha: string
  emoji: string
  tieneReto: boolean
}

export const FIXTURE_MOMENTOS: FixtureMomento[] = [
  {
    id: 'm1',
    titulo: '¿Dónde está este torii?',
    lugar: 'Fushimi Inari, Kioto',
    fecha: 'hace 2 h',
    emoji: '⛩️',
    tieneReto: true,
  },
  {
    id: 'm2',
    titulo: 'El bosque de bambú',
    lugar: 'Arashiyama, Kioto',
    fecha: 'hace 1 día',
    emoji: '🎋',
    tieneReto: true,
  },
  {
    id: 'm3',
    titulo: 'El mejor ramen del viaje',
    lugar: 'Gion, Kioto',
    fecha: 'hace 2 días',
    emoji: '🍜',
    tieneReto: false,
  },
  {
    id: 'm4',
    titulo: 'Vista desde el Skytree',
    lugar: 'Asakusa, Tokio',
    fecha: 'hace 4 días',
    emoji: '🗼',
    tieneReto: false,
  },
]

export interface FixtureJugador {
  nombre: string
  emoji: string
  puntos: number
  distanciaKm: number
}

export const FIXTURE_MARCADOR: FixtureJugador[] = [
  { nombre: 'Marta', emoji: '🌸', puntos: 4880, distanciaKm: 1.2 },
  { nombre: 'Lewis', emoji: '🗺️', puntos: 4200, distanciaKm: 8.0 },
  { nombre: 'Iker', emoji: '⚽', puntos: 3100, distanciaKm: 42.0 },
  { nombre: 'Noa', emoji: '🌊', puntos: 2600, distanciaKm: 87.0 },
]

// Coordenadas ficticias para el stub del mapa (Fushimi Inari, Kioto).
export const FIXTURE_UBICACION = {
  lat: 34.9671,
  lng: 135.7727,
  label: 'Fushimi Inari, Kioto',
}

// Coordenadas del tiro del jugador (stub de resultado).
export const FIXTURE_TIRO = {
  lat: 35.02,
  lng: 135.69,
  distanciaKm: 8.0,
  puntos: 4200,
}

export const FIXTURE_RESPUESTA = {
  lat: 34.9671,
  lng: 135.7727,
  label: 'Fushimi Inari, Kioto',
}
