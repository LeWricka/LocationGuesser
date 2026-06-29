import { useEffect, useMemo, useRef, useState } from 'react'
import { EmptyState, Spinner, useReducedMotion } from '../../ui'
import { useSession } from '../../lib/session-context'
import { getGroupMembers, isMember, myGroups } from '../../lib/membership'
import type { Moment } from '../../lib/trip'
import { useTripData } from './useTripData'
import { TripMap } from './TripMap'
import { TripCover } from './TripCover'
import { MomentCard } from './MomentCard'
import { MomentSheet } from './MomentSheet'
import { MomentTimeline } from './MomentTimeline'
import styles from './TripPage.module.css'

interface Props {
  groupId: string
  /** Lanza el flujo de adivinar de un momento (reto). Lo cablea App al router. */
  onPlayChallenge: (challengeId: string) => void
  /** Abre el flujo de añadir momento (crear reto) del grupo. */
  onAddMoment: () => void
  /** Salta a la GroupPage clásica (marcador, ajustes, fin de temporada…). */
  onOpenClassic: () => void
  /** Vuelve a la home. */
  onBack: () => void
}

/**
 * Construye la línea "Tú, Amaia y N más" a partir de los nombres del grupo,
 * poniendo al usuario actual primero como "Tú". Vacía si aún no hay miembros.
 */
function membersLine(names: string[], myName: string | null): string {
  const others = myName ? names.filter((n) => n !== myName) : names
  const label: string[] = []
  if (myName) label.push('Tú')
  label.push(...others.slice(0, myName ? 1 : 2))
  const shown = label.length
  const rest = (myName ? 1 : 0) + others.length - shown
  const base = label.join(', ')
  if (rest > 0) return `${base} y ${rest} más`
  return base
}

/**
 * Pantalla "Viaje": el diario de viaje visual (renombra mentalmente al grupo).
 * Tres capas en z (§2 del spec): (a) mapa a sangre detrás de todo, (b) chrome
 * flotante arriba (volver, nombre del viaje, acceso al marcador clásico), (c)
 * carrusel horizontal de momentos abajo. Al tocar una tarjeta sube la hoja de
 * detalle. El juego es una CAPA opcional: solo el momento en juego ofrece jugar.
 */
// Intervalo entre saltos al "reproducir" el viaje. Suficiente para que el flyTo
// del mapa asiente y se lea cada momento, sin que la espera se haga larga.
const PLAYBACK_INTERVAL_MS = 2300

export function TripPage({ groupId, onPlayChallenge, onAddMoment, onOpenClassic, onBack }: Props) {
  const { user, profile } = useSession()
  const { group, moments, route, loading, error } = useTripData(groupId)
  // Con menos movimiento, los flyTo se vuelven saltos secos: reproducir un
  // recorrido animado pierde sentido, así que ocultamos el control (no autoplay).
  const reducedMotion = useReducedMotion()

  // Momento abierto en la hoja de detalle (null = cerrada).
  const [openMoment, setOpenMoment] = useState<Moment | null>(null)
  // Momento seleccionado (centra su pin en el mapa). Se sincroniza carrusel↔mapa.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // ¿Puede el usuario añadir momentos? (dueño del viaje). El RLS lo respalda igual.
  const [canCreate, setCanCreate] = useState(false)
  // Nombres de los miembros para la línea "Tú, X y N más".
  const [memberNames, setMemberNames] = useState<string[]>([])

  const carouselRef = useRef<HTMLDivElement>(null)
  // Evita reposicionar el scroll del carrusel cuando la selección vino DEL propio
  // carrusel (si no, pelearía con el gesto del usuario al hacer swipe).
  const selectionFromCarousel = useRef(false)
  // Solo auto-seleccionamos el momento en juego UNA vez (al abrir): después
  // respetamos lo que el usuario toque, no le robamos la selección en cada refresh.
  const didAutoSelect = useRef(false)

  // Reproducir el viaje: recorre los momentos en orden cronológico seleccionando
  // cada uno (cada selección centra el mapa con flyTo + desplaza el carrusel, así
  // que el efecto es "ver el viaje en marcha"). El stepper vive aquí porque es
  // quien tiene selectedId + onSelectMoment; la UI del botón está en MomentTimeline.
  const [playing, setPlaying] = useState(false)
  // Marca que la PRÓXIMA selección la dispara el stepper, para no auto-pausar por
  // ella (cualquier selección que NO venga del stepper = interacción del usuario).
  const stepperSelecting = useRef(false)

  // Permisos + miembros: leemos si soy dueño (puedo crear) y los nombres del
  // grupo. Tolerante: si falla, no bloquea ver el viaje (solo oculta el FAB).
  useEffect(() => {
    if (!user) return
    let cancelled = false
    void (async () => {
      try {
        const member = await isMember(groupId, user.id)
        if (cancelled || !member) return
        const [mine, members] = await Promise.all([myGroups(user.id), getGroupMembers(groupId)])
        if (cancelled) return
        setCanCreate(mine.find((g) => g.id === groupId)?.isOwner ?? false)
        setMemberNames(members.map((m) => m.name))
      } catch {
        // Permisos/miembros no resueltos: tratamos como miembro sin gestión.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [groupId, user])

  const activeMoment = useMemo(() => moments.find((m) => m.status === 'active') ?? null, [moments])
  // Nº de momentos EN JUEGO (point 5): alimenta el indicador del chrome para que se
  // vea de un vistazo dónde se puede jugar. Hoy el modelo permite 1 activo, pero
  // contamos por si en el futuro hay varios; el indicador se oculta si es 0.
  const liveCount = useMemo(() => moments.filter((m) => m.status === 'active').length, [moments])

  // Línea "Tú, X y N más": el nombre propio sale del perfil de sesión (display_name).
  const subtitle = useMemo(
    () => membersLine(memberNames, profile?.display_name ?? null),
    [memberNames, profile],
  )

  const title = group?.name?.trim() || groupId

  // Cualquier selección que NO venga del stepper es interacción del usuario (tocar
  // un pin, una tarjeta, una marca de la timeline o el indicador "en juego"): pausa
  // la reproducción para devolverle el control. El stepper limpia su propia marca.
  const stopPlaybackOnUserSelect = () => {
    if (stepperSelecting.current) return
    setPlaying(false)
  }

  // Selección: centra el pin en el mapa. Marcamos el origen para no auto-scrollear
  // el carrusel cuando la selección ya vino de él.
  const selectFromCarousel = (challengeId: string) => {
    stopPlaybackOnUserSelect()
    selectionFromCarousel.current = true
    setSelectedId(challengeId)
  }
  const selectFromMap = (challengeId: string) => {
    stopPlaybackOnUserSelect()
    selectionFromCarousel.current = false
    setSelectedId(challengeId)
  }

  // Cuando el mapa selecciona un momento (tocar pin), desplazamos el carrusel a su
  // tarjeta para mantener carrusel↔mapa en sincronía.
  useEffect(() => {
    if (!selectedId || selectionFromCarousel.current) return
    const el = carouselRef.current?.querySelector<HTMLElement>(`[data-cid="${selectedId}"]`)
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [selectedId])

  // Point 5: al abrir el viaje, si hay un momento EN JUEGO lo seleccionamos solo
  // (centra su pin + lo deja a la vista en el carrusel) para que el sitio donde se
  // juega salte a la vista. Solo una vez y solo si el usuario no ha elegido ya otro.
  useEffect(() => {
    if (didAutoSelect.current || selectedId || !activeMoment) return
    didAutoSelect.current = true
    selectFromMap(activeMoment.challengeId)
    const el = carouselRef.current?.querySelector<HTMLElement>(
      `[data-cid="${activeMoment.challengeId}"]`,
    )
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    // selectFromMap es estable en la práctica; no lo listamos para no re-disparar
    // la auto-selección (este efecto solo debe correr al abrir el viaje).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMoment, selectedId])

  // Stepper de reproducción: mientras `playing`, avanza al siguiente momento cada
  // PLAYBACK_INTERVAL_MS empezando por el primero. Seleccionar centra el mapa
  // (flyTo) y desplaza el carrusel. Al llegar al último, para (no hace bucle: el
  // viaje "termina" donde acaba). El intervalo se limpia al pausar y al desmontar.
  useEffect(() => {
    if (!playing) return
    // Arrancar siempre desde el principio del viaje para que el recorrido se lea
    // completo aunque hubiera un momento seleccionado.
    let index = 0
    const step = () => {
      const moment = moments[index]
      if (!moment) {
        setPlaying(false)
        return
      }
      stepperSelecting.current = true
      // Reusa la selección "desde el mapa": centra el pin y sincroniza el carrusel.
      selectFromMap(moment.challengeId)
      stepperSelecting.current = false
    }
    step() // primer salto inmediato, sin esperar el primer tick
    const id = window.setInterval(() => {
      index += 1
      if (index >= moments.length) {
        window.clearInterval(id)
        setPlaying(false)
        return
      }
      step()
    }, PLAYBACK_INTERVAL_MS)
    return () => window.clearInterval(id)
    // selectFromMap es estable en la práctica (closures sobre refs/setState); no lo
    // listamos para no reiniciar el recorrido en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, moments])

  const togglePlay = () => setPlaying((p) => !p)

  if (loading) {
    return (
      <main className={styles.center}>
        <Spinner size={32} />
      </main>
    )
  }

  if (error) {
    return (
      <main className={styles.center}>
        <EmptyState
          tone="danger"
          icon="🌍"
          title="No hemos podido cargar el viaje"
          description={error}
        />
      </main>
    )
  }

  const hasMoments = moments.length > 0

  return (
    <div className={styles.screen}>
      {/* (a) Mapa a sangre detrás de todo. */}
      <div className={styles.mapLayer}>
        <TripMap
          route={route}
          activeMoment={activeMoment}
          selectedChallengeId={selectedId}
          onSelectMoment={selectFromMap}
        />
      </div>

      {/* (b) Chrome flotante arriba (pastillas de vidrio sobre el mapa). */}
      <header className={styles.chrome}>
        <button type="button" className={styles.iconPill} onClick={onBack} aria-label="Volver">
          ←
        </button>
        {/* Portada editorial (Fase 2, §1.8): eleva la antigua titlePill al nombre
            en cursiva manuscrita + stats del viaje (días/km/momentos). Sigue
            siendo una pastilla glass sobre el mapa, no tapa el carrusel. */}
        <TripCover title={title} members={subtitle} moments={moments} route={route} />
        {/* Point 5: indicador "🔴 N en juego". Tocarlo selecciona el momento en
            juego (centra su pin + lo trae a la vista), para que el sitio donde se
            puede jugar salte a la vista de un vistazo. */}
        {liveCount > 0 && activeMoment && (
          <button
            type="button"
            className={styles.livePill}
            onClick={() => selectFromMap(activeMoment.challengeId)}
            aria-label={`${liveCount} en juego — ir al momento`}
          >
            <span className={styles.liveDot} aria-hidden="true" />
            {liveCount} en juego
          </button>
        )}
        <button
          type="button"
          className={styles.iconPill}
          onClick={onOpenClassic}
          aria-label="Ver marcador y ajustes"
        >
          ⋯
        </button>
      </header>

      {/* (c) Dock inferior: línea temporal (point 2) + carrusel de momentos. */}
      {hasMoments ? (
        <div className={styles.dock}>
          {/* Franja cronológica sobre el carrusel: tocar una marca selecciona ese
              momento (centra el mapa + desplaza el carrusel). */}
          <MomentTimeline
            moments={moments}
            selectedId={selectedId}
            onSelect={selectFromMap}
            // Con prefers-reduced-motion no ofrecemos reproducción (sin control =
            // sin autoplay animado); el usuario sigue navegando momento a momento.
            playing={reducedMotion ? undefined : playing}
            onTogglePlay={reducedMotion ? undefined : togglePlay}
          />

          <div className={styles.carousel} ref={carouselRef}>
            {moments.map((m) => (
              <div key={m.challengeId} className={styles.slide} data-cid={m.challengeId}>
                <MomentCard
                  moment={m}
                  selected={m.challengeId === selectedId}
                  // Tocar la foto = seleccionar + el mapa hace ZOOM a su pin (point 3).
                  onSelect={() => selectFromCarousel(m.challengeId)}
                  // Abrir el detalle es explícito (botón "expandir"): no choca con el zoom.
                  onExpand={() => {
                    selectFromCarousel(m.challengeId)
                    setOpenMoment(m)
                  }}
                  onPlay={m.status === 'active' ? () => onPlayChallenge(m.challengeId) : undefined}
                />
              </div>
            ))}
          </div>
        </div>
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

      {/* FAB de añadir momento (solo dueño y si ya hay momentos: en vacío el CTA
          vive en el EmptyState para no duplicar la acción). */}
      {canCreate && hasMoments && (
        <button
          type="button"
          className={styles.fab}
          onClick={onAddMoment}
          aria-label="Añadir momento"
        >
          <span aria-hidden="true">＋</span>
        </button>
      )}

      {/* Hoja de detalle: sube al tocar una tarjeta. */}
      <MomentSheet
        moment={openMoment}
        onClose={() => setOpenMoment(null)}
        onPlay={
          openMoment?.status === 'active'
            ? () => onPlayChallenge(openMoment.challengeId)
            : undefined
        }
      />
    </div>
  )
}
