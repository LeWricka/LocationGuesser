// LogoMomentu — símbolo de marca "Cometa" (Final 1, issue #865): un obturador de 6
// palas en gradiente oro→teal con una estela de luz de larga exposición que recorre
// ~306° del iris y un núcleo teal luminoso ("el momento"). Reemplaza el mark anterior
// "el camino dentro del pin" (LogoTabide/LogoMomentu original, issue #538).
//
// Geometría y paleta vienen fijadas por diseño (propuesta "Final 1 / Cometa"): se usan
// TAL CUAL, sin reinterpretar el trazo — igual que el mark anterior. A diferencia de
// aquel, este símbolo es agnóstico de fondo (los gradientes ya contrastan tanto sobre
// papel/claro como sobre la escena oscura del globo): no hace falta variante
// `claro`/`oscuro`. Solo `mono` (alfa-only, `currentColor`) para contextos de una sola
// tinta (chips, badges).

import { useId } from 'react'

type Variant = 'color' | 'mono'

interface Props {
  /**
   * `color`: gradiente de marca oro→teal (por defecto, para casi todos los usos).
   * `mono`: todo hereda `currentColor` — para contextos de un solo tono.
   */
  variant?: Variant
  size?: number
  className?: string
  /** Texto accesible del símbolo. */
  title?: string
}

// Paleta fija del mark "Cometa" (issue #865, propuesta aprobada tal cual). No son
// tokens de UI (no cambian con el tema claro/oscuro): por eso viven aquí y no en
// tokens.css, igual que la paleta del mark anterior.
const VANE_STOPS = ['#3fd0c1', '#0f766e', '#c79a45', '#e6c46e'] as const // design-lint-allow: paleta fija del mark "Cometa" (issue #865), geometría aprobada tal cual
const CORE_STOPS = ['#aef5ec', '#14b8a6', '#0f766e'] as const // design-lint-allow: paleta fija del mark "Cometa" (issue #865), geometría aprobada tal cual
const TRAIL_STOPS = ['#2dd4bf', '#7fe6da', '#e9c877', '#d9b25a'] as const // design-lint-allow: paleta fija del mark "Cometa" (issue #865), geometría aprobada tal cual
const RING_COLOR = '#d9b25a' // design-lint-allow: paleta fija del mark "Cometa" (issue #865), geometría aprobada tal cual
const CORE_HALO_COLOR = '#0f766e' // design-lint-allow: paleta fija del mark "Cometa" (issue #865), geometría aprobada tal cual
const HEAD_OUTER_COLOR = '#c8fff5' // design-lint-allow: paleta fija del mark "Cometa" (issue #865), geometría aprobada tal cual
const HEAD_INNER_COLOR = '#eafffb' // design-lint-allow: paleta fija del mark "Cometa" (issue #865), geometría aprobada tal cual

export function LogoMomentu({ variant = 'color', size = 32, className, title = 'Momentu' }: Props) {
  // IDs únicos por instancia: evita colisiones de <defs> si el símbolo se monta
  // más de una vez en la misma página (gradientes/filtros son globales al documento).
  const uid = useId()
  const vaneId = `lm-vane-${uid}`
  const coreId = `lm-core-${uid}`
  const trailId = `lm-trail-${uid}`
  const glowId = `lm-glow-${uid}`
  const headId = `lm-head-${uid}`

  if (variant === 'mono') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        className={className}
        role="img"
        aria-label={title}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g fill="currentColor" stroke="currentColor">
          <circle
            cx="50"
            cy="50"
            r="43"
            fill="none"
            strokeWidth="1.3"
            strokeDasharray="1.2 7"
            strokeLinecap="round"
            opacity="0.7"
          />
          <g strokeWidth="3.2" strokeLinecap="round">
            <line x1="58" y1="19" x2="44.5" y2="40" />
            <line x1="58" y1="19" x2="44.5" y2="40" transform="rotate(60 50 50)" />
            <line x1="58" y1="19" x2="44.5" y2="40" transform="rotate(120 50 50)" />
            <line x1="58" y1="19" x2="44.5" y2="40" transform="rotate(180 50 50)" />
            <line x1="58" y1="19" x2="44.5" y2="40" transform="rotate(240 50 50)" />
            <line x1="58" y1="19" x2="44.5" y2="40" transform="rotate(300 50 50)" />
          </g>
          <path
            d="M67.25 16.14 A38 38 0 1 1 32.75 16.14"
            fill="none"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <circle cx="32.75" cy="16.14" r="3.1" stroke="none" />
          <circle cx="50" cy="50" r="5.2" stroke="none" />
        </g>
      </svg>
    )
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={title}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
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
        <linearGradient id={trailId} gradientUnits="userSpaceOnUse" x1="20" y1="12" x2="82" y2="88">
          <stop offset="0" stopColor={TRAIL_STOPS[0]} />
          <stop offset="0.4" stopColor={TRAIL_STOPS[1]} />
          <stop offset="0.72" stopColor={TRAIL_STOPS[2]} />
          <stop offset="1" stopColor={TRAIL_STOPS[3]} />
        </linearGradient>
        <filter id={glowId} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="2.3" />
        </filter>
        <filter id={headId} x="-300%" y="-300%" width="700%" height="700%">
          <feGaussianBlur stdDeviation="2.6" />
        </filter>
      </defs>

      {/* aro de dashes: ecos de ruta */}
      <circle
        cx="50"
        cy="50"
        r="43"
        stroke={RING_COLOR}
        strokeWidth="1.3"
        strokeDasharray="1.2 7"
        strokeLinecap="round"
        opacity="0.6"
      />

      {/* halo del núcleo */}
      <circle
        cx="50"
        cy="50"
        r="12"
        fill={CORE_HALO_COLOR}
        opacity="0.24"
        filter={`url(#${glowId})`}
      />

      {/* 6 palas monoline en giro, gradiente oro→teal */}
      <g stroke={`url(#${vaneId})`} strokeWidth="3.4" strokeLinecap="round" opacity="0.82">
        <line x1="58" y1="19" x2="44.5" y2="40" />
        <line x1="58" y1="19" x2="44.5" y2="40" transform="rotate(60 50 50)" />
        <line x1="58" y1="19" x2="44.5" y2="40" transform="rotate(120 50 50)" />
        <line x1="58" y1="19" x2="44.5" y2="40" transform="rotate(180 50 50)" />
        <line x1="58" y1="19" x2="44.5" y2="40" transform="rotate(240 50 50)" />
        <line x1="58" y1="19" x2="44.5" y2="40" transform="rotate(300 50 50)" />
      </g>

      {/* estela de luz (protagonista): glow + trazo nítido, ~306° */}
      <path
        d="M67.25 16.14 A38 38 0 1 1 32.75 16.14"
        stroke={`url(#${trailId})`}
        strokeWidth="3.6"
        strokeLinecap="round"
        filter={`url(#${glowId})`}
        opacity="0.85"
      />
      <path
        d="M67.25 16.14 A38 38 0 1 1 32.75 16.14"
        stroke={`url(#${trailId})`}
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* cabeza de luz (pincel) en el extremo */}
      <g>
        <circle
          cx="32.75"
          cy="16.14"
          r="4.6"
          fill={HEAD_OUTER_COLOR}
          filter={`url(#${headId})`}
          opacity="0.9"
        />
        <circle cx="32.75" cy="16.14" r="1.9" fill={HEAD_INNER_COLOR} />
      </g>

      {/* núcleo teal luminoso: el momento */}
      <circle cx="50" cy="50" r="5.8" fill={`url(#${coreId})`} />
      <circle cx="50" cy="50" r="2.3" fill={HEAD_INNER_COLOR} />
    </svg>
  )
}
