// Markup HTML de los pines de mapa del Viaje, compartido por los dos motores
// (Leaflet `divIcon` y MapLibre `Marker`): ambos inyectan HTML FUERA del árbol de
// React, así que el pin se sirve como string. El look es estilo Polarsteps —
// miniatura redonda de la foto con borde blanco fino, sombra suave y puntita
// inferior— y el color/anillo lo gobiernan los tokens (`--pin-ring-*`), nunca un
// color hardcodeado. La estructura HTML vive aquí; el CSS, en `tripPins.css`.

/** Glifo lucide `MapPin` (mismo trazo que el kit) para el pin sin foto/título. */
export const PIN_MARKER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>'

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
 *
 * El `imageUrl` pasa SIEMPRE por `isUsablePinImage`: una URL no usable (svg+xml con
 * texto, esquema raro, vacío) NO se clava como `background-image` —caería en un
 * rótulo minúsculo ilegible— sino que baja al disco de acento con la inicial. Aun
 * así, este camino de STRING no puede detectar una imagen que sea usable pero luego
 * falle al cargar (una URL firmada de Storage caducada/404), porque `background-image`
 * no dispara `onerror`. Por eso los mapas NO usan este string para pintar: usan
 * `buildPinElement` (más abajo), que precarga la foto y solo la sube si carga de
 * verdad. `photoPinHtml` queda como base del markup (y camino sin foto seguro). */
export function photoPinHtml({ imageUrl, title, featured = false }: PhotoPinOptions): string {
  const cls = ['lg-trip-pin']
  if (featured) cls.push('lg-trip-pin--featured')
  if (isUsablePinImage(imageUrl)) {
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

/** Convierte un string de markup de pin en su ELEMENTO DOM raíz (`.lg-trip-pin`). */
function elementFromHtml(html: string): HTMLDivElement {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = html
  // El primer (único) hijo es el `.lg-trip-pin`; lo devolvemos como raíz del marcador.
  return wrapper.firstElementChild as HTMLDivElement
}

/** ¿Es una URL de imagen USABLE como fondo de pin? Aceptamos lo que un navegador
 * pinta de verdad como imagen: (a) esquemas de red/objeto (http/https/blob), (b) un
 * data-URI de imagen de RÁSTER —jpeg/png/webp/gif/avif—, y (c) rutas RELATIVAS /
 * same-origin (`/…`, `./…`, `../…`, `assets/…`): los assets que Vite empaqueta
 * (`import lisboa from './assets/lisboa.webp'` → `/assets/lisboa-HASH.webp`) son
 * ficheros de imagen reales servidos desde el propio origen y deben pintarse.
 * Rechazamos vacíos, espacios y —clave para el bug del pin "garabateado"— los
 * `data:image/svg+xml` con TEXTO dentro: un SVG con `<text>` metido en un disco de
 * 42px se pinta como un rótulo minúsculo ilegible en vez de una miniatura. También
 * rechazamos esquemas peligrosos (`javascript:`, etc.). Ante cualquier duda
 * devolvemos false → el pin cae limpio a la inicial del lugar. */
export function isUsablePinImage(url: string | null | undefined): url is string {
  if (typeof url !== 'string') return false
  const src = url.trim()
  if (src.length === 0) return false
  // data-URI: solo imágenes de ráster; NADA de svg+xml (puede llevar texto/markup).
  if (src.startsWith('data:')) return /^data:image\/(jpeg|jpg|png|webp|gif|avif)[;,]/i.test(src)
  // Rutas relativas / same-origin de los assets empaquetados por Vite (imagen real).
  if (/^(\.\.?\/|\/|assets\/)/.test(src)) return true
  // Esquemas que pintan una imagen de red/objeto real.
  return /^(https?:|blob:)/i.test(src)
}

/** Input de un pin-foto CERRADO/situado, para construir su elemento DOM con la red de
 * seguridad de precarga. Lo consumen HomeGlobe y los dos motores de mapa de Viaje. */
export interface PinInput {
  title?: string | null
  imageUrl: string | null
  /** Destacado/seleccionado (mapa de Viaje): aro dorado. */
  featured?: boolean
  /** Pin "lead" del grupo (globo de la home): aro cálido pulsante. */
  lead?: boolean
  /** Home: añade la clase `lg-home-pin` (estructura de disco compartida). */
  home?: boolean
}

/**
 * Construye el ELEMENTO DOM de un pin-foto (cerrado/situado) con la RED DE SEGURIDAD
 * anti-garabato. ÚNICO camino de construcción de pin-foto de la app: lo usan el globo
 * de la home (HomeGlobe) y los DOS motores del mapa de Viaje (Leaflet y MapLibre), de
 * modo que TODOS los pines se comportan igual y ninguno puede recaer en la "tarjeta
 * oscura".
 *
 * Arranca SIEMPRE en el estado sin foto (disco de acento + inicial del lugar), que es
 * el fallback VISIBLE. Solo sube a la miniatura si:
 *  (a) la URL es una imagen usable (`isUsablePinImage`: nada de svg+xml con texto ni
 *      esquemas raros), y
 *  (b) esa imagen PRECARGA bien (`Image().onload`).
 * Un `background-image` no dispara `onerror`, así que sin esta precarga una URL firmada
 * de Storage caducada/404 dejaría el disco vacío (recuadro oscuro) SIN caer a la
 * inicial —el bug del pin ininteligible—. Con la precarga, el estado por defecto es la
 * inicial limpia y la foto es un upgrade que solo ocurre si la imagen carga de verdad;
 * si falla (`onerror`), el pin se queda en la inicial.
 */
export function buildPinElement(pin: PinInput): HTMLDivElement {
  // Markup base SIN foto (disco de acento + inicial): fallback visible de entrada. No
  // pasamos `imageUrl` aquí a propósito: la foto entra solo tras precargar (abajo).
  const el = elementFromHtml(
    photoPinHtml({ imageUrl: null, title: pin.title, featured: pin.featured }),
  )
  if (pin.home) el.classList.add('lg-home-pin')
  if (pin.lead) el.classList.add('lg-home-pin--lead')

  if (isUsablePinImage(pin.imageUrl)) {
    const disc = el.querySelector<HTMLElement>('.lg-trip-pin__disc')
    const src = pin.imageUrl
    const img = new Image()
    img.onload = () => {
      if (!disc) return
      // Carga OK: quita el estado "vacío" (disco de acento + inicial) y clava la foto.
      el.classList.remove('lg-trip-pin--empty')
      disc.replaceChildren()
      disc.style.backgroundImage = `url('${escapeUrl(src)}')`
    }
    // onerror: no hacemos nada → se queda el disco de acento con la inicial (fallback).
    img.src = src
  }
  return el
}

/** Input del pin-foto del globo de la home (compat: subconjunto de `PinInput`). */
export interface HomePinInput {
  title: string
  imageUrl: string | null
  /** Marca el pin "lead" del grupo (aro cálido). */
  lead?: boolean
}

/** Pin-foto del globo de la home. Fino envoltorio sobre `buildPinElement` (el builder
 * compartido con el mapa de Viaje) que fija la variante `home`. */
export function buildHomePinElement(pin: HomePinInput): HTMLDivElement {
  return buildPinElement({ title: pin.title, imageUrl: pin.imageUrl, lead: pin.lead, home: true })
}
