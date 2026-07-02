/**
 * MockupIcons — custom brand icon set for LocationGuesser mockups.
 *
 * Visual language: rounded joins/caps, stroke-width 1.8, 24×24 viewBox.
 * Main color: `currentColor` (caller sets via CSS `color`).
 * Amber accent: `var(--mk-accent)` — only where it adds brand character.
 */

interface Props {
  size?: number
  className?: string
}

// ─── 1. IconPin ──────────────────────────────────────────────────────────────

export function IconPin({ size = 24, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Teardrop body */}
      <path
        d="M12 2C8.686 2 6 4.686 6 8c0 4.5 6 13 6 13s6-8.5 6-13c0-3.314-2.686-6-6-6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* Inner accent dot */}
      <circle cx="12" cy="8" r="2" fill="var(--mk-accent)" />
    </svg>
  )
}

// ─── 2. IconGlobe ─────────────────────────────────────────────────────────────

export function IconGlobe({ size = 24, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Globe outline */}
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      {/* Latitude lines */}
      <path
        d="M3 12h18M3.5 8h17M3.5 16h17"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* Longitude lines (meridians) */}
      <path
        d="M12 3c-2.5 2.5-3.5 5.5-3.5 9s1 6.5 3.5 9M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* Accent location marker on globe surface */}
      <circle cx="15.5" cy="7.5" r="2" fill="var(--mk-accent)" />
      <circle cx="15.5" cy="7.5" r="0.8" fill="currentColor" />
    </svg>
  )
}

// ─── 3. IconDiana ─────────────────────────────────────────────────────────────

export function IconDiana({ size = 24, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Outer ring */}
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      {/* Middle ring */}
      <circle cx="12" cy="12" r="5.5" stroke="currentColor" strokeWidth="1.4" />
      {/* Crosshair top/bottom */}
      <line
        x1="12"
        y1="2"
        x2="12"
        y2="6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <line
        x1="12"
        y1="18"
        x2="12"
        y2="22"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* Crosshair left/right */}
      <line
        x1="2"
        y1="12"
        x2="6"
        y2="12"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <line
        x1="18"
        y1="12"
        x2="22"
        y2="12"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* Accent bull center */}
      <circle cx="12" cy="12" r="2.2" fill="var(--mk-accent)" />
    </svg>
  )
}

// ─── 4. IconTrofeo ───────────────────────────────────────────────────────────

export function IconTrofeo({ size = 24, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Trophy bowl */}
      <path
        d="M7 3h10v7a5 5 0 0 1-10 0V3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* Handles */}
      <path
        d="M7 5H5a2 2 0 0 0 0 4h2M17 5h2a2 2 0 0 0 0 4h-2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Stem */}
      <path d="M12 15v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* Base */}
      <path d="M8 21h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* Accent star highlight in bowl */}
      <path
        d="M12 6l.75 2h2l-1.6 1.2.6 2-1.75-1.2L10.25 11.2l.6-2L9.25 8h2L12 6Z"
        fill="var(--mk-accent)"
      />
    </svg>
  )
}

// ─── 5. IconCamara ───────────────────────────────────────────────────────────

export function IconCamara({ size = 24, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Camera body */}
      <rect
        x="2"
        y="7"
        width="20"
        height="14"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* Viewfinder bump */}
      <path
        d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Lens ring */}
      <circle cx="12" cy="14" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      {/* Accent lens inner */}
      <circle cx="12" cy="14" r="1.6" fill="var(--mk-accent)" />
      {/* Flash dot */}
      <circle cx="18.5" cy="10.5" r="0.9" fill="currentColor" />
    </svg>
  )
}

// ─── 6. IconReto ─────────────────────────────────────────────────────────────

export function IconReto({ size = 24, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Pin teardrop */}
      <path
        d="M12 2C8.686 2 6 4.686 6 8c0 4.5 6 13 6 13s6-8.5 6-13c0-3.314-2.686-6-6-6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* Inner target ring */}
      <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.2" />
      {/* Accent center bull */}
      <circle cx="12" cy="8" r="1.4" fill="var(--mk-accent)" />
    </svg>
  )
}

// ─── 7. IconMedalla ──────────────────────────────────────────────────────────

interface MedallaProps extends Props {
  rank?: 1 | 2 | 3
}

export function IconMedalla({ size = 24, className, rank }: MedallaProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
      data-rank={rank}
    >
      {/* Ribbon left */}
      <path d="M9 3L7 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* Ribbon right */}
      <path d="M15 3L17 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* Ribbon connector top */}
      <path d="M9 3h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* Medal circle */}
      <circle cx="12" cy="15" r="6" stroke="currentColor" strokeWidth="1.8" />
      {/* Medal inner ring */}
      <circle cx="12" cy="15" r="3.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

// ─── 8. IconCandado ──────────────────────────────────────────────────────────

export function IconCandado({ size = 24, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Lock body */}
      <rect
        x="4"
        y="11"
        width="16"
        height="11"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* Shackle */}
      <path
        d="M8 11V7a4 4 0 0 1 8 0v4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Keyhole accent */}
      <circle cx="12" cy="16" r="1.5" fill="var(--mk-accent)" />
      <path d="M12 17.5v1.5" stroke="var(--mk-accent)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

// ─── 9. IconConfeti ──────────────────────────────────────────────────────────

export function IconConfeti({ size = 24, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Party popper cone */}
      <path d="M3 21L10.5 13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M3 21l6-.5-5.5-5.5L3 21Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.15"
      />
      {/* Confetti pieces — currentColor */}
      <rect
        x="13"
        y="2"
        width="2"
        height="2"
        rx="0.4"
        fill="currentColor"
        transform="rotate(20 13 2)"
      />
      <rect
        x="18"
        y="6"
        width="2"
        height="2"
        rx="0.4"
        fill="currentColor"
        transform="rotate(-15 18 6)"
      />
      <circle cx="11" cy="6" r="1" fill="currentColor" />
      {/* Confetti pieces — accent */}
      <rect
        x="16"
        y="2"
        width="2"
        height="2"
        rx="0.4"
        fill="var(--mk-accent)"
        transform="rotate(-30 16 2)"
      />
      <rect
        x="20"
        y="10"
        width="2"
        height="2"
        rx="0.4"
        fill="var(--mk-accent)"
        transform="rotate(25 20 10)"
      />
      <circle cx="14" cy="9" r="1" fill="var(--mk-accent)" />
      {/* Streamers */}
      <path d="M12 13c1-2 4-3 5-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path
        d="M14 15c2-1 4-1 5-3"
        stroke="var(--mk-accent)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

// ─── 10. IconGps ─────────────────────────────────────────────────────────────

export function IconGps({ size = 24, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Outer circle */}
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
      {/* Crosshair arms — stop short of center to let dot breathe */}
      <line
        x1="12"
        y1="2"
        x2="12"
        y2="7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line
        x1="12"
        y1="17"
        x2="12"
        y2="22"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line
        x1="2"
        y1="12"
        x2="7"
        y2="12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line
        x1="17"
        y1="12"
        x2="22"
        y2="12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* Inner ring */}
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.4" />
      {/* Accent center dot */}
      <circle cx="12" cy="12" r="1.5" fill="var(--mk-accent)" />
    </svg>
  )
}
