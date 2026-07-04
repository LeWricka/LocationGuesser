// Textura de "mapa nocturno de marca" para el stub de MapLibre (issue #661): sin
// tiles reales (licencia), el contenedor del mapa stubeado quedaba en un lienzo
// liso que las capturas del showcase enseñaban como una zona NEGRA/rota. En vez de
// eso, pintamos un SVG generativo 100% DETERMINISTA — coordenadas fijas, CERO
// `Math.random` — que evoca un mapa de noche: unas curvas de nivel/costa sutiles,
// una masa de "tierra" insinuada y la ruta punteada dorada del logo, rematada en un
// punto teal. Mismo SVG en cada corrida, así que no rompe ninguna captura ni el a11y
// (es un `background-image` puro — no añade nodos al DOM, no toca el árbol de
// accesibilidad). Vive SOLO en el stub de galería: nunca se empaqueta en producción.

const SCENE_BG = '#0b1016' // --scene-bg (tokens.css): mismo fondo de escena que el resto de mapas/placeholders.
// Contorno: --scene-bg + 6 puntos de luz vía `color-mix` — mismo patrón que ya usa
// HomeDashboard.module.css para veladuras atadas al sistema de color (no un literal
// suelto). Sale un azul-pizarra apenas más claro que el fondo: textura, no dibujo.
const CONTOUR_STROKE = 'color-mix(in srgb, #0b1016 94%, white 6%)'
const ROUTE_GOLD = '#D9B96A' // hilo del logo / --route-gold: el recorrido "vivo".
const ACCENT_TEAL = '#0F766E' // --accent: teal de marca, solo en el remate de la ruta.

// Lienzo 400×900 (issue #673, antes 400×300 / 4:3). `background-size: cover`
// escala TODO el lienzo por el mismo factor para llenar el contenedor (el navegador
// solo recorta lo que sobra, nunca deforma proporciones) — con un lienzo apaisado
// (4:3) sobre un contenedor MUY vertical (el globo a sangre de la home logueada,
// ~390×844, ratio ≈0.46), ese factor de escala se disparaba (~2.8×) y la ruta
// dorada, que solo ocupaba una franja estrecha del centro, salía recortada casi
// entera: apenas un tramo casi recto y con el trazo 2.8× más grueso — la "viga"
// que reportó el dueño. Un lienzo con ratio (400/900 ≈ 0.44) ya cercano al de un
// móvil a sangre mantiene ese factor cerca de 1× en el caso extremo, sin dejar de
// funcionar en contenedores más apaisados (globo de 320px de Landing, ~1.2:1):
// ahí el factor sigue ≈1×, solo se ve una franja centrada más estrecha del
// lienzo, que trae su propio motivo de curvas (ver las 3 BANDAS más abajo).
//
// El motivo (curvas de nivel + masa de tierra + ruta + punto) es EL MISMO de
// siempre, definido UNA vez con sus coordenadas originales (relativas a un
// lienzo de 300px de alto) y repetido en 3 bandas verticales vía `<g
// transform="translate(0, Y)">` — así ningún recorte dentro del lienzo de 900px
// deja una banda vacía/lisa, sin tener que recalcular a mano ninguna coordenada.
// Solo la banda CENTRAL lleva la masa de tierra + la ruta + el punto: es la única
// que puede caer bajo los pines, y su convergencia en (200,150) local + el
// translate(0,300) de su banda cae en (200,450) — el CENTRO EXACTO del lienzo de
// 900px, donde `Marker.addTo` (ver maplibre-gl.ts) clava CUALQUIER pin (`left:
// 50%; top: 50%; transform: translate(-50%, -100%)`, sin proyección real):
// `background-position: center` mantiene ese punto fijo en el centro del
// contenedor pase lo que pase con el recorte, así que el trazo siempre "llega".
//
// `vector-effect="non-scaling-stroke"` en cada trazo (issue #673): red de
// seguridad ADICIONAL al lienzo más alto — si algún contenedor futuro cae en un
// ratio aún más extremo que el previsto aquí, el grosor de las curvas y de la
// ruta se mantiene constante en vez de escalar con `cover` (el relleno de la
// masa de tierra y los puntos de acento sí escalan con el lienzo: son formas, no
// trazos finos, y escalar un poco no los desfigura).
const CONTOUR_LINES = `
  <path d="M-10,58 C60,36 120,78 200,52 C280,26 342,66 410,44" stroke="${CONTOUR_STROKE}" stroke-width="1" vector-effect="non-scaling-stroke" fill="none" opacity="0.7"/>
  <path d="M-10,112 C55,92 118,128 196,104 C270,82 336,118 410,98" stroke="${CONTOUR_STROKE}" stroke-width="1" vector-effect="non-scaling-stroke" fill="none" opacity="0.6"/>
  <path d="M-10,168 C58,150 116,182 198,160 C268,140 334,172 410,152" stroke="${CONTOUR_STROKE}" stroke-width="1" vector-effect="non-scaling-stroke" fill="none" opacity="0.55"/>
  <path d="M-10,208 C40,190 72,222 112,200 C152,178 170,142 216,152" stroke="${CONTOUR_STROKE}" stroke-width="1" vector-effect="non-scaling-stroke" fill="none" opacity="0.5"/>
`

const NIGHT_MAP_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 900" preserveAspectRatio="xMidYMid slice">
  <rect width="400" height="900" fill="${SCENE_BG}"/>
  <g transform="translate(0, 0)">${CONTOUR_LINES}</g>
  <g transform="translate(0, 300)">
    ${CONTOUR_LINES}
    <path d="M-10,300 L-10,205 C35,180 65,215 108,192 C150,170 168,132 214,145 C238,152 240,182 222,205 C198,236 188,272 148,300 Z" fill="rgba(255,255,255,0.045)"/>
    <path d="M368,42 C330,70 302,60 262,94 C232,118 220,134 200,150" stroke="${ROUTE_GOLD}" stroke-width="1.75" vector-effect="non-scaling-stroke" stroke-dasharray="5 4" stroke-linecap="round" fill="none" opacity="0.9"/>
    <circle cx="368" cy="42" r="8" fill="${ACCENT_TEAL}" opacity="0.22"/>
    <circle cx="368" cy="42" r="3.5" fill="${ACCENT_TEAL}"/>
  </g>
  <g transform="translate(0, 600)">${CONTOUR_LINES}</g>
</svg>
`.trim()

/** Data-URI lista para `background-image`. Calculada una vez al importar (módulo
 * puro, sin estado): el mismo string en cada carga de la galería. */
export const NIGHT_MAP_TEXTURE_URL = `data:image/svg+xml,${encodeURIComponent(NIGHT_MAP_SVG)}`
