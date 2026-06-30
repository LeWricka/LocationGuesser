// Slideshow de onboarding: overlay modal con varias slides (icono/título/texto)
// y controles Saltar / Siguiente / Empezar. Presentacional: recibe las slides y
// los callbacks; quién lo muestra y la persistencia los decide OnboardingGate.
//
// Accesibilidad: role=dialog + aria-modal, foco al panel al abrir, cierre con
// Esc (= saltar). Móvil-first, usando el UI kit y los tokens (no hardcodea).

import { useEffect, useRef, useState } from 'react'
import { Button, Icon } from '../../ui'
import type { OnboardingSlide } from './slides'
import styles from './OnboardingSlideshow.module.css'

interface Props {
  slides: OnboardingSlide[]
  /** Saltar el tutorial (botón Saltar o Escape). */
  onSkip: () => void
  /** Completar el tutorial (botón Empezar en la última slide). */
  onComplete: () => void
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
        <button type="button" className={styles.skip} onClick={onSkip}>
          Saltar
        </button>

        <div className={styles.slide}>
          <span className={styles.icon}>
            <Icon icon={slide.icon} size={40} />
          </span>
          {/* Eyebrow editorial con el paso actual (p.ej. "Tabide · 1 de 3"):
              ubica al usuario en el recorrido sin robar peso al titular. */}
          <span className={styles.eyebrow}>
            Tabide · {index + 1} de {slides.length}
          </span>
          <h2 id="lg-onboarding-title" className={styles.title}>
            {slide.title}
          </h2>
          <p className={styles.body}>{slide.body}</p>
        </div>

        <div className={styles.dots} aria-hidden="true">
          {slides.map((_, i) => (
            <span
              key={i}
              className={i === index ? `${styles.dot} ${styles.dotActive}` : styles.dot}
            />
          ))}
        </div>

        <Button fullWidth onClick={next}>
          {isLast ? 'Empezar' : 'Siguiente'}
        </Button>
      </div>
    </div>
  )
}
