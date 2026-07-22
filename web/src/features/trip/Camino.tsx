import { useEffect, useRef } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { AlertTriangle, ChevronRight, Compass, Trophy } from 'lucide-react'
import { Avatar, Badge, ChallengePhoto, Icon, useReducedMotion } from '../../ui'
import { formatDeadline } from '../../lib/time'
import type { PastChallengeSummary } from './useTripData'
import styles from './Camino.module.css'

interface Props {
  pastChallenges: PastChallengeSummary[]
  /** Reto EN JUEGO sin jugar (anti-spoiler, issue #800): mismo destino que
   * "Adivina" del Diario. */
  onPlayChallenge: (challengeId: string) => void
  /** Cualquier CERRADO, o un EN JUEGO ya jugado: abre el detalle completo. */
  onViewChallenge: (challengeId: string) => void
  /**
   * Ancla del PRIMER hito para `GuidedTour` (viaje de ejemplo, onboarding nuevo
   * pieza 4/4): "Así se juega uno." Opcional y sin efecto fuera de la guía.
   */
  firstHitoRef?: RefObject<HTMLLIElement | null>
}

// El stagger de entrada se capa a los primeros hitos (issue #831, rescatado del
// prototipo): con un camino largo (20+ retos), retrasar el último en función de
// su índice real dejaría el final de la lista tardando segundos en aparecer la
// primera vez que entra en viewport. Los hitos más allá del 6º entran juntos.
const STAGGER_CAP = 6

// Formato corto "14 jun" para la etiqueta de fecha del hito CERRADO (issue #831).
// No vive en `lib/time` (fuera de área en esta issue): es un formato exclusivo
// de esta pieza visual, no una utilidad compartida con el resto de la app.
const SHORT_DATE_FMT = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' })
function formatShortDate(iso: string): string {
  return SHORT_DATE_FMT.format(new Date(iso))
}

// Icono discreto "salió de la app durante la jugada" (issue #200): mismo criterio
// que el resto de la app — title + aria-label duplican el aviso para ratón y
// lector de pantalla, nunca solo un color.
function LeftAppFlag() {
  return (
    <span
      className={styles.leftAppFlag}
      title="Salió de la app durante la jugada"
      aria-label="Salió de la app durante la jugada"
    >
      <Icon icon={AlertTriangle} size={12} />
    </span>
  )
}

// "Tu resultado" corto de un hito CERRADO: mi puesto EN ESE reto + puntos (issue
// #841/#831 — antes solo mostraba puntos; el prototipo pide el Nº de puesto).
// Un reto CREADO por mí nunca tiene resultado (nadie vota lo propio) y uno que no
// jugué queda en pasado ("No jugaste": la ventana ya cerró, a diferencia del EN
// JUEGO que aún admite jugar).
function MiResultado({ challenge }: { challenge: PastChallengeSummary }) {
  if (challenge.isOwn) return <>Tu reto</>
  if (!challenge.myResult || challenge.myRank == null) return <>No jugaste</>
  const gane = challenge.myRank === 1
  return (
    <span className={gane ? styles.mineGane : undefined}>
      Tú: <b>{challenge.myRank}º</b>
      {gane && <Icon icon={Trophy} size={12} className={styles.mineTrofeo} />} ·{' '}
      {challenge.myResult.points.toLocaleString('es-ES')} pts
      {challenge.myResult.leftApp && <LeftAppFlag />}
    </span>
  )
}

interface HitoProps {
  challenge: PastChallengeSummary
  index: number
  onPlayChallenge: (challengeId: string) => void
  onViewChallenge: (challengeId: string) => void
  /** Solo el PRIMER hito lo recibe (ver `Camino`, más abajo). */
  hitoRef?: RefObject<HTMLLIElement | null>
}

function Hito({ challenge: c, index, onPlayChallenge, onViewChallenge, hitoRef }: HitoProps) {
  const isLive = c.status === 'active'
  // Anti-spoiler (issue #800, idéntico al Marcador de antes): un EN JUEGO sin
  // jugar va a JUGAR (nunca al detalle, que revelaría el mapa); cualquier otro
  // (cerrado, o EN JUEGO ya jugado) abre el detalle completo.
  const antiSpoiler = isLive && c.myResult == null
  const yaJugado = isLive && c.myResult != null

  return (
    <li
      className={styles.hito}
      style={{ '--i': Math.min(index, STAGGER_CAP) } as CSSProperties}
      data-camino-hito
      ref={hitoRef}
    >
      <span
        className={[styles.node, isLive ? styles.nodeLive : styles.nodeClosed].join(' ')}
        aria-hidden="true"
      >
        {isLive ? (
          <span className={styles.nodeDot} />
        ) : (
          <Icon icon={Trophy} size={13} className={styles.nodeIcon} />
        )}
      </span>

      <p className={styles.fecha}>
        {isLive ? formatDeadline(c.closedAt) : formatShortDate(c.closedAt)}
      </p>

      <button
        type="button"
        className={[styles.card, isLive ? styles.cardLive : '', 'lg-press']
          .filter(Boolean)
          .join(' ')}
        onClick={() =>
          antiSpoiler ? onPlayChallenge(c.challengeId) : onViewChallenge(c.challengeId)
        }
      >
        <ChallengePhoto
          src={c.imageUrl}
          alt={c.title}
          ratio="square"
          size="sm"
          zoomable={false}
          className={styles.foto}
        />
        <span className={styles.cuerpo}>
          <span className={styles.pregunta}>{c.title}</span>

          {isLive ? (
            <>
              <Badge tone="live" dot className={styles.pill}>
                EN JUEGO
              </Badge>
              <span className={styles.cta}>
                <Icon icon={Compass} size={14} />
                {yaJugado ? 'Ver mi apuesta' : 'Adivina'}
              </span>
            </>
          ) : (
            <>
              <span className={styles.winnerRow}>
                {c.winner ? (
                  <>
                    <span className={styles.winnerAvatar}>
                      <Avatar userId={c.winner.userId} avatarUrl={c.winner.avatar} size="xs" />
                    </span>
                    <span className={styles.winnerTexto}>
                      Ganó <b>{c.winner.name}</b>
                      {c.winner.leftApp && <LeftAppFlag />}
                    </span>
                  </>
                ) : (
                  <span className={styles.winnerTexto}>Se cerró sin votos</span>
                )}
              </span>
              <span className={styles.mineTexto}>
                <MiResultado challenge={c} />
              </span>
            </>
          )}
        </span>
        <span className={styles.chev} aria-hidden="true">
          <Icon icon={ChevronRight} size={18} />
        </span>
      </button>
    </li>
  )
}

/**
 * "El camino" (issue #831, rediseño oscuro del Marcador): ruta dorada vertical
 * y cronológica (más nuevo arriba) de los retos del viaje — sustituye a la
 * antigua sección "Retos anteriores" (issue #608), con el mismo dato
 * (`pastChallenges` de `useTripData`) pero como recorrido visual, no una lista
 * administrativa. Cada hito entra al hacerse visible (IntersectionObserver,
 * mismo patrón que `HowItWorksImmersive`): con `prefers-reduced-motion`, o sin
 * `IntersectionObserver` (jsdom/navegadores viejos), se muestran todos ya
 * revelados en vez de quedar invisibles a la espera de un scroll que no llega.
 */
export function Camino({ pastChallenges, onPlayChallenge, onViewChallenge, firstHitoRef }: Props) {
  const rootRef = useRef<HTMLOListElement>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const hitos = Array.from(root.querySelectorAll<HTMLElement>('[data-camino-hito]'))

    if (reduced || typeof IntersectionObserver === 'undefined') {
      hitos.forEach((h) => h.classList.add(styles.hitoIn))
      return
    }

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.hitoIn)
            obs.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.15 },
    )
    hitos.forEach((h) => obs.observe(h))
    return () => obs.disconnect()
  }, [reduced, pastChallenges])

  if (pastChallenges.length === 0) return null

  return (
    <section className={styles.camino}>
      <div className={styles.cabecera}>
        <h2 className={styles.titulo}>Retos</h2>
        <span className={styles.linea} aria-hidden="true" />
      </div>
      <p className={styles.subtitulo}>Toca un reto para ver dónde acertó cada uno.</p>
      <ol className={styles.ruta} aria-label="Retos del viaje" ref={rootRef}>
        {pastChallenges.map((c, i) => (
          <Hito
            key={c.challengeId}
            challenge={c}
            index={i}
            onPlayChallenge={onPlayChallenge}
            onViewChallenge={onViewChallenge}
            hitoRef={i === 0 ? firstHitoRef : undefined}
          />
        ))}
      </ol>
    </section>
  )
}
