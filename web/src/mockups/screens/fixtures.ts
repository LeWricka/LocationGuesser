// Fixtures de los mockups: datos estáticos para las 5 pantallas del camino feliz.
// Sin red, sin Supabase, sin Google Maps real. El mapa y el Street View se stubean
// con imágenes o placeholders estáticos.
//
// Imágenes reutilizadas del repo (no hay datos externos):
//  - web/src/features/home/assets/*.webp — fotos de ciudades (Tokio, etc.)
//  - web/src/assets/landing/*.webp — capturas de producto
//
// Los momentos con foto usan estas webp; los retos de ubicación (GeoGuessr, sin
// foto) NO llevan imagen: la UI muestra una miniatura de mapa/SV en su lugar.

import fotoTokio from '../../features/home/assets/tokio.webp'
import fotoRoma from '../../features/home/assets/roma.webp'
import fotoLisboa from '../../features/home/assets/lisboa.webp'

export const FIXTURE_NOMBRE = 'Lewis'
export const FIXTURE_EMAIL = 'lewis@tabide.app'

export const FIXTURE_VIAJE = {
  nombre: 'Japón en primavera',
  descripcion: 'Dos semanas entre templos, ramen y trenes bala.',
  fechas: '4–18 jun · 14 días',
}

// Un momento del diario es o bien una FOTO (con imagen a ancho completo) o bien
// un RETO de ubicación (GeoGuessr sin foto → la UI pone miniatura de SV/mapa).
export type MomentoTipo = 'foto' | 'reto'

export interface FixtureMomento {
  id: string
  titulo: string
  lugar: string
  fecha: string
  tipo: MomentoTipo
  /** URL de la foto (solo tipo 'foto'). */
  foto?: string
}

export const FIXTURE_MOMENTOS: FixtureMomento[] = [
  {
    id: 'm1',
    titulo: '¿Dónde está este torii?',
    lugar: 'Fushimi Inari, Kioto',
    fecha: 'hace 2 h',
    tipo: 'reto',
  },
  {
    id: 'm2',
    titulo: 'Atardecer sobre Tokio',
    lugar: 'Asakusa, Tokio',
    fecha: 'hace 1 día',
    tipo: 'foto',
    foto: fotoTokio,
  },
  {
    id: 'm3',
    titulo: 'El bosque de bambú',
    lugar: 'Arashiyama, Kioto',
    fecha: 'hace 2 días',
    tipo: 'reto',
  },
  {
    id: 'm4',
    titulo: 'El mejor ramen del viaje',
    lugar: 'Gion, Kioto',
    fecha: 'hace 3 días',
    tipo: 'foto',
    foto: fotoRoma,
  },
  {
    id: 'm5',
    titulo: 'Templos al amanecer',
    lugar: 'Higashiyama, Kioto',
    fecha: 'hace 4 días',
    tipo: 'foto',
    foto: fotoLisboa,
  },
]

export interface FixtureJugador {
  nombre: string
  /** Inicial para el avatar (sin emoji: círculo con inicial). */
  inicial: string
  puntos: number
  distanciaKm: number
}

export const FIXTURE_MARCADOR: FixtureJugador[] = [
  { nombre: 'Marta', inicial: 'M', puntos: 4880, distanciaKm: 1.2 },
  { nombre: 'Lewis', inicial: 'L', puntos: 4200, distanciaKm: 8.0 },
  { nombre: 'Iker', inicial: 'I', puntos: 3100, distanciaKm: 42.0 },
  { nombre: 'Noa', inicial: 'N', puntos: 2600, distanciaKm: 87.0 },
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
