import { forwardRef, useMemo, type RefObject } from 'react'
import { Map as MapIcon, Share2 } from 'lucide-react'
import { Button, EmptyState, Icon } from '../../ui'
import {
  fuseMemoryWithChallenge,
  pairedChallengeByMemoryId,
  type Moment,
  type RoutePoint,
} from '../../lib/trip'
import { TripMap } from './TripMap'
import { MomentCard } from './MomentCard'
import { MomentTimeline } from './MomentTimeline'
import styles from './TripDiario.module.css'

interface Props {
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
  /**
   * Ancla del mapa a sangre para `GuidedTour` (viaje de ejemplo, onboarding
   * nuevo pieza 4/4): "Cada parada del viaje queda aquí, en el Diario." Opcional
   * y sin efecto fuera de la guía — el resto de usos no lo pasan.
   */
  mapRef?: RefObject<HTMLDivElement | null>
  /**
   * Ancla de la PRIMERA tarjeta del carrusel para `GuidedTour`: "Una foto, un
   * vídeo o una nota de voz, con su sitio." Igual de opcional que `mapRef`.
   */
  firstMomentRef?: RefObject<HTMLDivElement | null>
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
    selectedId,
    canCreate,
    playing,
    onTogglePlay,
    onSelectFromMap,
    onExpand,
    onPlay,
    onAddMoment,
    onInvite,
    mapRef,
    firstMomentRef,
  },
  carouselRef,
) {
  // Reto ASOCIADO a un recuerdo del viaje por compartir la MISMA foto (issue
  // #839, `pairedChallengeByMemoryId`): calculado UNA vez para todo el Diario.
  const pairedByMemoryId = useMemo(() => pairedChallengeByMemoryId(moments), [moments])

  // Fusión momento↔reto (issue #839): un reto asociado ya NO se pinta como
  // entrada propia — antes timeline y carrusel repetían la MISMA foto en dos
  // paradas/tarjetas (un punto teal del momento + uno rojo "En juego" del
  // reto). Aquí se funde en la tarjeta del recuerdo (`fuseMemoryWithChallenge`,
  // que hereda su chip/CTA/cuenta de jugadas): timeline y carrusel comparten
  // esta MISMA lista, así nunca hay dos paradas para el mismo par. Un reto SIN
  // recuerdo asociado sigue pintándose suelto, como hasta ahora.
  const displayMoments = useMemo<Moment[]>(() => {
    const mergedAwayIds = new Set(Array.from(pairedByMemoryId.values(), (c) => c.challengeId))
    return moments
      .filter((m) => !mergedAwayIds.has(m.challengeId))
      .map((m) => {
        const challenge = pairedByMemoryId.get(m.challengeId)
        return challenge ? fuseMemoryWithChallenge(m, challenge) : m
      })
  }, [moments, pairedByMemoryId])

  // Momento ORIGINAL (sin fusionar) por id: `onExpand` debe abrir siempre el
  // recuerdo REAL (`MomentSheet` no sabe de tarjetas fusionadas ni debe recibir
  // un id de reto disfrazado de recuerdo), nunca la versión de PRESENTACIÓN con
  // el estado de juego superpuesto por `fuseMemoryWithChallenge`.
  const originalById = useMemo(() => new Map(moments.map((m) => [m.challengeId, m])), [moments])

  const hasMoments = displayMoments.length > 0

  return (
    <div className={styles.diario}>
      {/* Mapa A SANGRE: llena toda la sección (el protagonista del diario). Los pines
          de momentos viven sobre él; el dock de abajo flota encima.
          NOTA (issue #914): este mapa YA NO lleva `view-transition-name`. Antes
          (issue #589) compartía `trip-hero-<id>` con la tarjeta de la Home para
          "crecer" desde ella al entrar. Ese héroe solo disparaba en revisitas
          (en la 1ª visita el viaje pinta esqueleto, sin el elemento héroe) y, cuando
          sí disparaba, el mapa a pantalla completa crecía POR ENCIMA del chrome (la
          barra Diario·Bitácora·Marcador y la cabecera), tapándolo a media transición:
          se veían las pestañas → una "malla" cubriéndolo todo → las pestañas otra vez.
          Sin nombre héroe, la navegación Home→viaje es un único cross-fade coherente. */}
      <div className={styles.map} ref={mapRef}>
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
            moments={displayMoments}
            selectedId={selectedId}
            onSelect={onSelectFromMap}
            playing={playing}
            onTogglePlay={onTogglePlay}
          />

          <div className={styles.carousel} ref={carouselRef}>
            {displayMoments.map((m, i) => (
              <div
                key={m.challengeId}
                className={styles.slide}
                data-cid={m.challengeId}
                ref={i === 0 ? firstMomentRef : undefined}
              >
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
                  // la vez y "abrir el detalle" tapaba el vuelo del mapa). Pasa el
                  // momento ORIGINAL (`originalById`), nunca la versión fusionada de
                  // presentación (issue #839): `MomentSheet` no sabe de fusión.
                  onExpand={() => {
                    if (m.challengeId === selectedId) {
                      onExpand(originalById.get(m.challengeId) ?? m)
                    } else {
                      onSelectFromMap(m.challengeId)
                    }
                  }}
                  // El propio reto activo no ofrece "Adivina →" (el creador no puede
                  // jugar su reto, guarda #513): MomentCard pinta el recuento de
                  // jugadas en su lugar cuando `moment.isOwn` (#578). En una tarjeta
                  // FUSIONADA, "Adivina" debe lanzar el id REAL del reto asociado
                  // (`pairedByMemoryId`), no el del recuerdo (no es jugable) — issue #839.
                  onPlay={
                    m.status === 'active' && !m.isOwn
                      ? () =>
                          onPlay(pairedByMemoryId.get(m.challengeId)?.challengeId ?? m.challengeId)
                      : undefined
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
