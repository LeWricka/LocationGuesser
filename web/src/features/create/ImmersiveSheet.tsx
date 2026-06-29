import { useEffect, useRef, type PointerEvent, type ReactNode } from 'react'
import styles from './CreateChallengeImmersive.module.css'

interface Props {
  /** Etapa activa (0..total-1). Controla la altura y los puntos de progreso. */
  stage: number
  /** Nº total de etapas (para pintar los puntos de progreso). */
  total: number
  /** Altura objetivo de la hoja para la etapa activa, en px. */
  height: number
  /** ¿Se puede avanzar arrastrando el asa hacia arriba? (gating de la etapa). */
  canAdvance: boolean
  /** Arrastrar el asa hacia arriba pasó el umbral → avanzar de etapa. */
  onAdvance: () => void
  /** Arrastrar el asa hacia abajo pasó el umbral → retroceder de etapa. */
  onRetreat: () => void
  children: ReactNode
}

// Umbral (px) de arrastre vertical del asa para cambiar de etapa.
const DRAG_THRESHOLD = 44

// Bottom sheet del flujo inmersivo: sube y CRECE por etapas (altura por etapa con
// muelle) y se arrastra por el asa para avanzar/retroceder. El asa traduce un
// gesto vertical en un cambio de etapa (no un resize libre): mantiene el flujo
// simple y predecible. Pointer Events cubren ratón y táctil con una sola ruta.
export function ImmersiveSheet({
  stage,
  total,
  height,
  canAdvance,
  onAdvance,
  onRetreat,
  children,
}: Props) {
  const startY = useRef<number | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Al cambiar de etapa el cuerpo vuelve arriba (cada etapa empieza por su título).
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0
  }, [stage])

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    startY.current = e.clientY
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (startY.current === null) return
    const dy = startY.current - e.clientY // positivo = arrastre hacia arriba
    startY.current = null
    if (dy > DRAG_THRESHOLD && canAdvance) onAdvance()
    else if (dy < -DRAG_THRESHOLD) onRetreat()
  }

  return (
    <div className={styles.sheet} style={{ height }}>
      <div
        className={styles.grab}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        role="separator"
        aria-label="Arrastra para avanzar o retroceder"
      />
      <div className={styles.prog} aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <i key={i} className={i <= stage ? styles.progOn : undefined} />
        ))}
      </div>
      <div className={styles.sheetBody} ref={bodyRef}>
        {children}
      </div>
    </div>
  )
}
