// Slideshow de onboarding: overlay modal con varias slides (mini-simulación +
// título/texto) y controles Saltar / Siguiente / Empezar. Presentacional: recibe
// las slides y los callbacks; quién lo muestra y la persistencia los decide
// OnboardingGate.
//
// Accesibilidad: role=dialog + aria-modal, foco al panel al abrir, cierre con
// Esc (= saltar). Móvil-first, usando el UI kit y los tokens (no hardcodea).
//
// Coreografía de entrada (issue #625): cada bloque del paso (escenario, titular,
// cuerpo, puntos, CTA) entra escalonado (var(--i) + animation-fill-mode:
// backwards, ver .module.css) — y se repite en CADA paso porque la `key` del
// bloque cambia con `index` (remonta el DOM, no solo actualiza el texto). Saltar
// queda FUERA de la coreografía a propósito: siempre visible e interactuable
// desde el primer frame.
//
// Swipe entre slides (issue #717, "más dinámicos"): además del botón, se puede
// arrastrar el panel horizontalmente — mismo patrón Pointer Events que el asa
// del flujo inmersivo (CreateChallengeImmersive/ImmersiveSheet): capturamos el
// puntero al bajar y decidimos en el "up" según el desplazamiento total, sin
// arrastre en vivo (mantiene el gesto predecible: o pasa de slide, o no pasa
// nada, nunca un estado intermedio a medio camino).

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { Button } from '../../ui'
import type { OnboardingSlide } from './slides'
import { OnboardingVisual } from './OnboardingVisual'
import styles from './OnboardingSlideshow.module.css'

interface Props {
  slides: OnboardingSlide[]
  /** Saltar el tutorial (botón Saltar o Escape). */
  onSkip: () => void
  /** Completar el tutorial (botón Empezar en la última slide). */
  onComplete: () => void
}

// Umbral (px) de arrastre horizontal para cambiar de slide (mismo criterio que
// DRAG_THRESHOLD de ImmersiveSheet: ni tan bajo que un tap tembloroso navegue
// solo, ni tan alto que el gesto se sienta duro).
const SWIPE_THRESHOLD = 44

// Índice de la coreografía → variable CSS `--i` que consume el retraso escalonado
// (ver `.reveal` en el módulo CSS). Tipado con un cast puntual: las custom
// properties no forman parte de CSSProperties.
function revealStyle(i: number): CSSProperties {
  return { '--i': i } as CSSProperties
}

export function OnboardingSlideshow({ slides, onSkip, onComplete }: Props) {
  const [index, setIndex] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const startX = useRef<number | null>(null)

  const isLast = index === slides.length - 1
  const slide = slides[index]

  // Foco al panel al abrir, para que el lector de pantalla y el teclado entren
  // en el diálogo.
  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  // Escape = saltar (mismo efecto que el botón).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onSkip()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSkip])

  const next = () => {
    if (isLast) onComplete()
    else setIndex((i) => i + 1)
  }
  const prev = () => setIndex((i) => Math.max(0, i - 1))

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    startX.current = e.clientX
    // guarda con feature-check: jsdom (tests) no implementa setPointerCapture.
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (startX.current === null) return
    const dx = e.clientX - startX.current
    startX.current = null
    // Arrastre a la izquierda → siguiente; a la derecha → anterior.
    if (dx <= -SWIPE_THRESHOLD) next()
    else if (dx >= SWIPE_THRESHOLD) prev()
  }

  return (
    <div className={styles.overlay} onClick={onSkip}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lg-onboarding-title"
        tabIndex={-1}
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <button type="button" className={[styles.skip, 'lg-press'].join(' ')} onClick={onSkip}>
          Saltar
        </button>

        {/* `key={index}`: cada paso es un montaje NUEVO, así la coreografía de
            entrada (escenario → titular → cuerpo → puntos → CTA) se repite en
            cada paso, no solo al abrir el tutorial — y el Ken Burns de la foto
            (OnboardingVisual) reinicia también por slide. */}
        <div className={styles.slide} key={index}>
          <div className={styles.reveal} style={revealStyle(0)}>
            <OnboardingVisual visual={slide.visual} icon={slide.icon} image={slide.image} />
          </div>
          <div className={[styles.heading, styles.reveal].join(' ')} style={revealStyle(1)}>
            {/* Eyebrow editorial con el paso actual (p.ej. "Momentu · 1 de 3"):
                ubica al usuario en el recorrido sin robar peso al titular. */}
            <span className={`t-label ${styles.eyebrow}`}>
              Momentu · {index + 1} de {slides.length}
            </span>
            <h2 id="lg-onboarding-title" className={`t-section ${styles.title}`}>
              {slide.title}
            </h2>
          </div>
          <p className={[`t-body ${styles.body}`, styles.reveal].join(' ')} style={revealStyle(2)}>
            {slide.body}
          </p>

          <div
            className={[styles.dots, styles.reveal].join(' ')}
            style={revealStyle(3)}
            aria-hidden="true"
          >
            {slides.map((_, i) => (
              <span
                key={i}
                className={i === index ? `${styles.dot} ${styles.dotActive}` : styles.dot}
              />
            ))}
          </div>

          <div className={styles.reveal} style={revealStyle(4)}>
            <Button fullWidth onClick={next}>
              {isLast ? 'A viajar' : 'Siguiente'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
