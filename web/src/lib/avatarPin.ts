// Fábrica ÚNICA de los pines de mapa (issue #794): disco con anillo blanco + pie
// corto (rombo) — la MISMA familia visual que los pines-foto del globo de la home
// (ver `pinMarkers.ts`/`tripPins.css`: `.lg-trip-pin` + `.lg-trip-pin__disc`), pero
// servida como SVG data-URI (no como elemento DOM) porque el consumidor es un
// Marker CLÁSICO de Google Maps: `icon.url` acepta un data-URI. Así evitamos
// AdvancedMarker, que exige un Map ID y un mapa vectorial (más setup y coste).
//
// Antes (era anterior, issue #794): un teardrop con el EMOJI crudo como `<text>` y
// una diana de círculos concéntricos sueltos — nada que ver con el resto de la
// app, que desde el pivote "Grafito+teal" dibuja SIEMPRE el animal por defecto
// como trazo de línea sobre tinte claro (ver `Avatar.tsx`/`Avatar.module.css`,
// nunca emoji suelto). Estos pines ahora hacen lo mismo: incrustan el MISMO path
// de `ANIMAL_SVGS` (línea, no emoji) sobre un disco de tinte teal uniforme — el
// color deja de variar por avatar (ya no es la señal de "quién es quién"; esa
// señal pasa a ser el NOMBRE bajo el pin, issue #795) y así el pin del jugador
// encaja con el resto del sistema.
//
// Todas las entradas a este módulo son literales o vienen de `ANIMAL_SVGS`
// (nuestro propio set, nunca texto de usuario): no hace falta escapar nada al
// construir el SVG.

import { parseAvatar, svgForEmoji } from './avatar'

/** Tamaño del icono del pin en px (el componente lo pasa a `google.maps.Size`). */
export const PIN_SIZE = { width: 40, height: 42 } as const

/** Punta del pin (abajo-centro, la puntita del rombo): ancla que se clava en la
 * coordenada exacta — mismo criterio que el pin-foto del globo/viaje. */
export const PIN_ANCHOR = { x: 20, y: 40 } as const

/** Origen de la etiqueta (debajo de la punta), para pintar el nombre bajo el pin. */
export const PIN_LABEL_ORIGIN = { x: 20, y: 50 } as const

// Geometría del disco + rombo, calcada de `.lg-trip-pin`/`.lg-trip-pin__disc` en
// tripPins.css (disco + puntita que se solapa un poco en su base) pero a la
// escala de este pin más compacto (40×42 frente a los 48px del pin-foto: aquí no
// hay foto, así que no hace falta el mismo margen para miniatura/sombra).
const CX = 20
const CY = 19
const DISC_R = 15 // radio de RELLENO del disco (el trazo del anillo añade RING_W/2 más)
const RING_W = 3 // = --pin-ring-width
const TAIL_SIDE = 9 // lado del rombo (rect rotado 45°) que hace de puntita
const TAIL_CENTER_Y = CY + DISC_R + RING_W / 2 - TAIL_SIDE / 2 + 2.5 // solape con la base del disco

// Colores de marca (literales: un data-URI SVG no puede leer `var(--token)`,
// Google necesita el string final). Mantener en sync con `tokens.css`.
const RING_WHITE = '#ffffff' // --pin-ring-closed // design-lint-allow: SVG data-URI, no lee var(--)
const RING_ACTIVE = '#0f766e' // --pin-ring-active/--accent // design-lint-allow: SVG data-URI, no lee var(--)
const AVATAR_FILL = '#e6f2f1' // --accent-tint // design-lint-allow: SVG data-URI, no lee var(--)
const AVATAR_ICON = '#0f766e' // --color-accent // design-lint-allow: SVG data-URI, no lee var(--)
const ANSWER_FILL = '#c9a24b' // --medal-gold // design-lint-allow: SVG data-URI, no lee var(--)
const ANSWER_ICON = '#ffffff' // design-lint-allow: SVG data-URI, no lee var(--)

// Escala del glifo (viewBox 24×24, el de ANIMAL_SVGS/IconDiana) dentro del disco:
// ~66% de su diámetro, mismo criterio proporcional que `Avatar.module.css` (.svg
// al 62% del disco del avatar "de verdad"; un pelín más grande aquí porque este
// disco es más pequeño y un trazo muy diminuto se perdería en el mapa).
const ICON_SCALE = (2 * DISC_R * 0.66) / 24
// Grosor de trazo VISUAL deseado tras aplicar `ICON_SCALE`: se compensa
// dividiendo por la propia escala (el `transform: scale()` encoge también el
// stroke-width), para que el trazo se lea igual de nítido que en el resto de la
// app (Avatar.module.css usa 1.4; aquí 1.8 — el pin es más pequeño y sin el
// resto del disco alrededor para dar contexto, un trazo algo más grueso ayuda).
const ICON_STROKE = 1.8 / ICON_SCALE

// Rombo (puntita) rotado 45° desde un `<rect>` cuadrado — mismo truco que el
// `::after` de `.lg-trip-pin` en tripPins.css. `rx` redondea ligeramente las
// esquinas (equivalente a `--radius-xs` en el pin-foto).
function tailSvg(ringColor: string): string {
  const half = TAIL_SIDE / 2
  return (
    `<rect x="${CX - half}" y="${TAIL_CENTER_Y - half}" width="${TAIL_SIDE}" height="${TAIL_SIDE}" ` +
    `rx="1.5" transform="rotate(45 ${CX} ${TAIL_CENTER_Y})" fill="${ringColor}"/>`
  )
}

// Disco: relleno + anillo (stroke centrado en el trazo del círculo, como
// `border` en CSS — el radio de relleno queda igual y el anillo "crece" hacia
// fuera y hacia dentro por igual).
function discSvg(fill: string, ringColor: string): string {
  return `<circle cx="${CX}" cy="${CY}" r="${DISC_R}" fill="${fill}" stroke="${ringColor}" stroke-width="${RING_W}"/>`
}

// Envuelve el path del glifo (animal o diana) centrado y escalado dentro del
// disco. El grosor de trazo se fija en el propio `<g>` como DEFECTO: los paths
// de `ANIMAL_SVGS` no traen `stroke-width` propio (dependen de él); si un path sí
// trae su propio atributo (no es el caso aquí), ganaría igualmente por
// especificidad SVG normal.
function iconGroup(pathMarkup: string, color: string): string {
  const offset = 12 * ICON_SCALE
  return (
    `<g transform="translate(${CX - offset} ${CY - offset}) scale(${ICON_SCALE})" ` +
    `fill="none" stroke="${color}" stroke-width="${ICON_STROKE}" ` +
    `stroke-linecap="round" stroke-linejoin="round">${pathMarkup}</g>`
  )
}

function wrapSvg(body: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_SIZE.width}" height="${PIN_SIZE.height}" ` +
    `viewBox="0 0 ${PIN_SIZE.width} ${PIN_SIZE.height}">${body}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/**
 * SVG del pin de un ANIMAL del set por defecto (issue #794): disco de tinte
 * teal + el mismo dibujo de línea que `Avatar.tsx` (nunca el emoji crudo) +
 * anillo (blanco, o teal profundo con `ring: 'active'` — el jugador destaca su
 * PROPIO pin entre los del resto, issue #795) + puntita corta.
 * `emoji` debe ser una clave de `ANIMAL_SVGS` (ver `svgForEmoji`); las llamadas
 * de la app siempre pasan por `parseAvatar`/`canonicalEmoji`, que lo garantizan.
 */
export function avatarPinSvg(emoji: string, ring: 'default' | 'active' = 'default'): string {
  const ringColor = ring === 'active' ? RING_ACTIVE : RING_WHITE
  const path = svgForEmoji(emoji) ?? ''
  return wrapSvg(
    tailSvg(ringColor) + discSvg(AVATAR_FILL, ringColor) + iconGroup(path, AVATAR_ICON),
  )
}

// Fallback de un avatar-imagen: el animal por defecto del id (siempre 'emoji').
// El '🦊' de más abajo es una llave interna hacia `ANIMAL_SVGS`/`svgForEmoji`
// (nunca se pinta como texto/emoji suelto), red de seguridad si `parseAvatar`
// devolviera 'image' incluso con `avatarUrl: null` (no debería pasar nunca).
function defaultEmojiFor(userId: string): string {
  const fallback = parseAvatar(null, userId)
  return fallback.kind === 'emoji' ? fallback.emoji : '🦊' // design-lint-allow: llave interna a ANIMAL_SVGS, no UI
}

/**
 * Resuelve un avatar de perfil a un pin SVG. `parseAvatar` normaliza el animal
 * al set canónico de 8 (un token antiguo fuera del set se proyecta de forma
 * estable a uno de los 8), así que el glifo del pin siempre pertenece al set
 * nuevo. Si el avatar es una imagen (foto de perfil subida) no se puede meter en
 * el SVG sin assets externos, así que cae al animal POR DEFECTO del `userId`: el
 * pin sigue siendo autocontenido y estable por usuario.
 *
 * `own` (issue #795): true para el pin del PROPIO jugador en un mapa con varios
 * jugadores (el resultado post-partida) — anillo teal profundo en vez de blanco,
 * para encontrarse un vistazo más rápido entre los pines del resto.
 */
export function avatarPinFromProfile(
  avatarUrl: string | null,
  userId: string,
  own = false,
): string {
  const resolved = parseAvatar(avatarUrl, userId)
  const emoji = resolved.kind === 'emoji' ? resolved.emoji : defaultEmojiFor(userId)
  return avatarPinSvg(emoji, own ? 'active' : 'default')
}

// Diana (mismo trazo que `IconDiana` del set custom de iconos): dos anillos +
// mira de 4 brazos + punto central relleno. Sin trazo propio por elemento (a
// diferencia del componente React): hereda el grosor por defecto de `iconGroup`,
// igual que los animales, para que ambos glifos se lean con el mismo peso visual.
const DIANA_PATH =
  '<circle cx="12" cy="12" r="9"/>' +
  '<circle cx="12" cy="12" r="5.5"/>' +
  '<line x1="12" y1="2" x2="12" y2="6"/>' +
  '<line x1="12" y1="18" x2="12" y2="22"/>' +
  '<line x1="2" y1="12" x2="6" y2="12"/>' +
  '<line x1="18" y1="12" x2="22" y2="12"/>' +
  '<circle cx="12" cy="12" r="2.2" fill="currentColor"/>'

/**
 * Pin de la RESPUESTA real (la diana del reto) como data-URI para `icon.url` de
 * un Marker clásico de Google Maps. Disco de ORO (en vez del tinte teal de los
 * jugadores) para que se distinga a un vistazo de cualquier pin de jugador —
 * MISMA geometría de disco+anillo+puntita que `avatarPinSvg` (una sola fábrica,
 * issue #794), solo cambian el relleno y el glifo.
 */
export function targetPinSvg(): string {
  return wrapSvg(
    tailSvg(RING_WHITE) + discSvg(ANSWER_FILL, RING_WHITE) + iconGroup(DIANA_PATH, ANSWER_ICON),
  )
}
