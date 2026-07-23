import { useEffect, useRef, useState, type ComponentType } from 'react'
import {
  Button,
  IconCalendario,
  IconCamara,
  IconGlobe,
  IconPin,
  IconReto,
  IconTrofeo,
  useReducedMotion,
} from '../../ui'
import {
  LANDING_STORY_FOOT,
  LANDING_STORY_PARTS,
  type LandingStoryIcon,
  type LandingStoryPart,
} from './landingShowcaseData'
import styles from './LandingShowcase.module.css'

interface Props {
  /** Acción del CTA de cierre (abre el mismo popup de entrada de la landing). */
  onStart: () => void
  className?: string
}

// Icono custom de marca por clave (ver `LandingStoryIcon`): resuelve aquí, en el
// componente, para que `landingShowcaseData.ts` quede como datos puros sin JSX.
const STORY_ICONS: Record<
  LandingStoryIcon,
  ComponentType<{ size?: number; className?: string }>
> = {
  camara: IconCamara,
  pin: IconPin,
  calendario: IconCalendario,
  reto: IconReto,
  globo: IconGlobe,
  trofeo: IconTrofeo,
}

/**
 * NARRATIVA en dos partes de la landing deslogueada (issue #731): tras el héroe, la
 * portada cuenta el producto en DOS BLOQUES, en el orden de la identidad de producto
 * —guardar el viaje es la ESENCIA (primero); jugar es el GANCHO social (después), no
 * el qué somos—. Sustituye al carrusel plano de 4 capturas + lista de pasos del
 * diseño anterior (#652/#695): ahora cada parte enfrenta un texto editorial (kicker +
 * eyebrow + título serif + lede + tres puntos con icono custom) con UNA captura real
 * del producto en un marco de móvil dibujado en CSS (self-contained, sin CDNs).
 *
 * Presentacional puro: recibe el handler del CTA de cierre; sin estado de red.
 */
export function LandingShowcase({ onStart, className }: Props) {
  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')}>
      {LANDING_STORY_PARTS.map((part) => (
        <StoryPart key={part.id} part={part} />
      ))}

      {/* ── Cierre + CTA ─────────────────────────────────────────────────────── */}
      {/* Tarjeta de VIDRIO (issue #622, regla dura #537): flota sobre la escena
          oscura continua, no un bloque de papel opaco. */}
      <section className={[styles.closeSection, 'lg-glass'].join(' ')} aria-label="Empezar">
        <Button size="lg" fullWidth onClick={onStart}>
          Empieza a compartir
        </Button>
        <p className={styles.closeFoot}>{LANDING_STORY_FOOT}</p>
      </section>
    </div>
  )
}

/** Una parte de la narrativa: separador + copy + puntos + captura. Entra con un
 * fundido sutil al hacer scroll (IntersectionObserver): arranca revelada si el
 * usuario pide menos movimiento o si el navegador no soporta el observer (jsdom en
 * tests, navegadores muy viejos). */
function StoryPart({ part }: { part: LandingStoryPart }) {
  const ref = useRef<HTMLElement>(null)
  const reduced = useReducedMotion()
  // Sin observer disponible (jsdom en tests, navegadores muy viejos) o con menos
  // movimiento: arranca YA revelada — nada que suscribir, así que el bail-out vive en
  // el inicializador perezoso, no en un `setState` síncrono dentro del efecto.
  const canObserve = typeof IntersectionObserver !== 'undefined'
  const [revealed, setRevealed] = useState(() => reduced || !canObserve)

  useEffect(() => {
    if (reduced || !canObserve) return
    const node = ref.current
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setRevealed(true)
            observer.disconnect()
          }
        })
      },
      { threshold: 0.2, rootMargin: '0px 0px -10% 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [reduced, canObserve])

  return (
    <section
      ref={ref}
      className={[styles.part, revealed ? styles.partIn : null].filter(Boolean).join(' ')}
      aria-labelledby={`landing-story-${part.id}`}
    >
      {/* Separador de parte (opcional): kicker teal (guardar) o dorado (jugar). Se
          retiró el texto (feedback landing) — el eyebrow hace de encabezado —, así
          que solo se pinta si un bloque futuro vuelve a traer kicker. */}
      {part.kicker && (
        <p className={styles.kicker} data-tone={part.tone}>
          {part.kicker}
        </p>
      )}

      <div className={styles.grid}>
        <header className={styles.copy}>
          <p className={styles.eyebrow}>{part.eyebrow}</p>
          <h2 id={`landing-story-${part.id}`} className={styles.title}>
            {part.title}
          </h2>
          <p className={styles.lede}>{part.lede}</p>

          <ul className={styles.items}>
            {part.items.map((item) => {
              const ItemIcon = STORY_ICONS[item.icon]
              return (
                <li key={item.title} className={styles.item}>
                  <span className={styles.itemIcon}>
                    <ItemIcon size={20} />
                  </span>
                  <span className={styles.itemText}>
                    <strong>{item.title}</strong>
                    <span>{item.body}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </header>

        {/* Marco de móvil en CSS: la captura real vive dentro de la "pantalla".
            El notch y el brillo se dibujan con pseudo-elementos, sin assets. Issue
            #733: el crédito del mapa satélite YA NO se repite bajo el marco (ensuciaba
            la captura) — vive una única vez en el pie de página de la landing (ver
            `LANDING_MAP_CREDIT` en `Landing.tsx`). */}
        <div className={styles.media}>
          <div className={styles.phone}>
            <div className={styles.phoneScreen}>
              <img
                className={styles.shot}
                src={part.shot.image}
                alt={part.shot.alt}
                loading="lazy"
                decoding="async"
                width={390}
                height={844}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
