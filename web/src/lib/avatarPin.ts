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

/** Tamaño del icono del pin en px (el componente lo pasa a `google.maps.Size`).
 * Lleva un margen EXTRA arriba y a la derecha (issue #811, +6px cada uno) que
 * no pertenece al disco: es el hueco del badge de PUESTO (esquina sup-derecha)
 * — sin él, el badge se recortaría contra el borde del icono. */
export const PIN_SIZE = { width: 46, height: 48 } as const

/** Punta del pin (abajo-centro, la puntita del rombo): ancla que se clava en la
 * coordenada exacta — mismo criterio que el pin-foto del globo/viaje. NO es el
 * centro horizontal de `PIN_SIZE.width` (ese margen extra es asimétrico, solo
 * del badge): sigue centrada en el DISCO, no en el icono completo. */
export const PIN_ANCHOR = { x: 20, y: 46 } as const

/** Origen de la etiqueta de NOMBRE bajo el pin (vuelve tras el #811, que la
 * retiró en favor del badge de puesto: con 8+ jugadores el badge por sí solo
 * obliga a mirar la tabla para saber quién es cada disco). Mismo eje X que la
 * punta; unos px por debajo de `PIN_ANCHOR.y` — Google posiciona el label de
 * forma independiente del icono, así que puede caer fuera de su lienzo (48px
 * de alto) sin recortarse. */
export const PIN_LABEL_ORIGIN = { x: PIN_ANCHOR.x, y: PIN_ANCHOR.y + 12 } as const

// Geometría del disco + rombo, calcada de `.lg-trip-pin`/`.lg-trip-pin__disc` en
// tripPins.css (disco + puntita que se solapa un poco en su base) pero a la
// escala de este pin más compacto (40×42 frente a los 48px del pin-foto: aquí no
// hay foto, así que no hace falta el mismo margen para miniatura/sombra). CY
// lleva el margen superior del badge de puesto (issue #811: +6, ver PIN_SIZE);
// CX no cambia (el margen extra de PIN_SIZE es solo a la derecha).
const CX = 20
const CY = 25
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

// Colores del badge de PUESTO (issue #811): mismo lenguaje que `ui/Medal` (oro/
// plata/bronce sobre su tinte "on-*" oscuro) más un neutro propio para 4º y
// siguientes (no existe medalla más allá del podio). Literales por el mismo
// motivo que el resto de esta tabla: un data-URI no lee `var(--token)`.
const RANK_GOLD_FILL = '#c9a24b' // --medal-gold // design-lint-allow: SVG data-URI, no lee var(--)
const RANK_GOLD_TEXT = '#2a2110' // --medal-on-gold // design-lint-allow: SVG data-URI, no lee var(--)
const RANK_SILVER_FILL = '#a9a39a' // --medal-silver // design-lint-allow: SVG data-URI, no lee var(--)
const RANK_SILVER_TEXT = '#20211f' // --medal-on-silver // design-lint-allow: SVG data-URI, no lee var(--)
const RANK_BRONZE_FILL = '#b07a4e' // --medal-bronze // design-lint-allow: SVG data-URI, no lee var(--)
const RANK_BRONZE_TEXT = '#2a1b0f' // --medal-on-bronze // design-lint-allow: SVG data-URI, no lee var(--)
const RANK_NEUTRAL_FILL = '#575f6c' // --ink-600 // design-lint-allow: SVG data-URI, no lee var(--)
const RANK_NEUTRAL_TEXT = '#ffffff' // design-lint-allow: SVG data-URI, no lee var(--)

function rankColorOf(rank: number): { fill: string; text: string } {
  if (rank === 1) return { fill: RANK_GOLD_FILL, text: RANK_GOLD_TEXT }
  if (rank === 2) return { fill: RANK_SILVER_FILL, text: RANK_SILVER_TEXT }
  if (rank === 3) return { fill: RANK_BRONZE_FILL, text: RANK_BRONZE_TEXT }
  return { fill: RANK_NEUTRAL_FILL, text: RANK_NEUTRAL_TEXT }
}

// Badge de PUESTO (issue #811): mini-disco de ~18px en la esquina sup-derecha
// del pin, ligeramente montado sobre el propio disco (mismo patrón que un
// badge de notificación sobre un avatar). Un anillo blanco lo separa del
// terreno satélite de debajo, igual que el resto de los trazos del pin.
const BADGE_R = 9
const BADGE_RING_W = 1.5
const BADGE_CX = CX + 12
const BADGE_CY = CY - 12

function rankBadgeSvg(rank: number): string {
  const { fill, text } = rankColorOf(rank)
  // Con 10 jugadores el peor puesto es "10": dos cifras no caben legibles a
  // font-size 10 en un disco de 18px, así que se encoge un punto.
  const fontSize = rank >= 10 ? 8 : 10
  return (
    `<circle cx="${BADGE_CX}" cy="${BADGE_CY}" r="${BADGE_R}" fill="${fill}" ` +
    `stroke="${RING_WHITE}" stroke-width="${BADGE_RING_W}"/>` +
    `<text x="${BADGE_CX}" y="${BADGE_CY}" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="sans-serif" font-weight="700" font-size="${fontSize}" fill="${text}">${rank}</text>`
  )
}

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

// `width`/`height` por defecto = `PIN_SIZE` (el pin normal); el pin SELECCIONADO
// (issue #824, ver `avatarPinSvgSelected` más abajo) necesita un lienzo mayor
// para caber el halo de acento sin recortarse, así que los parametrizamos.
function wrapSvg(
  body: string,
  width: number = PIN_SIZE.width,
  height: number = PIN_SIZE.height,
): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">${body}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/**
 * SVG del pin de un ANIMAL del set por defecto (issue #794): disco de tinte
 * teal + el mismo dibujo de línea que `Avatar.tsx` (nunca el emoji crudo) +
 * anillo (blanco, o teal profundo con `ring: 'active'` — el jugador destaca su
 * PROPIO pin entre los del resto, issue #795) + puntita corta.
 * `emoji` debe ser una clave de `ANIMAL_SVGS` (ver `svgForEmoji`); las llamadas
 * de la app siempre pasan por `parseAvatar`/`canonicalEmoji`, que lo garantizan.
 *
 * `rank` (issue #811): puesto del jugador en el reto (1-based, mismo orden que
 * `ChallengeBoard`). Si llega informado, dibuja el badge de puesto en la
 * esquina sup-derecha (oro/plata/bronce/neutro); sin él (null/undefined,
 * p.ej. el pin propio mientras se juega, antes de revelar) no se dibuja nada
 * ahí — el hueco extra de `PIN_SIZE` queda vacío.
 */
export function avatarPinSvg(
  emoji: string,
  ring: 'default' | 'active' = 'default',
  rank?: number | null,
): string {
  const ringColor = ring === 'active' ? RING_ACTIVE : RING_WHITE
  const path = svgForEmoji(emoji) ?? ''
  return wrapSvg(
    tailSvg(ringColor) +
      discSvg(AVATAR_FILL, ringColor) +
      iconGroup(path, AVATAR_ICON) +
      (rank != null ? rankBadgeSvg(rank) : ''),
  )
}

// ── Pin SELECCIONADO (issue #824) ──────────────────────────────────────────
// Al tocar una fila de `ChallengeBoard`, su pin debe "sobresalir" en
// `AllGuessesMap`: halo de acento alrededor del disco (esta variante) + escala
// mayor + z-index por encima (eso lo aplica el LLAMANTE vía `scaledSize`/
// `zIndex` del Marker — Google admite servir un icono a un tamaño distinto del
// intrínseco, así que no hace falta otra copia del SVG solo para "más grande").
//
// `HALO_PAD` amplía el lienzo por los 4 lados para que el halo no se recorte
// contra el borde (el lienzo normal solo tiene margen de sobra para el badge
// de puesto, arriba-derecha). Toda la geometría existente (tail/disc/icono/
// badge) se reutiliza tal cual, solo desplazada `HALO_PAD` px para centrarse
// en el lienzo más grande — nada de recalcular CX/CY a mano.
const HALO_PAD = 7
const HALO_R = DISC_R + RING_W / 2 + 5 // borde del disco + unos px de resplandor
const HALO_COLOR = RING_ACTIVE // mismo acento que el anillo "propio"/"activo"

/** Tamaño del pin SELECCIONADO (issue #824): mayor que `PIN_SIZE` para caber el
 * halo de acento. Úsalo en `scaledSize`/`anchor` del Marker en vez de `PIN_SIZE`
 * cuando el pin esté resaltado — el llamante puede además multiplicarlo por un
 * factor de escala extra (Google escala el icono al tamaño que se le pida). */
export const SELECTED_PIN_SIZE = {
  width: PIN_SIZE.width + HALO_PAD * 2,
  height: PIN_SIZE.height + HALO_PAD * 2,
} as const

/** Ancla del pin SELECCIONADO: la misma punta que `PIN_ANCHOR`, desplazada por
 * el `HALO_PAD` del lienzo mayor. */
export const SELECTED_PIN_ANCHOR = {
  x: PIN_ANCHOR.x + HALO_PAD,
  y: PIN_ANCHOR.y + HALO_PAD,
} as const

/** Origen de la etiqueta de NOMBRE del pin SELECCIONADO: mismo desplazamiento
 * relativo que `PIN_LABEL_ORIGIN` respecto a su ancla, aplicado sobre
 * `SELECTED_PIN_ANCHOR` (el lienzo mayor del halo). El llamante multiplica por
 * `SELECTED_SCALE` igual que ya hace con `SELECTED_PIN_ANCHOR` (Google exige
 * `anchor`/`labelOrigin` en el mismo espacio que `scaledSize`). */
export const SELECTED_PIN_LABEL_ORIGIN = {
  x: SELECTED_PIN_ANCHOR.x,
  y: SELECTED_PIN_ANCHOR.y + 12,
} as const

function haloSvg(): string {
  // Anillo suelto + relleno muy tenue: se lee como un resplandor, no como un
  // segundo disco sólido compitiendo con el propio pin.
  return (
    `<circle cx="${CX}" cy="${CY}" r="${HALO_R}" fill="${HALO_COLOR}" fill-opacity="0.16"/>` +
    `<circle cx="${CX}" cy="${CY}" r="${HALO_R}" fill="none" stroke="${HALO_COLOR}" stroke-width="2.5" stroke-opacity="0.55"/>`
  )
}

/**
 * SVG del pin SELECCIONADO (issue #824): mismo dibujo que `avatarPinSvg` (anillo
 * "active", el mismo acento que el pin propio — seleccionar no compite con
 * "soy yo", ambos leen igual de destacados) más el halo de `haloSvg` detrás,
 * en un lienzo `SELECTED_PIN_SIZE` para que no se recorte.
 */
export function avatarPinSvgSelected(emoji: string, rank?: number | null): string {
  const path = svgForEmoji(emoji) ?? ''
  const body =
    haloSvg() +
    tailSvg(RING_ACTIVE) +
    discSvg(AVATAR_FILL, RING_ACTIVE) +
    iconGroup(path, AVATAR_ICON) +
    (rank != null ? rankBadgeSvg(rank) : '')
  return wrapSvg(
    `<g transform="translate(${HALO_PAD} ${HALO_PAD})">${body}</g>`,
    SELECTED_PIN_SIZE.width,
    SELECTED_PIN_SIZE.height,
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
 *
 * `rank` (issue #811): puesto del jugador en el reto, ver `avatarPinSvg`.
 */
export function avatarPinFromProfile(
  avatarUrl: string | null,
  userId: string,
  own = false,
  rank?: number | null,
): string {
  const resolved = parseAvatar(avatarUrl, userId)
  const emoji = resolved.kind === 'emoji' ? resolved.emoji : defaultEmojiFor(userId)
  return avatarPinSvg(emoji, own ? 'active' : 'default', rank)
}

/** Resuelve un avatar de perfil al pin SELECCIONADO (issue #824), ver
 * `avatarPinSvgSelected`. Mismo criterio de resolución que `avatarPinFromProfile`. */
export function avatarPinFromProfileSelected(
  avatarUrl: string | null,
  userId: string,
  rank?: number | null,
): string {
  const resolved = parseAvatar(avatarUrl, userId)
  const emoji = resolved.kind === 'emoji' ? resolved.emoji : defaultEmojiFor(userId)
  return avatarPinSvgSelected(emoji, rank)
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
