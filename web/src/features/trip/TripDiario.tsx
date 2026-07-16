import { forwardRef } from 'react'
import { Map as MapIcon, Share2 } from 'lucide-react'
import { Button, EmptyState, Icon } from '../../ui'
import type { Moment, RoutePoint } from '../../lib/trip'
import { TripMap } from './TripMap'
import { MomentCard } from './MomentCard'
import { MomentTimeline } from './MomentTimeline'
import styles from './TripDiario.module.css'

/**
 * Nombre de la transición héroe home↔diario (issue #589). Misma función que
 * `heroTransitionName` en `ui/HomeDashboard.tsx` — se duplica (en vez de
 * importarse) a propósito: `ui/` no debe depender de `features/`, y es una línea
 * pura sin estado que ambos lados deben mantener en sincronía por convención de
 * nombre, no por import.
 */
function heroTransitionName(groupId: string): string {
  return `trip-hero-${groupId}`
}

interface Props {
  /** Id del viaje: nombra la transición héroe compartida con la Home (issue #589). */
  groupId: string
  moments: Moment[]
  route: RoutePoint[]
  selectedId: string | null
  /** ¿Puede el usuario añadir momentos? (issue #783: cualquier MIEMBRO del
   * viaje) — gobierna el CTA del vacío. */
  canCreate: boolean
  /** Reproducción del recorrido (undefined bajo reduced-motion: sin control). */
  playing?: boolean
  onTogglePlay?: () => void
  onSelectFromMap: (challengeId: string) => void
  onExpand: (moment: Moment) => void
  onPlay: (challengeId: string) => void
  onAddMoment: () => void
  /** Abre la hoja de invitar (CTA secundario del vacío: invitar es tan visible
   * como añadir el primer momento — issue #510, invitar quedaba escondido tras el ···). */
  onInvite: () => void
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
    groupId,
    moments,
    route,
    selectedId,
    canCreate,
    playing,
    onTogglePlay,
    onSelectFromMap,
    onExpand,
    onPlay,
    onAddMoment,
    onInvite,
  },
  carouselRef,
) {
  const hasMoments = moments.length > 0

  return (
    <div className={styles.diario}>
      {/* Mapa A SANGRE: llena toda la sección (el protagonista del diario). Los pines
          de momentos viven sobre él; el dock de abajo flota encima.
          Transición héroe home→diario (issue #589): este mapa es el aterrizaje más
          honesto para la foto de la tarjeta tocada en HomeDashboard — es el elemento
          que YA hace de protagonista del Diario (mismo criterio de sistema que el
          resto de la app), así que crecer hacia él no inventa un héroe-foto nuevo y
          pesado que el viaje no tiene. Mismo `view-transition-name` que la tarjeta
          (HomeDashboard.tsx), puesto SIEMPRE mientras el Diario está montado: hace
          de "new" al llegar y de "old" al volver (la Home reclama el nombre de
          vuelta vía sessionStorage, ver `heroReturnId` en HomeDashboard.tsx). */}
      <div className={styles.map} style={{ viewTransitionName: heroTransitionName(groupId) }}>
        <TripMap
          route={route}
          selectedChallengeId={selectedId}
          playing={playing}
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
                  // Tocar una tarjeta que NO es la activa: solo SELECCIONA — mismo
                  // camino que un pin del mapa o un punto del timeline
                  // (`onSelectFromMap`), NO el de "ya se centró sola al soltar el
                  // swipe" (`selectFromCarousel`, en TripPage): así el efecto de
                  // TripPage que centra la tarjeta seleccionada en el carrusel SÍ
                  // dispara (`scrollCardIntoView`), reutilizando su guard existente
                  // (`programmaticScroll`) para que el scroll programático no se pelee
                  // con el scroll-snap nativo. Tocar la YA activa abre el detalle
                  // (issue #605, punto 2 — antes un solo toque hacía las dos cosas a
                  // la vez y "abrir el detalle" tapaba el vuelo del mapa).
                  onExpand={() => {
                    if (m.challengeId === selectedId) {
                      onExpand(m)
                    } else {
                      onSelectFromMap(m.challengeId)
                    }
                  }}
                  // El propio reto activo no ofrece "Adivina →" (el creador no puede
                  // jugar su reto, guarda #513): MomentCard pinta el recuento de
                  // jugadas en su lugar cuando `moment.isOwn` (#578).
                  onPlay={
                    m.status === 'active' && !m.isOwn ? () => onPlay(m.challengeId) : undefined
                  }
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Sin momentos: tarjeta flotante centrada sobre el mapa (no rompe el a-sangre).
           Además de "Añadir momento" (dueño), un secundario "Invitar" — cualquier
           miembro puede repartir el enlace, y antes solo vivía tras el menú ···. */
        <div className={styles.emptyDock}>
          <EmptyState
            icon={<Icon icon={MapIcon} size={32} />}
            title="Aún no hay momentos"
            description="Añade el primero y empieza a llenar el mapa."
            actionLabel={canCreate ? 'Añadir momento' : undefined}
            onAction={canCreate ? onAddMoment : undefined}
          />
          <Button
            variant="ghost"
            size="sm"
            fullWidth
            className={styles.emptyInvite}
            onClick={onInvite}
          >
            <Icon icon={Share2} size={16} /> Invitar
          </Button>
        </div>
      )}
    </div>
  )
})
