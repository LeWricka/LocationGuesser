import { Button } from '../../ui'
import { SHOWCASE_LOOP, SHOWCASE_SHOTS } from './landingShowcaseData'
import styles from './LandingShowcase.module.css'

interface Props {
  /** Acción de los CTA del showcase (abre el mismo popup de entrada de la landing). */
  onStart: () => void
  className?: string
}

/**
 * SHOWCASE de la landing deslogueada (issue #462). El dueño pidió CAPTURAS REALES
 * del producto —"tipo la home de Polarsteps"— en vez del showcase de componentes
 * vivos (#452/#454): imagen de producto real dentro de un marco de móvil, sobre una
 * composición editorial cuidada.
 *
 * Cada diapositiva enfrenta un texto editorial (eyebrow + título serif + lede) con
 * una captura real montada en un TELÉFONO dibujado en CSS (self-contained, sin CDNs
 * ni imágenes externas). Las tres pantallas cierran el bucle: home (globo + reto),
 * resultado (cercanía en puntos) y marcador (podio del viaje). Cierra con el relato
 * del bucle y un CTA que abre el mismo flujo de entrada.
 *
 * Presentacional puro: recibe el handler de entrada; sin estado ni red.
 */
export function LandingShowcase({ onStart, className }: Props) {
  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')}>
      {SHOWCASE_SHOTS.map((shot) => (
        <section key={shot.id} className={styles.slide} aria-labelledby={`showcase-${shot.id}`}>
          <header className={styles.copy}>
            <p className={styles.eyebrow}>{shot.eyebrow}</p>
            <h2 id={`showcase-${shot.id}`} className={styles.title}>
              {shot.title}
            </h2>
            <p className={styles.lede}>{shot.lede}</p>
          </header>

          {/* Marco de móvil en CSS: la captura real vive dentro de la "pantalla".
              El notch y el brillo lo dibujamos con pseudo-elementos, sin assets. */}
          <div className={styles.phone}>
            <div className={styles.phoneScreen}>
              <img
                className={styles.shot}
                src={shot.image}
                alt={shot.alt}
                loading="lazy"
                decoding="async"
                width={390}
                height={844}
              />
            </div>
          </div>
        </section>
      ))}

      {/* ── Relato del bucle + CTA ─────────────────────────────────────────────── */}
      {/* Tarjeta de VIDRIO (issue #622, regla dura #537): flota sobre la escena
          oscura continua, no un bloque de papel opaco. */}
      <section
        className={[styles.loopSection, 'lg-glass'].join(' ')}
        aria-labelledby="showcase-bucle"
      >
        <h2 id="showcase-bucle" className={styles.loopTitle}>
          Así funciona Momentu
        </h2>
        <ol className={styles.loop}>
          {SHOWCASE_LOOP.map((line, i) => (
            <li key={line} className={styles.loopStep}>
              <span className={styles.loopNum}>{i + 1}</span>
              <span className={styles.loopText}>{line}</span>
            </li>
          ))}
        </ol>
        <Button size="lg" fullWidth onClick={onStart}>
          Empieza tu viaje
        </Button>
        <p className={styles.loopFoot}>Adivinar es solo el gancho. Compartir es lo que somos.</p>
      </section>
    </div>
  )
}
