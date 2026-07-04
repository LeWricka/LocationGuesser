// Textura de "mapa nocturno de marca" para el stub de MapLibre (issue #661): sin
// tiles reales (licencia), el contenedor del mapa stubeado quedaba en un lienzo
// liso que las capturas del showcase enseñaban como una zona NEGRA/rota. En vez de
// eso, pintamos un SVG generativo 100% DETERMINISTA — coordenadas fijas, CERO
// `Math.random` — que evoca un mapa de noche: unas curvas de nivel/costa sutiles y
// una masa de "tierra" insinuada. Mismo SVG en cada corrida, así que no rompe
// ninguna captura ni el a11y (es un `background-image` puro — no añade nodos al
// DOM, no toca el árbol de accesibilidad). Vive SOLO en el stub de galería: nunca
// se empaqueta en producción.
//
// Issue #681: esta textura YA NO dibuja la ruta dorada ni el punto de acento. Con
// pines-foto reales repartidos por proyección (ver `maplibre-gl.ts`), una ruta fija
// pintada en un punto arbitrario del lienzo quedaba flotando sin relación con los
// pines de verdad — dos rutas, la decorativa y la real, o una decorativa que no
// tocaba ningún pin. La ruta VIVA ahora la dibuja el propio stub de MapLibre (SVG
// overlay en el DOM) conectando las posiciones proyectadas reales; esta textura
// queda como AMBIENTE de fondo (contorno + tierra), nunca como sustituto de datos
// reales. Los contornos suben de 6% a 11% de luz (feedback del dueño en un panel
// OLED puro: a +6% el mapa se seguía sintiendo casi negro).

const SCENE_BG = '#0b1016' // --scene-bg (tokens.css): mismo fondo de escena que el resto de mapas/placeholders.
// Contorno: --scene-bg + 11 puntos de luz vía `color-mix` — mismo patrón que ya usa
// HomeDashboard.module.css para veladuras atadas al sistema de color (no un literal
// suelto). Sale un azul-pizarra algo más claro que el fondo: textura, no dibujo.
const CONTOUR_STROKE = 'color-mix(in srgb, #0b1016 89%, white 11%)'

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
// El motivo (curvas de nivel + masa de tierra) es EL MISMO de siempre, definido
// UNA vez con sus coordenadas originales (relativas a un lienzo de 300px de alto)
// y repetido en 3 bandas verticales vía `<g transform="translate(0, Y)">` — así
// ningún recorte dentro del lienzo de 900px deja una banda vacía/lisa, sin tener
// que recalcular a mano ninguna coordenada. Solo la banda CENTRAL lleva la masa de
// tierra: es la única que puede caer bajo los pines (issue #681: la ruta y el
// punto de acento que vivían aquí se retiraron — el stub de MapLibre dibuja ahora
// la ruta real conectando los pines proyectados, ver `maplibre-gl.ts`).
//
// `vector-effect="non-scaling-stroke"` en cada trazo (issue #673): red de
// seguridad ADICIONAL al lienzo más alto — si algún contenedor futuro cae en un
// ratio aún más extremo que el previsto aquí, el grosor de las curvas de nivel se
// mantiene constante en vez de escalar con `cover` (el relleno de la masa de
// tierra sí escala con el lienzo: es una forma, no un trazo fino, y escalar un
// poco no la desfigura).
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
  </g>
  <g transform="translate(0, 600)">${CONTOUR_LINES}</g>
</svg>
`.trim()

/** Data-URI lista para `background-image`. Calculada una vez al importar (módulo
 * puro, sin estado): el mismo string en cada carga de la galería. */
export const NIGHT_MAP_TEXTURE_URL = `data:image/svg+xml,${encodeURIComponent(NIGHT_MAP_SVG)}`
