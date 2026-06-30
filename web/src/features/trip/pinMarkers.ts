// Markup HTML de los pines de mapa del Viaje, compartido por los dos motores
// (Leaflet `divIcon` y MapLibre `Marker`): ambos inyectan HTML FUERA del árbol de
// React, así que el pin se sirve como string. El look es estilo Polarsteps —
// miniatura redonda de la foto con borde blanco fino, sombra suave y puntita
// inferior— y el color/anillo lo gobiernan los tokens (`--pin-ring-*`), nunca un
// color hardcodeado. La estructura HTML vive aquí; el CSS, en `tripPins.css`.

/** Glifo lucide `MapPin` (mismo trazo que el kit) para el pin sin foto/título. */
export const PIN_MARKER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>'

/** Glifo lucide `HelpCircle`: reto en juego cuya respuesta está oculta. */
export const HELP_MARKER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>'

// Lado del círculo del pin-foto en px (lo consumen Leaflet `iconSize`/`iconAnchor`).
// Centralizado para que ambos motores claven el ancla en el mismo sitio.
export const PIN_SIZE = 48
/** Alto de la puntita bajo el círculo: suma al alto total y baja el ancla a la punta. */
export const PIN_TAIL = 9

/** Inicial del lugar para el pin sin foto: primera letra del título, en mayúscula.
 * Si no hay letra/número usable cae a un glifo de ubicación (nunca un anillo vacío). */
function placeInitial(title: string | null | undefined): string | null {
  const ch = title?.trim()?.[0]
  if (!ch) return null
  return /\p{L}|\p{N}/u.test(ch) ? ch.toUpperCase() : null
}

// Escapa comillas simples para incrustar una URL en `background-image:url('…')`.
function escapeUrl(url: string): string {
  return url.replace(/'/g, "\\'")
}

// Escapa texto para incrustarlo como contenido HTML (la inicial del lugar).
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export interface PhotoPinOptions {
  /** URL de la miniatura, o null → cae a inicial/glifo sobre fondo de acento. */
  imageUrl: string | null
  /** Título del momento, para la inicial del pin sin foto. */
  title?: string | null
  /** Destacado (p.ej. seleccionado): aro dorado en vez de blanco. */
  featured?: boolean
}

/**
 * HTML de un pin-foto estilo Polarsteps: miniatura redonda con borde blanco fino
 * (aro dorado si `featured`), sombra suave y puntita inferior que lo "clava" en el
 * mapa. Sin foto: disco de acento con la inicial del lugar (o glifo de ubicación),
 * nunca un anillo vacío. Devuelve el string para inyectar en el marcador.
 */
export function photoPinHtml({ imageUrl, title, featured = false }: PhotoPinOptions): string {
  const cls = ['lg-trip-pin']
  if (featured) cls.push('lg-trip-pin--featured')
  if (imageUrl) {
    return `<div class="${cls.join(' ')}"><span class="lg-trip-pin__disc" style="background-image:url('${escapeUrl(
      imageUrl,
    )}')"></span></div>`
  }
  cls.push('lg-trip-pin--empty')
  const initial = placeInitial(title)
  const inner = initial
    ? `<span class="lg-trip-pin__initial">${escapeHtml(initial)}</span>`
    : PIN_MARKER_SVG
  return `<div class="${cls.join(' ')}"><span class="lg-trip-pin__disc">${inner}</span></div>`
}

/** HTML del pin del momento ACTIVO (en juego): disco rojo pulsante con "?" — no se
 * clava en su sitio real (anti-spoiler), lo coloca el motor sobre el centroide. */
export function activePinHtml(): string {
  return `<div class="lg-trip-pin lg-trip-pin--active"><span class="lg-trip-pin__disc">${HELP_MARKER_SVG}</span></div>`
}
