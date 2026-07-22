import { useId } from 'react'
import styles from './ShareCardScenes.module.css'

// Fondos de marca para el placeholder "SIN FOTO" de las tarjetas-imagen de
// compartir (issue #880): `ChallengeShareCard` (reto de ubicación → GLOBO, reto
// de número → OBTURADOR) y `TripInviteCard` (siempre OBTURADOR: el globo solo
// tiene sentido para "adivina DÓNDE", no aplica a invitar al viaje ni a un reto
// de número). Decisión de diseño ya tomada por el fundador, no una propuesta.
//
// RESTRICCIÓN DURA: estas tarjetas se rasterizan en cliente con html-to-image
// (`nodeToPngBlob`), que NO rasteriza bien `filter` (feGaussianBlur/glow) ni
// `<canvas>` — ver el comentario de `ChallengeShareCard`. Por eso todo el brillo
// de aquí sale de strokes + gradients + opacity, NUNCA de `filter`: el halo del
// núcleo del obturador, por ejemplo, es un círculo relleno con un radialGradient
// que ya se apaga a transparente, no un blur encima de un círculo sólido.
//
// Paleta: casi todo sale de los tokens de escena/acento (`--scene-*`, `--accent*`,
// `--route-gold*`). Los stops que SÍ son hex crudo reproducen tal cual la paleta
// fija del mark "Cometa" (`LogoMomentu`, issue #865) o la esfera nocturna bespoke
// del prototipo aprobado — no son tokens de tema, son geometría/color de marca
// fijados por diseño, igual que ya hace `LogoMomentu`.
const VANE_STOPS = ['#3fd0c1', '#0f766e', '#c79a45', '#e6c46e'] as const // design-lint-allow: paleta fija del mark "Cometa" (issue #865), igual que LogoMomentu
const CORE_STOPS = ['#aef5ec', '#14b8a6', '#0f766e'] as const // design-lint-allow: paleta fija del mark "Cometa" (issue #865), igual que LogoMomentu
const TRAIL_STOPS = ['#2dd4bf', '#7fe6da', '#e9c877', '#d9b25a'] as const // design-lint-allow: paleta fija del mark "Cometa" (issue #865), igual que LogoMomentu
const HEAD_HIGHLIGHT = '#c8fff5' // design-lint-allow: paleta fija del mark "Cometa" (issue #865), igual que LogoMomentu
const ROUTE_GOLD_LIGHT = '#e6c46e' // design-lint-allow: mismo oro del mark "Cometa" (issue #865), reutilizado en la ruta del globo
const ROUTE_GOLD_DEEP = '#c79a45' // design-lint-allow: mismo oro del mark "Cometa" (issue #865), reutilizado en la ruta del globo
// La esfera nocturna (bespoke, sin token — ver comentario de arriba) vive como
// hex crudo en `ShareCardScenes.module.css` (`.globeBg`), no aquí: es un
// `background` en CSS, no geometría SVG que este componente necesite tocar.

/**
 * Fondo GLOBO (reto de UBICACIÓN sin foto propia ni portada del viaje): esfera
 * nocturna de alambre (meridianos/paralelos) con una ruta dorada punteada hacia
 * un destino teal con anillos de sónar — "hay un lugar del mundo escondido,
 * encuéntralo". Poster vertical fijo 1080×1350 (mismo lienzo que las tarjetas).
 */
export function ShareCardGlobeScene() {
  const uid = useId()
  const clipId = `scg-clip-${uid}`
  const routeId = `scg-route-${uid}`

  return (
    <div className={styles.globeScene} aria-hidden="true">
      <div className={styles.globeBg} />
      <svg
        className={styles.layer}
        viewBox="0 0 1080 1350"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <defs>
          <clipPath id={clipId}>
            <circle cx="540" cy="520" r="430" />
          </clipPath>
          <linearGradient id={routeId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={ROUTE_GOLD_LIGHT} />
            <stop offset="1" stopColor={ROUTE_GOLD_DEEP} />
          </linearGradient>
        </defs>
        {/* meridianos y paralelos: el alambre de la esfera */}
        <g
          clipPath={`url(#${clipId})`}
          stroke="var(--scene-hairline)"
          strokeWidth="1.6"
          fill="none"
        >
          <ellipse cx="540" cy="520" rx="430" ry="120" />
          <ellipse cx="540" cy="520" rx="430" ry="250" />
          <ellipse cx="540" cy="520" rx="430" ry="380" />
          <line x1="110" y1="520" x2="970" y2="520" />
          <ellipse cx="540" cy="520" rx="120" ry="430" />
          <ellipse cx="540" cy="520" rx="250" ry="430" />
          <ellipse cx="540" cy="520" rx="380" ry="430" />
          <line x1="540" y1="90" x2="540" y2="950" />
        </g>
        {/* aro de dashes: eco de ruta, mismo lenguaje que LogoMomentu */}
        <circle
          cx="540"
          cy="520"
          r="430"
          stroke="var(--route-gold-soft)"
          strokeWidth="2"
          strokeDasharray="2 12"
        />
        {/* ruta dorada punteada hacia el destino */}
        <path
          d="M300 700 Q470 560 620 470 T760 400"
          stroke={`url(#${routeId})`}
          strokeWidth="5"
          strokeDasharray="4 16"
          strokeLinecap="round"
          opacity="0.9"
        />
      </svg>
      {/* halo del destino: radial-gradient que ya se apaga solo (sin blur) */}
      <div className={styles.globeGlow} />
      <svg className={styles.layer} viewBox="0 0 1080 1350" fill="none">
        {/* destino: anillos de sónar + núcleo teal ("adivina dónde") */}
        <circle
          cx="672"
          cy="459"
          r="70"
          stroke="var(--accent)"
          strokeOpacity="0.4"
          strokeWidth="2"
        />
        <circle
          cx="672"
          cy="459"
          r="44"
          stroke="var(--accent)"
          strokeOpacity="0.6"
          strokeWidth="2.5"
        />
        <circle cx="672" cy="459" r="20" fill="var(--accent)" />
        <circle cx="672" cy="459" r="8" fill={HEAD_HIGHLIGHT} />
      </svg>
    </div>
  )
}

/**
 * Fondo OBTURADOR (reto de NÚMERO sin foto, e invitación al viaje sin portada:
 * el globo no aplica a ninguno de los dos). El mark de marca `LogoMomentu`
 * escalado grande como motivo héroe, sobre una escena teal→grafito con una
 * estela de luz de larga exposición cruzándola. La marca ES la imagen.
 *
 * A diferencia de `LogoMomentu` (que usa `filter` para su glow en tamaño
 * pequeño — aceptable ahí, el lockup de la cabecera), este héroe reconstruye
 * la MISMA geometría sin ningún `filter`: el brillo del núcleo y de la cabeza
 * de luz sale de círculos rellenos con radialGradient que ya se apagan a
 * transparente, no de un blur encima.
 */
export function ShareCardObturadorScene() {
  const uid = useId()
  const trailId = `sco-trail-${uid}`
  const vaneId = `sco-vane-${uid}`
  const coreId = `sco-core-${uid}`
  const haloId = `sco-halo-${uid}`
  const headId = `sco-head-${uid}`

  return (
    <div className={styles.obturadorScene} aria-hidden="true">
      <div className={styles.obturadorBg} />
      <svg className={styles.layer} viewBox="0 0 1080 1350" fill="none">
        <defs>
          <linearGradient id={trailId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={TRAIL_STOPS[0]} stopOpacity="0" />
            <stop offset="0.4" stopColor={TRAIL_STOPS[1]} stopOpacity="0.5" />
            <stop offset="0.7" stopColor={TRAIL_STOPS[2]} stopOpacity="0.6" />
            <stop offset="1" stopColor={TRAIL_STOPS[3]} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* estela de luz cruzando la escena (larga exposición), detrás del mark */}
        <path
          d="M-40 260 Q400 120 760 420 T1160 560"
          stroke={`url(#${trailId})`}
          strokeWidth="6"
          strokeLinecap="round"
          opacity="0.7"
        />
        <path
          d="M-40 900 Q380 980 720 760 T1160 700"
          stroke={`url(#${trailId})`}
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.4"
        />
      </svg>

      <svg className={styles.heroMark} viewBox="0 0 100 100" fill="none">
        <defs>
          <radialGradient id={vaneId} gradientUnits="userSpaceOnUse" cx="50" cy="50" r="40">
            <stop offset="0" stopColor={VANE_STOPS[0]} />
            <stop offset="0.3" stopColor={VANE_STOPS[1]} />
            <stop offset="0.62" stopColor={VANE_STOPS[2]} />
            <stop offset="1" stopColor={VANE_STOPS[3]} />
          </radialGradient>
          <radialGradient id={coreId} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor={CORE_STOPS[0]} />
            <stop offset="0.5" stopColor={CORE_STOPS[1]} />
            <stop offset="1" stopColor={CORE_STOPS[2]} />
          </radialGradient>
          {/* halo del núcleo: gradiente que se apaga a transparente, sin blur */}
          <radialGradient id={haloId} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor={CORE_STOPS[1]} stopOpacity="0.55" />
            <stop offset="1" stopColor={CORE_STOPS[1]} stopOpacity="0" />
          </radialGradient>
          {/* cabeza de luz: mismo truco, gradiente radial ya difuso */}
          <radialGradient id={headId} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor={HEAD_HIGHLIGHT} stopOpacity="0.95" />
            <stop offset="1" stopColor={HEAD_HIGHLIGHT} stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle
          cx="50"
          cy="50"
          r="43"
          stroke="var(--route-gold)"
          strokeWidth="1.3"
          strokeDasharray="1.2 7"
          strokeLinecap="round"
          opacity="0.6"
        />

        {/* halo del núcleo, simulado con gradiente (no filter) */}
        <circle cx="50" cy="50" r="17" fill={`url(#${haloId})`} />

        {/* 6 palas monoline en giro, gradiente oro→teal */}
        <g stroke={`url(#${vaneId})`} strokeWidth="3.4" strokeLinecap="round" opacity="0.82">
          <line x1="58" y1="19" x2="44.5" y2="40" />
          <line x1="58" y1="19" x2="44.5" y2="40" transform="rotate(60 50 50)" />
          <line x1="58" y1="19" x2="44.5" y2="40" transform="rotate(120 50 50)" />
          <line x1="58" y1="19" x2="44.5" y2="40" transform="rotate(180 50 50)" />
          <line x1="58" y1="19" x2="44.5" y2="40" transform="rotate(240 50 50)" />
          <line x1="58" y1="19" x2="44.5" y2="40" transform="rotate(300 50 50)" />
        </g>

        {/* estela de luz (protagonista), ~306°: solo el trazo nítido, sin capa borrosa */}
        <path
          d="M67.25 16.14 A38 38 0 1 1 32.75 16.14"
          stroke={`url(#${trailId})`}
          strokeWidth="3.2"
          strokeLinecap="round"
          opacity="0.95"
        />

        {/* cabeza de luz: halo por gradiente + punto nítido encima */}
        <circle cx="32.75" cy="16.14" r="6.5" fill={`url(#${headId})`} />
        <circle cx="32.75" cy="16.14" r="2.2" fill={HEAD_HIGHLIGHT} />

        {/* núcleo teal luminoso: el momento */}
        <circle cx="50" cy="50" r="5.8" fill={`url(#${coreId})`} />
        <circle cx="50" cy="50" r="2.3" fill={HEAD_HIGHLIGHT} />
      </svg>
    </div>
  )
}
