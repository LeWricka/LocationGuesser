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

import { useEffect, useRef, useState, type CSSProperties } from 'react'
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

// Índice de la coreografía → variable CSS `--i` que consume el retraso escalonado
// (ver `.reveal` en el módulo CSS). Tipado con un cast puntual: las custom
// properties no forman parte de CSSProperties.
function revealStyle(i: number): CSSProperties {
  return { '--i': i } as CSSProperties
}

export function OnboardingSlideshow({ slides, onSkip, onComplete }: Props) {
  const [index, setIndex] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)

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
      >
        <button type="button" className={[styles.skip, 'lg-press'].join(' ')} onClick={onSkip}>
          Saltar
        </button>

        {/* `key={index}`: cada paso es un montaje NUEVO, así la coreografía de
            entrada (escenario → titular → cuerpo → puntos → CTA) se repite en
            cada paso, no solo al abrir el tutorial. */}
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
