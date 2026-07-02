import { Map as MapIcon } from 'lucide-react'
import { EmptyState, Icon } from '../../ui'
import { ShellInmersivo } from '../../ui/shells'
import type { Moment, RoutePoint } from '../../lib/trip'
import { TripMap } from './TripMap'
import { MomentTimeline } from './MomentTimeline'
import { DiarioFeed } from './DiarioFeed'
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
 * Sección DIARIO del viaje: patrón globo/mapa héroe + hoja (ShellInmersivo).
 *
 * El MAPA SATÉLITE/GLOBO ocupa TODA la pantalla como protagonista a sangre
 * (backdrop de ShellInmersivo). La hoja blanca asoma desde abajo con el feed
 * foto-first (DiarioFeed): cada momento pasa del carrusel compacto a una
 * TARJETA GRANDE (ratio 3:2, foto real, título + lugar + fecha sobre velo).
 *
 * La timeline de puntos (navegación temporal) flota entre el mapa y la hoja
 * como chrome translúcido — vive en el backdrop-container para posicionarse
 * sobre el mapa sin entrar en la hoja.
 */
export function TripDiario({
  moments,
  route,
  activeMoment,
  selectedId,
  canCreate,
  playing,
  onTogglePlay,
  onSelectFromMap,
  onExpand,
  onPlay,
  onAddMoment,
}: Props) {
  const hasMoments = moments.length > 0

  return (
    <div className={styles.diario}>
      <ShellInmersivo
        backdrop={
          /* El mapa y la timeline de puntos viven en el backdrop.
             La timeline flota justo encima del borde superior de la hoja (sin
             entrar en ella), usando posición absoluta bottom fija dentro del
             contenedor del backdrop. El mapa llena el resto del backdrop. */
          <div className={styles.backdropContainer}>
            <div className={styles.map}>
              <TripMap
                route={route}
                activeMoment={activeMoment}
                selectedChallengeId={selectedId}
                playing={playing}
                onSelectMoment={onSelectFromMap}
              />
            </div>
            {/* Timeline: flota sobre el mapa, encima del borde de la hoja. */}
            {hasMoments && (
              <div className={styles.timelineFloat}>
                <MomentTimeline
                  moments={moments}
                  selectedId={selectedId}
                  onSelect={onSelectFromMap}
                  playing={playing}
                  onTogglePlay={onTogglePlay}
                />
              </div>
            )}
          </div>
        }
      >
        {/* Feed foto-first dentro de la hoja: lista vertical de tarjetas grandes
            (DiarioFeed). Si aún no hay momentos, estado vacío centrado. */}
        {hasMoments ? (
          <DiarioFeed moments={moments} onExpand={onExpand} onPlay={onPlay} />
        ) : (
          <EmptyState
            icon={<Icon icon={MapIcon} size={32} />}
            title="Aún no hay momentos"
            description="Añade el primero y empieza a llenar el mapa."
            actionLabel={canCreate ? 'Añadir momento' : undefined}
            onAction={canCreate ? onAddMoment : undefined}
          />
        )}
      </ShellInmersivo>
    </div>
  )
}
