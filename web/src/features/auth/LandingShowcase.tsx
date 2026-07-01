import { MapPin, Target, Trophy, Users } from 'lucide-react'
import { Badge, Button, ChallengePhoto, Icon } from '../../ui'
import { Medal } from '../../ui/Medal'
import {
  SHOWCASE_CHALLENGE,
  SHOWCASE_LOOP,
  SHOWCASE_MOMENTS,
  SHOWCASE_SCORES,
  SHOWCASE_TRIP_NAME,
} from './landingShowcaseData'
import styles from './LandingShowcase.module.css'

interface Props {
  /** Acción de los CTA del showcase (abre el mismo popup de entrada de la landing). */
  onStart: () => void
  className?: string
}

/**
 * SHOWCASE de la landing deslogueada (issue #452): debajo del héroe (globo + hero
 * + CTA, que NO se tocan), enseña un VIAJE DE EJEMPLO bien montado para que el
 * visitante entienda de un vistazo QUÉ es Tabide y QUÉ puede hacer —en vez de un
 * eslogan vago (validación jul-2026: "ver el producto antes de entrar es clave").
 *
 * Muestra, no cuenta (estilo Polarsteps: foto-first, mucho aire, relato Plan/
 * Track/Relive). Tres piezas que cierran el bucle, con las MISMAS fotos del globo
 * héroe (Wikimedia CC, empaquetadas):
 *   1. DIARIO — momentos con foto + lugar + nota (un diario visual en grupo).
 *   2. RETO — la tarjeta "¿Dónde tomó Marta esta foto?" (la mecánica de adivinar).
 *   3. MARCADOR — quién va ganando por cercanía ("gana quien más se acerca").
 * Cierra con el relato del bucle y un CTA que abre el mismo flujo de entrada.
 *
 * Presentacional puro: recibe el handler de entrada; sin estado ni red.
 */
export function LandingShowcase({ onStart, className }: Props) {
  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')}>
      {/* ── 1. DIARIO: un viaje de muestra, foto-first ─────────────────────────── */}
      <section className={styles.section} aria-labelledby="showcase-diario">
        <header className={styles.head}>
          <p className={styles.eyebrow}>Un viaje de ejemplo</p>
          <h2 id="showcase-diario" className={styles.title}>
            {SHOWCASE_TRIP_NAME}
          </h2>
          <p className={styles.lede}>
            Un diario visual que hacéis entre todos: cada momento es una foto clavada en el mapa,
            con su lugar y su nota.
          </p>
        </header>

        <ol className={styles.diary}>
          {SHOWCASE_MOMENTS.map((moment) => (
            <li key={moment.id}>
              <article className={styles.momentCard}>
                <div className={styles.momentPhoto}>
                  <ChallengePhoto
                    src={moment.photo}
                    alt={`${moment.place}, foto de ${moment.author}`}
                    ratio="wide"
                    zoomable={false}
                  />
                  {/* Lugar clavado sobre la foto (chrome flotante con velo, como
                      en el diario real): comunica "esto va sobre un mapa". */}
                  <span className={styles.pin}>
                    <Icon icon={MapPin} size={13} /> {moment.place}
                  </span>
                </div>
                <div className={styles.momentBody}>
                  <p className={styles.note}>{moment.note}</p>
                  <p className={styles.byline}>
                    <span className={styles.author}>{moment.author}</span>
                    <span className={styles.dot} aria-hidden="true">
                      ·
                    </span>
                    <span className={styles.date}>{moment.date}</span>
                  </p>
                </div>
              </article>
            </li>
          ))}
        </ol>
      </section>

      {/* ── 2. RETO: la mecánica de adivinar ───────────────────────────────────── */}
      <section className={styles.section} aria-labelledby="showcase-reto">
        <header className={styles.head}>
          <p className={styles.eyebrow}>
            <Icon icon={Target} size={13} /> Y de vez en cuando, un reto
          </p>
          <h2 id="showcase-reto" className={styles.title}>
            ¿Adivinas dónde es?
          </h2>
          <p className={styles.lede}>
            Alguien comparte una foto y esconde el lugar. Los demás marcan en el mapa dónde creen
            que es, con cuenta atrás.
          </p>
        </header>

        <article className={styles.challenge}>
          <div className={styles.challengePhoto}>
            <ChallengePhoto
              src={SHOWCASE_CHALLENGE.photo}
              alt={SHOWCASE_CHALLENGE.question}
              ratio="photo"
              zoomable={false}
            />
            <span className={styles.challengeBadge}>
              <Badge tone="live" dot>
                EN JUEGO
              </Badge>
            </span>
          </div>
          <div className={styles.challengeBody}>
            <p className={styles.challengeQuestion}>{SHOWCASE_CHALLENGE.question}</p>
            <div className={styles.challengeFoot}>
              <span className={styles.social}>
                <Icon icon={Users} size={15} /> {SHOWCASE_CHALLENGE.guessedCount} ya han adivinado
              </span>
              <Button size="sm" onClick={onStart}>
                Adivina →
              </Button>
            </div>
          </div>
        </article>
      </section>

      {/* ── 3. MARCADOR: gana quien más se acerca ──────────────────────────────── */}
      <section className={styles.section} aria-labelledby="showcase-marcador">
        <header className={styles.head}>
          <p className={styles.eyebrow}>
            <Icon icon={Trophy} size={13} /> Y al final
          </p>
          <h2 id="showcase-marcador" className={styles.title}>
            Gana quien más se acerca
          </h2>
          <p className={styles.lede}>
            Cuanto más cerca del lugar real, más puntos. El marcador del viaje se va llenando reto a
            reto.
          </p>
        </header>

        <ol className={styles.board}>
          {SHOWCASE_SCORES.map((row) => (
            <li
              key={row.rank}
              className={[styles.scoreRow, row.rank === 1 ? styles.scoreWin : null]
                .filter(Boolean)
                .join(' ')}
            >
              <span className={styles.scoreRank}>
                {row.rank <= 3 ? (
                  <Medal rank={row.rank as 1 | 2 | 3} size={26} />
                ) : (
                  <span className={styles.scoreNum}>{row.rank}</span>
                )}
              </span>
              <span className={styles.scoreName}>{row.name}</span>
              <span className={styles.scoreKm}>{row.km}</span>
              <span className={styles.scorePoints}>{row.points.toLocaleString('es-ES')}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Relato del bucle + CTA ─────────────────────────────────────────────── */}
      <section className={styles.loopSection} aria-labelledby="showcase-bucle">
        <h2 id="showcase-bucle" className={styles.loopTitle}>
          Así funciona Tabide
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
