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

// Lienzo 400×300 (4:3), pensado para `background-size: cover` — el navegador
// recorta sobrando, así que las curvas se extienden más allá de los bordes
// (de -10 a 410) para que ningún recorte deje un canto vertical limpio y delator.
//
// Las 4 curvas de nivel son bezier suaves a distinta altura/amplitud (coordenadas
// fijas, "semilla" en el sentido de constante reproducible, no de PRNG). La masa de
// tierra es un blob translúcido que seguiría aprox. la 4ª curva, insinuando costa.
// La ruta dorada converge en (200,150) — el CENTRO exacto del lienzo: es ahí donde
// `Marker.addTo` (ver maplibre-gl.ts) clava CUALQUIER pin (`left: 50%; top: 50%;
// transform: translate(-50%, -100%)`, sin proyección real), así que el trazo
// siempre "llega" al racimo de pines-foto del caso, sea cual sea.
const NIGHT_MAP_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
  <rect width="400" height="300" fill="${SCENE_BG}"/>
  <path d="M-10,300 L-10,205 C35,180 65,215 108,192 C150,170 168,132 214,145 C238,152 240,182 222,205 C198,236 188,272 148,300 Z" fill="rgba(255,255,255,0.045)"/>
  <path d="M-10,58 C60,36 120,78 200,52 C280,26 342,66 410,44" stroke="${CONTOUR_STROKE}" stroke-width="1" fill="none" opacity="0.7"/>
  <path d="M-10,112 C55,92 118,128 196,104 C270,82 336,118 410,98" stroke="${CONTOUR_STROKE}" stroke-width="1" fill="none" opacity="0.6"/>
  <path d="M-10,168 C58,150 116,182 198,160 C268,140 334,172 410,152" stroke="${CONTOUR_STROKE}" stroke-width="1" fill="none" opacity="0.55"/>
  <path d="M-10,208 C40,190 72,222 112,200 C152,178 170,142 216,152" stroke="${CONTOUR_STROKE}" stroke-width="1" fill="none" opacity="0.5"/>
  <path d="M368,42 C330,70 302,60 262,94 C232,118 220,134 200,150" stroke="${ROUTE_GOLD}" stroke-width="1.75" stroke-dasharray="5 4" stroke-linecap="round" fill="none" opacity="0.9"/>
  <circle cx="368" cy="42" r="8" fill="${ACCENT_TEAL}" opacity="0.22"/>
  <circle cx="368" cy="42" r="3.5" fill="${ACCENT_TEAL}"/>
</svg>
`.trim()

/** Data-URI lista para `background-image`. Calculada una vez al importar (módulo
 * puro, sin estado): el mismo string en cada carga de la galería. */
export const NIGHT_MAP_TEXTURE_URL = `data:image/svg+xml,${encodeURIComponent(NIGHT_MAP_SVG)}`
