import { useEffect, useRef } from 'react'
import { useReducedMotion } from './motion'
import styles from './HowItWorksImmersive.module.css'

interface Props {
  /** Etiqueta del CTA (abre el flujo de entrada). */
  ctaLabel?: string
  /** Handler del CTA. Si falta, el botón no se muestra (modo puramente visual). */
  onCta?: () => void
  className?: string
}

// Los 3 pasos del bucle. Copy revisado (issue #729): fuera el meta-discurso
// ("el gancho", "lo que somos") y los verbos sentimentales forzados — la
// gente no "siente" una foto, la mira y adivina.
const STEPS = [
  {
    num: '01',
    title: 'Sube una foto',
    body: 'Del viaje, del finde, de donde sea. Con el sitio si te apetece.',
  },
  {
    num: '02',
    title: 'Los tuyos adivinan',
    body: '¿Dónde es? Marcan en el mapa a contrarreloj. El que más se acerca, gana.',
  },
  {
    num: '03',
    title: 'Se queda para siempre',
    body: 'Todo va al diario del viaje. Para volver cuando queráis.',
  },
] as const

// Marcador del paso 3: cierra el bucle visual de "quién ganó". El ganador (más
// cerca) destaca en oro; el resto en orden de distancia.
const LEADERBOARD = [
  { rank: '1', name: 'Lucía', km: '4,2 km', win: true },
  { rank: '2', name: 'Marco', km: '11 km', win: false },
  { rank: '3', name: 'Ana', km: '38 km', win: false },
] as const

// Sección "Cómo funciona" inmersiva de la PORTADA deslogueada: un satélite CSS a
// sangre como héroe vivo, una hoja que crece por encima y el bucle animado del
// mapa (pin "?" → cae el pin de respuesta → línea → microcelebración). El bucle
// arranca cuando la hoja entra en viewport (IntersectionObserver); los pasos
// aparecen escalonados al entrar. Todo el movimiento se desactiva con
// prefers-reduced-motion (CSS) y, por seguridad, también desde JS.
export function HowItWorksImmersive({ ctaLabel, onCta, className }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const steps = Array.from(root.querySelectorAll<HTMLElement>(`.${styles.step}`))

    // Con menos movimiento: todo visible y estático, sin observar nada.
    if (reduced) {
      root.classList.add(styles.revealed)
      steps.forEach((s) => s.classList.add(styles.stepIn))
      return
    }

    // Sin IntersectionObserver (jsdom / navegadores viejos): mostrar todo.
    if (typeof IntersectionObserver === 'undefined') {
      root.classList.add(styles.revealed)
      steps.forEach((s) => s.classList.add(styles.stepIn))
      return
    }

    const sheet = root.querySelector<HTMLElement>(`.${styles.sheet}`)

    // El bucle del mapa arranca cuando la hoja entra en escena.
    let stageObs: IntersectionObserver | null = null
    if (sheet) {
      stageObs = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              root.classList.add(styles.revealed)
              stageObs?.disconnect()
            }
          })
        },
        { threshold: 0.1 },
      )
      stageObs.observe(sheet)
    }

    // Cada paso entra cuando asoma (la hoja "crece" por etapas).
    const stepObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add(styles.stepIn)
            stepObs.unobserve(e.target)
          }
        })
      },
      { threshold: 0.25, rootMargin: '0px 0px -8% 0px' },
    )
    steps.forEach((s) => stepObs.observe(s))

    return () => {
      stageObs?.disconnect()
      stepObs.disconnect()
    }
  }, [reduced])

  return (
    <div ref={rootRef} className={[styles.root, className].filter(Boolean).join(' ')}>
      {/* Escenario decorativo: satélite a sangre + bucle del mapa. aria-hidden
          porque no aporta texto; el relato lo lleva la hoja. */}
      <div className={styles.stage} aria-hidden="true">
        <div className={styles.sat}>
          <div className={styles.satLand} />
          <div className={styles.satWater} />
          <div className={styles.satRelief} />
          <div className={styles.satGrid} />
        </div>
        {/* Pin de pregunta (donde otros adivinan). */}
        <div className={`${styles.pin} ${styles.pinQ}`}>
          <span className={styles.pinQMark} />
        </div>
        {/* Pin de respuesta (la ubicación real): cae con rebote. */}
        <div className={`${styles.pin} ${styles.pinA}`}>
          <span className={styles.pinDot} />
          <span className={styles.pinRing} />
        </div>
        {/* Línea entre adivinanza y respuesta. */}
        <svg className={styles.line} viewBox="0 0 390 320" preserveAspectRatio="none">
          <line x1="118" y1="120" x2="262" y2="208" />
        </svg>
        {/* Microcelebración de la distancia. */}
        <div className={styles.dist}>
          <b>2,1 km</b>
          <small>cerquísima</small>
        </div>
        <div className={styles.vignette} />
      </div>

      {/* Hoja que crece por encima del satélite. Región con label propio. */}
      <section className={styles.sheet} role="region" aria-labelledby="hiw-immersive-title">
        <span className={styles.handle} aria-hidden="true" />

        <header className={styles.head}>
          <p className={styles.eyebrow}>Cómo funciona</p>
          <h2 id="hiw-immersive-title" className={styles.title}>
            Comparte tus momentos
            <br />
            de una forma diferente
          </h2>
          <p className={styles.lede}>
            Mandas un momento del viaje. Los tuyos lo viven y adivinan dónde es. Y todo se queda en
            vuestro viaje.
          </p>
        </header>

        <ol className={styles.steps}>
          {STEPS.map((step) => (
            <li key={step.num} className={styles.step}>
              <article className={styles.card}>
                {/* Cada paso lleva su propia "media": foto, mini-mapa o el
                    diario con el marcador. */}
                {step.num === '01' && (
                  <div className={styles.media}>
                    <div className={`${styles.ph} ${styles.phCoast}`} />
                    <span className={`${styles.chip} ${styles.chipCam}`}>Tu momento</span>
                  </div>
                )}
                {step.num === '02' && (
                  <div className={`${styles.media} ${styles.mediaMap}`}>
                    <div className={styles.miniSat} />
                    <span className={styles.miniPin} />
                    <span className={`${styles.chip} ${styles.chipTime}`}>3 · 2 · 1</span>
                  </div>
                )}
                {step.num === '03' && (
                  <div className={`${styles.media} ${styles.mediaBoard}`}>
                    <ol className={styles.leaderboard}>
                      {LEADERBOARD.map((row) => (
                        <li
                          key={row.rank}
                          className={[styles.lbRow, row.win ? styles.lbWin : null]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          <span className={styles.lbRank}>{row.rank}</span>
                          <span className={styles.lbName}>{row.name}</span>
                          <span className={styles.lbKm}>{row.km}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                <div className={styles.cardBody}>
                  <span className={styles.num}>{step.num}</span>
                  <h3 className={styles.stepTitle}>{step.title}</h3>
                  <p className={styles.stepBody}>{step.body}</p>
                </div>
              </article>
            </li>
          ))}
        </ol>

        <div className={styles.cta}>
          {onCta && (
            <button type="button" className={styles.ctaBtn} onClick={onCta}>
              {ctaLabel ?? 'Empieza un viaje'}
            </button>
          )}
          <p className={styles.foot}>Un diario de viaje que se juega.</p>
        </div>
      </section>
    </div>
  )
}
