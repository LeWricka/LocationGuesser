// Burbuja del pin para el mapa: un SVG en forma de teardrop (círculo arriba con
// el emoji del avatar sobre su fondo, punta abajo) servido como data-URI.
//
// PORQUÉ data-URI sobre un Marker CLÁSICO (no AdvancedMarker): el Marker clásico
// de Google Maps pinta su icono desde `icon.url`, que acepta un data-URI. Así
// evitamos AdvancedMarker, que exige un Map ID y un mapa vectorial (más setup,
// estilos remotos y coste). Con esto el pin es 100% autocontenido: el SVG lleva
// dentro su color/gradiente y el emoji, sin assets externos ni Map ID.

import { parseAvatar } from './avatar'

/** Tamaño del icono del pin en px (el componente lo pasa a `google.maps.Size`). */
export const PIN_SIZE = { width: 48, height: 60 } as const

/** Punta del pin (abajo-centro): ancla que se clava en la coordenada exacta. */
export const PIN_ANCHOR = { x: 24, y: 60 } as const

/** Origen de la etiqueta (debajo de la punta), para pintar el nombre bajo el pin. */
export const PIN_LABEL_ORIGIN = { x: 24, y: 74 } as const

// Geometría del teardrop. La burbuja es un círculo de radio R centrado en
// (CX, CY); la punta baja hasta `PIN_SIZE.height`. El emoji se centra en la
// burbuja. Mantener los números cuadrados con PIN_SIZE/PIN_ANCHOR de arriba.
const CX = 24
const CY = 22
const R = 21

/**
 * SVG del pin (teardrop con el emoji sobre `bgCss`) como data-URI listo para
 * `icon.url` de un Marker clásico de Google Maps.
 *
 * - Si `bgCss` parece un gradiente CSS (contiene `gradient(`), se define un
 *   `<linearGradient>` en `<defs>` aproximando los stops; si es color sólido se
 *   usa tal cual como `fill`.
 * - El emoji va como `<text>` centrado en la burbuja.
 * - El resultado se URL-encodea para no romper el data-URI (`#`, `<`, `>`...).
 */
export function avatarPinSvg(emoji: string, bgCss: string): string {
  const isGradient = /gradient\(/i.test(bgCss)
  const fill = isGradient ? 'url(#g)' : escapeXml(bgCss)
  const defs = isGradient ? `<defs>${gradientDef(bgCss)}</defs>` : ''

  // Camino del teardrop: arco superior (la burbuja) que se cierra en la punta
  // inferior. Dibujado con dos arcos desde la punta para que el contorno sea
  // continuo (sin solaparse con el círculo).
  const tipX = CX
  const tipY = PIN_SIZE.height
  const path =
    `M ${tipX} ${tipY} ` +
    `C ${CX - R * 0.55} ${CY + R * 0.9}, ${CX - R} ${CY + R * 0.6}, ${CX - R} ${CY} ` +
    `A ${R} ${R} 0 1 1 ${CX + R} ${CY} ` +
    `C ${CX + R} ${CY + R * 0.6}, ${CX + R * 0.55} ${CY + R * 0.9}, ${tipX} ${tipY} Z`

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_SIZE.width}" height="${PIN_SIZE.height}" ` +
    `viewBox="0 0 ${PIN_SIZE.width} ${PIN_SIZE.height}">` +
    defs +
    `<path d="${path}" fill="${fill}" stroke="#ffffff" stroke-width="2"/>` +
    `<text x="${CX}" y="${CY}" font-size="22" text-anchor="middle" dominant-baseline="central">` +
    `${escapeXml(emoji)}</text>` +
    `</svg>`

  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/**
 * Resuelve un avatar de perfil a un pin SVG. Si el avatar es una imagen
 * (retrocompat con URLs antiguas) no se puede meter en el SVG sin assets
 * externos, así que se cae al emoji POR DEFECTO del `userId`: el pin sigue
 * siendo autocontenido y estable por usuario.
 */
export function avatarPinFromProfile(avatarUrl: string | null, userId: string): string {
  const resolved = parseAvatar(avatarUrl, userId)
  if (resolved.kind === 'emoji') return avatarPinSvg(resolved.emoji, resolved.bg.background)
  // Imagen: fallback al emoji por defecto del id (resuelve siempre a `emoji`).
  const fallback = parseAvatar(null, userId)
  const emoji = fallback.kind === 'emoji' ? fallback.emoji : '📍'
  const bg = fallback.kind === 'emoji' ? fallback.bg.background : '#5b8def'
  return avatarPinSvg(emoji, bg)
}

// Escapa los caracteres XML peligrosos del contenido inyectado (emoji y color).
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// Aproxima un `linear-gradient(...)` CSS a un `<linearGradient>` SVG: extrae los
// colores hex y los reparte uniformemente como stops (suficiente para el pin;
// no soporta ángulos ni posiciones de stop, que no necesitamos visualmente).
function gradientDef(bgCss: string): string {
  const colors = bgCss.match(/#[0-9a-fA-F]{3,8}/g) ?? ['#5b8def', '#3a5fd9']
  const last = colors.length - 1 || 1
  const stops = colors
    .map((color, i) => {
      const offset = last === 0 ? 0 : Math.round((i / last) * 100)
      return `<stop offset="${offset}%" stop-color="${escapeXml(color)}"/>`
    })
    .join('')
  // x1/y1 -> x2/y2 diagonal, acorde al 135deg habitual de la paleta.
  return `<linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">${stops}</linearGradient>`
}
