import { forwardRef } from 'react'
import { Map as MapIcon } from 'lucide-react'
import { EmptyState, Icon } from '../../ui'
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
 * Sección DIARIO del viaje: el MAPA SATÉLITE/GLOBO A SANGRE es el protagonista (llena
 * la pantalla, estilo Polarsteps) y los momentos FLOTAN ENCIMA en un dock inferior
 * (timeline + carrusel) con los pines sobre el mapa. NO es un mapa "enmarcado" con la
 * lista debajo: el mapa manda y el contenido se posa sobre él.
 *
 * Es una de las dos páginas hermanas de TripPage; vive en un panel a sangre (sin
 * scroll vertical: el mapa ocupa todo y el dock flota). El `ref` apunta al carrusel
 * (TripPage gobierna el scroll-sync carrusel↔mapa y la reproducción del recorrido).
 */
export const TripDiario = forwardRef<HTMLDivElement, Props>(function TripDiario(
  {
    moments,
    route,
    activeMoment,
    selectedId,
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
    <div className={styles.diario}>
      {/* Mapa A SANGRE: llena toda la sección (el protagonista del diario). Los pines
          de momentos viven sobre él; el dock de abajo flota encima. */}
      <div className={styles.map}>
        <TripMap
          route={route}
          activeMoment={activeMoment}
          selectedChallengeId={selectedId}
          onSelectMoment={onSelectFromMap}
        />
      </div>

      {hasMoments ? (
        /* DOCK flotante inferior: timeline + carrusel de momentos posados sobre el
           mapa. El velo funde el dock con el mapa para que el contenido respire. */
        <div className={styles.dock}>
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
                  onExpand={() => {
                    onSelectFromCarousel(m.challengeId)
                    onExpand(m)
                  }}
                  onPlay={m.status === 'active' ? () => onPlay(m.challengeId) : undefined}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Sin momentos: tarjeta flotante centrada sobre el mapa (no rompe el a-sangre). */
        <div className={styles.emptyDock}>
          <EmptyState
            icon={<Icon icon={MapIcon} size={32} />}
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
