import { useEffect, useRef } from 'react'
import { useReducedMotion } from '../../ui'
import styles from './RevealBurst.module.css'

interface Props {
  /** Solo dispara la celebración cuando es true (p.ej. acierto muy cercano). */
  active: boolean
}

// Microfeedback de acierto cercano: un destello sobrio de confeti (unas pocas
// piezas cálidas que caen) más un háptico corto en móvil. El padre decide cuándo
// procede (gran tiro). Sobrio, no cargante.
//
// Accesibilidad: bajo prefers-reduced-motion NO renderiza el confeti NI vibra
// (el movimiento puede marear; el háptico también es movimiento). El logro ya se
// comunica por el anillo, el titular "¡Gran tiro!" y el count-up.
const PIECES = 14

export function RevealBurst({ active }: Props) {
  const reduced = useReducedMotion()
  // El háptico se dispara una sola vez por activación (no en cada render).
  const vibrated = useRef(false)

  useEffect(() => {
    if (!active || reduced) return
    if (vibrated.current) return
    vibrated.current = true
    // Háptico corto en móvil (patrón celebratorio de tres toques). No-op donde no
    // exista la API (escritorio, navegadores sin soporte); try/catch porque algún
    // navegador lanza si no hubo gesto del usuario que lo habilite.
    try {
      navigator.vibrate?.([18, 40, 28])
    } catch {
      // Silencioso: el háptico es un extra, nunca un bloqueo.
    }
  }, [active, reduced])

  // Sin movimiento o sin activar: no pintamos nada (ni el destello).
  if (!active || reduced) return null

  return (
    <div className={styles.burst} aria-hidden="true">
      <span className={styles.flash} />
      {Array.from({ length: PIECES }).map((_, i) => (
        <span
          key={i}
          className={styles.piece}
          style={
            {
              // Reparto horizontal + retardo/deriva variados para que el confeti
              // no caiga "en bloque". Variables consumidas por el módulo CSS.
              '--x': `${(i / (PIECES - 1)) * 100}%`,
              '--delay': `${(i % 5) * 60}ms`,
              '--drift': `${(i % 2 === 0 ? 1 : -1) * (12 + (i % 4) * 10)}px`,
              '--hue': i % 3,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}
