import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { SceneImage } from './SceneImage'
import { useReducedMotion } from '../../ui'
import styles from './CountdownOverlay.module.css'

interface Props {
  /** Foto del reto para el fondo a pantalla completa (URL firmada). Null = fondo neutro. */
  photoUrl: string | null
  /** Se llama al terminar la cuenta (también de inmediato bajo reduced-motion). */
  onDone: () => void
}

// Números de la cuenta atrás: 3 → 2 → 1. Cada número descansa ~1,3 s (más lento y
// reposado que el segundo seco) para que la entrada en juego se sienta suave. Al
// consumir el 1 se dispara onDone (entrada en juego); el reloj de la jugada arranca
// entonces.
const SEQUENCE = [3, 2, 1] as const
const STEP_MS = 1300

// Overlay de cuenta atrás entre el inicio (idle) y el juego (playing). Visual-first:
// la FOTO del reto llena el fondo (si la hay), con un velo oscuro para legibilidad;
// encima, números GIGANTES que entran con muelle. El reloj de la jugada NO corre
// aquí: el padre lo arranca al recibir onDone.
//
// prefers-reduced-motion: ni animación ni espera; llamamos onDone al montar para
// entrar directos al juego (no atrapamos al usuario en una pausa sin movimiento).
export function CountdownOverlay({ photoUrl, onDone }: Props) {
  const reduced = useReducedMotion()
  const [index, setIndex] = useState(0)
  // onDone puede cambiar de identidad entre renders; lo guardamos en un ref para
  // que el efecto del temporizador no se reinicie y duplique la secuencia. La
  // sincronización va en su propio efecto (no en render) por la regla de refs.
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    // Movimiento reducido: saltamos la cuenta y entramos directos al juego.
    if (reduced) {
      onDoneRef.current()
      return
    }

    let step = 0
    const id = window.setInterval(() => {
      step += 1
      if (step >= SEQUENCE.length) {
        window.clearInterval(id)
        onDoneRef.current()
        return
      }
      setIndex(step)
    }, STEP_MS)
    return () => window.clearInterval(id)
  }, [reduced])

  // Bajo reduced-motion no pintamos nada (entramos al juego al instante).
  if (reduced) return null

  const value = SEQUENCE[index]
  // Último dígito (el "1"): en vez de que el overlay desaparezca de golpe cuando
  // el padre lo desmonta (al llamar onDone → beginPlaying), lo desvanecemos SOBRE
  // su propio tiempo de permanencia (issue #606): el fundido de salida termina
  // justo cuando toca desmontar, sin sumar ni un ms a la cuenta. Así se CRUZA con
  // el fundido de entrada de la escena real (`.sceneEnter` en GameScene) en vez
  // de cortar en seco. `--countdown-step-ms` viaja como variable inline para que
  // el CSS calcule el delay del fundido a partir del mismo STEP_MS que gobierna
  // el temporizador (una sola fuente de verdad para el timing).
  const isLast = index === SEQUENCE.length - 1

  return (
    <div
      className={`${styles.overlay} ${isLast ? styles.overlayExit : ''}`}
      style={{ '--countdown-step-ms': `${STEP_MS}ms` } as CSSProperties}
      role="status"
      aria-label={`Empezando en ${value}`}
    >
      {/* Fondo: la foto del reto a pantalla completa (si la hay) o un degradado
          neutro de la marca. Velo oscuro encima para que los números resalten. */}
      <div className={styles.bg} aria-hidden="true">
        {photoUrl ? (
          <SceneImage src={photoUrl} alt="" className={styles.bgImg} skeletonRadius="sm" />
        ) : (
          <div className={styles.bgNeutral} />
        )}
        <div className={styles.scrim} />
      </div>

      {/* Número gigante: `key` por valor reinicia la animación de entrada en cada
          cambio (3 → 2 → 1). aria-hidden: el valor ya se anuncia en el label. */}
      <span key={value} className={styles.number} aria-hidden="true">
        {value}
      </span>
    </div>
  )
}
