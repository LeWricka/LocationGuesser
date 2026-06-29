import { forwardRef } from 'react'
import { EmptyState } from '../../ui'
import type { Moment, RoutePoint } from '../../lib/trip'
import { TripMap } from './TripMap'
import { MomentCard } from './MomentCard'
import { MomentTimeline } from './MomentTimeline'
import styles from './TripDiario.module.css'

interface Props {
  moments: Moment[]
  route: RoutePoint[]
  activeMoment: Moment | null
  selectedId: string | null
  /** Texto del recorrido para el pie del mapa ("Tokio → Kioto"), o null. */
  routeCaption: string | null
  /** ¿Puede el usuario añadir momentos? (dueño) — gobierna el CTA del vacío. */
  canCreate: boolean
  /** Reproducción del recorrido (undefined bajo reduced-motion: sin control). */
  playing?: boolean
  onTogglePlay?: () => void
  onSelectFromMap: (challengeId: string) => void
  onSelectFromCarousel: (challengeId: string) => void
  onExpand: (moment: Moment) => void
  onPlay: (challengeId: string) => void
  onAddMoment: () => void
}

/**
 * Sección DIARIO del viaje: mapa SATÉLITE enmarcado como hero (el recorrido cosido
 * con la ruta) + línea de tiempo y carrusel de momentos. Es una de las dos páginas
 * hermanas de TripPage; vive dentro de un panel que hace scroll vertical mientras
 * la página se desliza en horizontal entre Diario y Retos.
 *
 * El `ref` apunta al carrusel (TripPage gobierna el scroll-sync carrusel↔mapa y la
 * reproducción del recorrido; aquí solo presentamos y delegamos los toques).
 */
export const TripDiario = forwardRef<HTMLDivElement, Props>(function TripDiario(
  {
    moments,
    route,
    activeMoment,
    selectedId,
    routeCaption,
    canCreate,
    playing,
    onTogglePlay,
    onSelectFromMap,
    onSelectFromCarousel,
    onExpand,
    onPlay,
    onAddMoment,
  },
  carouselRef,
) {
  const hasMoments = moments.length > 0

  return (
    <div className={`${styles.diario} lg-stagger`}>
      {/* Hero: mapa satélite enmarcado con el recorrido cosido. */}
      <div className={styles.heroMap}>
        <TripMap
          route={route}
          activeMoment={activeMoment}
          selectedChallengeId={selectedId}
          onSelectMoment={onSelectFromMap}
        />
        {routeCaption && (
          <div className={styles.heroCap} aria-hidden="true">
            <span className={styles.heroLabel}>El recorrido</span>
            <span className={styles.heroBig}>{routeCaption}</span>
          </div>
        )}
      </div>

      {hasMoments ? (
        <>
          <header className={styles.eyebrow}>
            <span className={styles.eyebrowTitle}>Momentos</span>
            <span className={styles.eyebrowMeta}>
              {moments.length} {moments.length === 1 ? 'recuerdo' : 'recuerdos'}
            </span>
          </header>

          <MomentTimeline
            moments={moments}
            selectedId={selectedId}
            onSelect={onSelectFromMap}
            playing={playing}
            onTogglePlay={onTogglePlay}
          />

          <div className={styles.carousel} ref={carouselRef}>
            {moments.map((m) => (
              <div key={m.challengeId} className={styles.slide} data-cid={m.challengeId}>
                <MomentCard
                  moment={m}
                  selected={m.challengeId === selectedId}
                  onSelect={() => onSelectFromCarousel(m.challengeId)}
                  onExpand={() => {
                    onSelectFromCarousel(m.challengeId)
                    onExpand(m)
                  }}
                  onPlay={m.status === 'active' ? () => onPlay(m.challengeId) : undefined}
                />
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className={styles.emptyWrap}>
          <EmptyState
            icon="🗺️"
            title="Aún no hay momentos"
            description="Añade el primero y empieza a llenar el mapa."
            actionLabel={canCreate ? 'Añadir momento' : undefined}
            onAction={canCreate ? onAddMoment : undefined}
          />
        </div>
      )}
    </div>
  )
})
