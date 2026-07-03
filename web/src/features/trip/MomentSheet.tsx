import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ListOrdered, MapPin, Pencil, Target, Trash2, User } from 'lucide-react'
import { Badge, Button, ChallengePhoto, Icon, Modal, useReducedMotion, useToast } from '../../ui'
import type { Moment } from '../../lib/trip'
import type { LatLng } from '../../lib/geo'
import { fmtDist, fmtNumber } from '../../lib/geo'
import {
  deleteChallenge,
  promoteToChallenge,
  updateChallengeDescription,
  updateMoment,
} from '../../lib/challenges'
import { getExistingVote } from '../../lib/votes'
import type { Vote } from '../../lib/database.types'
import { deadlineFromMinutes } from '../../lib/time'
import { lockBodyScroll } from '../../lib/scrollLock'
import { MapPicker } from '../create/MapPicker'
import { Countdown } from './Countdown'
import { EditMomentForm } from './EditMomentForm'
import { MomentGallery } from './MomentGallery'
import { MomentMiniMap } from './MomentMiniMap'
import styles from './MomentSheet.module.css'

interface Props {
  /** Momento a mostrar; `null` = hoja cerrada. */
  moment: Moment | null
  /** El usuario es dueño del viaje: puede editar la descripción y convertir en reto. */
  canEdit?: boolean
  /**
   * Id del usuario que mira la hoja, o null sin sesión resuelta. Solo se usa para
   * "Tu resultado" (#580): consulta MI voto en un reto cerrado (no el marcador
   * entero). Sin id no se consulta nada (el bloque cae a "Cargando…" indefinido,
   * caso que no debería darse en producción con sesión activa).
   */
  myUserId?: string | null
  /**
   * Fechas del viaje (si las tiene, migración 0027): acotan el tope superior del
   * calendario al editar un recuerdo, mismo criterio que "Nuevo recuerdo" (#565).
   * `null`/`undefined` si el viaje no tiene fechas — el tope cae a "hoy".
   */
  tripStartsOn?: string | null
  tripEndsOn?: string | null
  /**
   * Arranca la hoja directamente en modo EDITAR (papel) en vez de la vista. Solo
   * para la galería visual y tests: en producción siempre se entra por "Editar
   * recuerdo" desde la vista.
   */
  initialEditing?: boolean
  onClose: () => void
  /** Solo en momentos en juego: lanza el flujo de adivinar. */
  onPlay?: () => void
  /**
   * CTA "Ver marcador" en un reto CERRADO (#580): salta a la pestaña Marcador
   * del viaje. Sin esta prop el botón no se muestra (p. ej. en la galería visual).
   */
  onViewMarcador?: () => void
  /** Tras convertir un recuerdo en reto: refresca el viaje (recarga datos). */
  onPromoted?: () => void
  /**
   * Tras editar un RECUERDO (título, fecha, lugar, descripción): refresca el viaje.
   * Reutiliza `onPromoted` no sería claro, así que va aparte aunque haga lo mismo.
   */
  onEdited?: () => void
  /**
   * Editar un RETO: lo lleva el padre (TripPage) al editor de reto completo
   * (`EditChallenge`), que maneja la mecánica (plazo, Street View, votos). La hoja
   * solo dispara la acción; el editor vive a nivel de pantalla.
   */
  onEditChallenge?: (challengeId: string) => void
  /** Tras BORRAR el momento (recuerdo o reto): refresca el viaje y cierra la hoja. */
  onDeleted?: () => void
}

// Fecha del momento (created_at ISO) → valor `YYYY-MM-DD` para el <input type="date">.
function dateInputValue(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  // Local, no UTC: el dueño piensa en su día, no en el huso del servidor.
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// `YYYY-MM-DD` del input → ISO conservando la hora original del momento (para no
// perder el orden relativo entre momentos del mismo día al re-guardar la fecha).
function dateInputToIso(value: string, originalIso: string): string {
  const original = new Date(originalIso)
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return originalIso
  const next = new Date(original)
  next.setFullYear(y, m - 1, d)
  return next.toISOString()
}

// Fecha larga legible del momento ("8 de abril de 2026"). Null si no es válida.
const dateFmt = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
function formatMomentDate(value: string): string | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return dateFmt.format(date)
}

// Fecha de hoy en `YYYY-MM-DD` local — mismo criterio que `AddMoment` (no se puede
// importar de `features/create`; helper minúsculo, se duplica a propósito).
function todayIso(): string {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10)
}

// Tope superior del calendario al editar un recuerdo: mismo criterio que el campo
// "Fecha" de "Nuevo recuerdo" (#565) — hoy, salvo que el viaje sea FUTURO (con
// fechas), en cuyo caso se amplía hasta su fin. Sin `min`: AddMoment tampoco lo
// aplica (aplicar "lo mismo" barato es solo el tope superior).
function computeEditMaxDate(startsOn: string | null, endsOn: string | null): string {
  const today = todayIso()
  const isFutureTrip = startsOn != null && startsOn > today
  return isFutureTrip && endsOn ? endsOn : today
}

// Umbral de arrastre (px) a partir del cual soltar cierra la hoja. Por debajo,
// la hoja vuelve a su sitio (gesto cancelado).
const DRAG_CLOSE_PX = 110

// Timeout de SEGURIDAD (ms) para el cierre: si `transitionend` no llega —
// `prefers-reduced-motion` detectado distinto entre CSS y JS, un remontaje a
// media caída, o cualquier otro borde de la animación de salida (`--motion-
// duration-base`, 200ms) — este temporizador fuerza igualmente el desmontaje.
// ~2× la transición esperada: no compite con `onTransitionEnd` en el camino
// feliz (que resuelve antes y lo cancela), solo actúa cuando de verdad hace
// falta (issue #605: el overlay se quedaba bloqueando la app para siempre).
const CLOSE_SAFETY_MS = 400

// Duración del reto al convertir: mismas paradas que el asistente de "Añadir
// recuerdo" para coherencia. El plazo se calcula relativo a AHORA al guardar.
const DURATION_STOPS: { minutes: number; label: string }[] = [
  { minutes: 15, label: '15 min' },
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 h' },
  { minutes: 240, label: '4 h' },
  { minutes: 720, label: '12 h' },
  { minutes: 1440, label: '24 h' },
  { minutes: 2880, label: '48 h' },
]
const DEFAULT_DURATION_INDEX = DURATION_STOPS.findIndex((s) => s.minutes === 240)

// Tiempo por jugada en segundos; null = sin límite. Default: 1 min.
const GUESS_OPTIONS: { value: number | null; label: string }[] = [
  { value: 60, label: '1 min' },
  { value: 120, label: '2 min' },
  { value: 180, label: '3 min' },
  { value: null, label: 'Sin límite' },
]

const SPAIN: LatLng = { lat: 40.4, lng: -3.7 }

/**
 * Hoja de detalle de un momento (bottom sheet, §2 del spec). AUTOCONTENIDA a
 * propósito: no usa el `Modal` compartido para poder subir desde abajo y cerrarse
 * arrastrando, sin tocar ese componente.
 *
 * RECUERDO vs RETO (separación contenido/reto):
 *  - RECUERDO (`is_challenge = false`): foto + lugar VISIBLE (país/fecha) + descripción.
 *    SIN "Adivina" ni cuenta atrás. El DUEÑO ve "Convertir en reto" (promueve a juego).
 *  - RETO: chip "🎯 Reto"; si está EN JUEGO, badge + cuenta atrás + "Adivina →".
 *
 * Accesibilidad: rol diálogo, cierra con Escape y al tocar el fondo; respeta
 * `prefers-reduced-motion` vía CSS (la animación de subida se anula por media query).
 */
export function MomentSheet({
  moment,
  canEdit = false,
  myUserId = null,
  tripStartsOn = null,
  tripEndsOn = null,
  initialEditing = false,
  onClose,
  onPlay,
  onViewMarcador,
  onPromoted,
  onEdited,
  onEditChallenge,
  onDeleted,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const toast = useToast()
  // Desplazamiento vertical en curso del gesto de arrastre (0 = en su sitio).
  const [dragY, setDragY] = useState(0)
  const dragStart = useRef<number | null>(null)
  // ¿La hoja está ejecutando su animación de SALIDA? Mientras cae hacia abajo
  // ignoramos gestos nuevos y esperamos al fin de la transición para llamar a
  // onClose: la hoja sale animada (continuidad), nunca desaparece de golpe.
  const [closing, setClosing] = useState(false)
  // ¿El dedo está arrastrando ahora mismo? Mientras arrastra el transform es 1:1
  // (sin transición); al soltar, la transición del panel anima el asentamiento.
  const [dragging, setDragging] = useState(false)
  const closeTimer = useRef<number | null>(null)
  // Con menos movimiento: la salida no se anima (cierre inmediato, aceptable).
  const reducedMotion = useReducedMotion()

  // Descripción del día: estado LOCAL sembrado del momento. El panel se remonta por
  // `key` al cambiar de momento (ver más abajo), así que el estado inicial siempre
  // refleja el momento abierto. Tras guardar, lo dejamos optimista (el Realtime del
  // viaje escucha votos, no `challenges`, así que no se refrescaría solo).
  const [description, setDescription] = useState(moment?.description ?? '')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  // ── Editar el RECUERDO (título, fecha, lugar) ───────────────────────────────
  // Sub-formulario del dueño sobre un recuerdo. Estado local sembrado del momento;
  // el panel se remonta por `key`, así que arranca limpio en cada apertura.
  const [editingMeta, setEditingMeta] = useState(initialEditing)
  const [editTitle, setEditTitle] = useState(moment?.title ?? '')
  const [editDate, setEditDate] = useState(moment ? dateInputValue(moment.date) : '')
  const [editPlace, setEditPlace] = useState<LatLng | null>(
    moment?.lat != null && moment.lng != null ? { lat: moment.lat, lng: moment.lng } : null,
  )
  const [savingMeta, setSavingMeta] = useState(false)

  // ── Borrar el momento (recuerdo o reto) con confirmación ────────────────────
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // ── Convertir en reto (sub-flujo del dueño sobre un recuerdo) ───────────────
  const [promoting, setPromoting] = useState(false)
  // Punto-RESPUESTA del reto: arranca en el lugar visible del recuerdo (place_*), el
  // dueño puede ajustarlo en el mapa. Al promover pasa a ser la coordenada OCULTA.
  const [answer, setAnswer] = useState<LatLng | null>(null)
  const [durationIndex, setDurationIndex] = useState(DEFAULT_DURATION_INDEX)
  const [guessSeconds, setGuessSeconds] = useState<number | null>(60)
  const [promoteBusy, setPromoteBusy] = useState(false)

  // ── "Tu resultado" en un reto CERRADO (#580) ────────────────────────────────
  // Mi voto en ESTE reto: undefined = cargando/no aplica, null = no jugué. Consulta
  // ligera de UNA fila (getExistingVote), no el marcador entero — solo cuando el
  // reto está cerrado y NO es mío (`isOwn`, #582: quién CREÓ este reto en concreto,
  // no si soy el dueño del viaje — un miembro cualquiera puede crear un reto). El
  // creador ve el recuento, no un resultado fingido. Depende de campos PRIMITIVOS
  // de `moment` (no de su referencia): el objeto se recrea en cada refresco de
  // votos del viaje (Realtime), y no queremos relanzar la consulta ni parpadear a
  // "Cargando…" por un voto ajeno.
  const [myVote, setMyVote] = useState<Vote | null | undefined>(undefined)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset síncrono al cambiar de momento (evita enseñar el resultado del anterior mientras carga el nuevo)
    setMyVote(undefined)
    if (!moment) return
    const isClosedChallenge =
      moment.isChallenge && moment.status !== 'recuerdo' && moment.status !== 'active'
    if (!isClosedChallenge || moment.isOwn || !myUserId) return
    let cancelled = false
    getExistingVote(moment.challengeId, myUserId)
      .then((vote) => {
        if (!cancelled) setMyVote(vote)
      })
      .catch(() => {
        if (!cancelled) setMyVote(null)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps primitivas a propósito, ver comentario arriba
  }, [moment?.challengeId, moment?.isChallenge, moment?.status, moment?.isOwn, myUserId])

  // Cierra la hoja CON ANIMACIÓN DE SALIDA (continuidad de movimiento, §6): en vez
  // de desaparecer de golpe, marca `closing` para que el panel caiga hacia abajo
  // (transición de `transform` con `--motion-ease-exit`) y, al terminar, llama a
  // onClose (el padre pone moment=null → desmonta). Con menos movimiento cierra al
  // instante. Idempotente: un segundo disparo mientras cae no reencola nada.
  const close = () => {
    if (closing) return
    if (reducedMotion) {
      setDragY(0)
      onClose()
      return
    }
    setClosing(true)
    closeTimer.current = window.setTimeout(onClose, CLOSE_SAFETY_MS)
  }

  // Si el momento desaparece (padre desmonta) limpiamos el temporizador pendiente.
  useEffect(() => {
    return () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    }
  }, [])

  // Resetea el estado transitorio del CIERRE al abrir un momento (nuevo o el
  // mismo tras cerrar). CAUSA RAÍZ del bug #605: `closing` solo se ponía a
  // `true` (nunca volvía a `false` por sí solo) y este componente NUNCA se
  // desmonta entre aperturas — TripPage siempre renderiza `<MomentSheet
  // moment={openMoment} .../>`, alternando `moment` entre un valor y `null`,
  // así que el estado de React sobrevive. Resultado: tras el PRIMER cierre, el
  // siguiente momento abierto heredaba `closing=true` desde el primer render,
  // el panel (recién montado por `key`) nacía ya en su posición final de
  // salida sin transición que disparar (`onTransitionEnd` nunca llega) y sin
  // temporizador nuevo (el guard `if (closing) return` de `close()` corta en
  // seco cualquier reintento) — el overlay quedaba bloqueando la app para
  // siempre, con consola y red limpias.
  useEffect(() => {
    if (!moment) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset síncrono al abrir, ver comentario arriba
    setClosing(false)
    setDragY(0)
    setDragging(false)
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    // Solo el id primitivo: no queremos re-disparar el reset si el objeto
    // `moment` se recrea (Realtime) sin cambiar de momento abierto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moment?.challengeId])

  // Cerrar con Escape mientras la hoja está abierta.
  useEffect(() => {
    if (!moment) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // `close` es estable salvo por onClose; lo recreamos en cada render pero el
    // listener solo depende de que haya un momento abierto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moment])

  // Bloquea el scroll del FONDO (la pantalla Viaje) mientras la hoja está abierta:
  // así el gesto de scroll solo afecta al contenido de la hoja, nunca a la página
  // de detrás. Usamos el bloqueo CON CONTEO DE REFERENCIAS (`lockBodyScroll`): si se
  // navega a "Adivina" con la hoja aún abierta (dentro de una View Transition), el
  // desmontaje suelta su referencia y el body recupera su estado, en vez de quedar
  // atrapado en `overflow:hidden` (lo que dejaba la pantalla desconfigurada al volver).
  useEffect(() => {
    if (!moment) return
    return lockBodyScroll()
  }, [moment])

  // Guarda la descripción del día (solo dueño). Optimista: cierra la edición y deja
  // el texto local; si falla, avisa y reabre la edición para no perder lo escrito.
  const saveDescription = async () => {
    if (!moment) return
    setSaving(true)
    try {
      await updateChallengeDescription(moment.challengeId, description)
      setEditing(false)
      toast.show('Descripción guardada', { tone: 'success' })
      // Refresca el viaje tras guardar: sin esto, al reabrir el momento se releía
      // el dato CACHEADO (sin la descripción nueva) y parecía que no se guardaba.
      onEdited?.()
    } catch (err) {
      toast.show(`No se pudo guardar: ${err instanceof Error ? err.message : String(err)}`, {
        tone: 'danger',
      })
    } finally {
      setSaving(false)
    }
  }

  // Guarda los datos del RECUERDO (título, descripción, fecha y lugar) del
  // formulario de PAPEL (#571): UNA sola escritura para los cuatro campos, en vez
  // de dos (esta + `saveDescription`) — el formulario los presenta juntos, como
  // "Nuevo recuerdo". Optimista: cierra la edición y avisa al padre para refrescar
  // el viaje (la tarjeta, el mapa y el orden de la línea de tiempo dependen de
  // título/fecha/lugar).
  const saveMeta = async () => {
    if (!moment) return
    const trimmedTitle = editTitle.trim()
    if (!trimmedTitle) {
      toast.show('Ponle un título al recuerdo.', { tone: 'danger' })
      return
    }
    setSavingMeta(true)
    try {
      await updateMoment(moment.challengeId, {
        title: trimmedTitle,
        description,
        createdAt: editDate ? dateInputToIso(editDate, moment.date) : undefined,
        // Lugar: el dueño lo marca/mueve en el mapa; null lo quita del mapa.
        place: editPlace ? { lat: editPlace.lat, lng: editPlace.lng } : null,
      })
      setEditingMeta(false)
      // La edición inline de la descripción (el lápiz junto al texto) queda
      // cerrada: el formulario de papel ya guardó lo que hubiera en curso.
      setEditing(false)
      toast.show('Recuerdo actualizado', { tone: 'success' })
      onEdited?.()
    } catch (err) {
      toast.show(`No se pudo guardar: ${err instanceof Error ? err.message : String(err)}`, {
        tone: 'danger',
      })
    } finally {
      setSavingMeta(false)
    }
  }

  // Borra el momento (recuerdo o reto). En cascada arrastra fotos y, si es reto,
  // sus votos (FK on delete cascade). Tras borrar, avisa al padre (refresca + la
  // hoja se cierra al desaparecer el momento de la lista).
  const confirmDelete = async () => {
    if (!moment) return
    setDeleting(true)
    try {
      await deleteChallenge(moment.challengeId)
      const wasRecuerdo = moment.status === 'recuerdo'
      toast.show(wasRecuerdo ? 'Recuerdo borrado' : 'Reto borrado', { tone: 'neutral' })
      setConfirmingDelete(false)
      onDeleted?.()
      close()
    } catch (err) {
      toast.show(`No se pudo borrar: ${err instanceof Error ? err.message : String(err)}`, {
        tone: 'danger',
      })
      setDeleting(false)
    }
  }

  // Abre el sub-flujo de convertir: siembra el punto-respuesta con el lugar visible
  // del recuerdo (si lo tiene), que el dueño puede ajustar antes de esconderlo.
  const startPromote = () => {
    if (!moment) return
    setAnswer(
      moment.lat != null && moment.lng != null ? { lat: moment.lat, lng: moment.lng } : null,
    )
    setPromoting(true)
  }

  // Convierte el recuerdo en reto: el lugar visible pasa a respuesta OCULTA, con
  // plazo (relativo a ahora) y tiempo por jugada. Al terminar, refresca el viaje.
  const confirmPromote = async () => {
    if (!moment || !answer) return
    setPromoteBusy(true)
    try {
      await promoteToChallenge(moment.challengeId, {
        lat: answer.lat,
        lng: answer.lng,
        deadlineAt: deadlineFromMinutes(DURATION_STOPS[durationIndex].minutes),
        guessSeconds,
        photoIsHint: true,
      })
      toast.show('¡Reto creado! Ya pueden adivinar dónde es.', { tone: 'success' })
      setPromoting(false)
      onPromoted?.()
      close()
    } catch (err) {
      toast.show(
        `No se pudo convertir en reto: ${err instanceof Error ? err.message : String(err)}`,
        {
          tone: 'danger',
        },
      )
    } finally {
      setPromoteBusy(false)
    }
  }

  if (!moment) return null

  const isActive = moment.status === 'active'
  // Recuerdo = sin capa de reto. Solo un recuerdo puede convertirse en reto.
  const isRecuerdo = moment.status === 'recuerdo'
  const isReto = moment.isChallenge && !isRecuerdo
  const trimmedDesc = description.trim()
  const date = formatMomentDate(moment.date)
  // País ya resuelto (recuerdos con lugar o cerrados con coord); con bandera válida.
  const country = moment.country?.flag ? moment.country : null
  const durationStop = DURATION_STOPS[durationIndex]
  // Coordenada visible para la tarjeta-mapa (recuerdo con lugar o reto cerrado).
  const hasPlace = moment.lat != null && moment.lng != null
  const coordLabel = hasPlace
    ? `${(moment.lat as number).toFixed(4)}°, ${(moment.lng as number).toFixed(4)}°`
    : null
  // Eyebrow editorial sobre la foto: el tipo de momento (en juego / reto / recuerdo).
  const eyebrow = isActive ? 'En juego' : isReto ? 'Un reto para el grupo' : 'Recuerdo'

  // Arrastre desde el asa: seguimos el dedo solo hacia abajo (transform 1:1, sin
  // transición mientras se arrastra); al soltar, si pasó el umbral la hoja CAE hasta
  // salir (deja el `closing` que transiciona el transform desde donde está el dedo
  // hasta fuera del viewport — inercia), si no vuelve a su sitio con muelle.
  const onPointerDown = (e: React.PointerEvent) => {
    if (closing) return
    dragStart.current = e.clientY
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStart.current === null) return
    setDragY(Math.max(0, e.clientY - dragStart.current))
  }
  const onPointerUp = () => {
    if (dragStart.current === null) return
    const shouldClose = dragY > DRAG_CLOSE_PX
    dragStart.current = null
    setDragging(false)
    if (shouldClose) close()
    else setDragY(0)
  }

  // Estilo del panel: mientras se arrastra seguimos el dedo (1:1, sin transición);
  // al soltar por debajo del umbral, el transform vuelve a 0 con transición-muelle
  // (clase `.settling`). Mientras `closing`, NO fijamos transform inline: deja que
  // la clase `.closing` lo lleve a `translateY(100%)` continuando desde donde esté.
  const panelStyle = !closing && dragY ? { transform: `translateY(${dragY}px)` } : undefined

  // Tope superior del calendario al editar (mismo criterio que "Nuevo recuerdo").
  const editMaxDate = computeEditMaxDate(tripStartsOn, tripEndsOn)

  return (
    <div className={styles.overlay} onClick={close}>
      <div
        // Remontar al cambiar de momento garantiza arrastre/scroll a cero.
        key={moment.challengeId}
        ref={panelRef}
        className={`${styles.panel} ${dragging ? styles.dragging : ''} ${
          closing ? styles.closing : ''
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={moment.title}
        style={panelStyle}
        // El panel no propaga el click al overlay (que cierra).
        onClick={(e) => e.stopPropagation()}
        // Fin de la caída de salida → desmontar (camino feliz). Cancela el
        // temporizador de seguridad de `close()`: ya no hace falta, y sin esto
        // un segundo `onClose()` fantasma podía llegar 400ms tarde si el padre
        // había vuelto a abrir OTRO momento mientras tanto.
        onTransitionEnd={(e) => {
          if (!closing || e.propertyName !== 'transform') return
          if (closeTimer.current !== null) {
            window.clearTimeout(closeTimer.current)
            closeTimer.current = null
          }
          onClose()
        }}
      >
        {/* Asa de arrastre: zona de gesto para cerrar tirando hacia abajo. Solo en
            la VISTA (escena): editar es una TAREA de papel, sin gesto de cierre
            accidental que tire un formulario a medio rellenar (#571). */}
        {!editingMeta && (
          <div
            className={styles.handleZone}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <span className={styles.handle} aria-hidden="true" />
          </div>
        )}

        {/* El contenido es el ÚNICO scrollable. VISTA (escena): foto a sangre +
            cuerpo editorial (papel) debajo. EDITAR (#571): formulario utilitario
            de papel, misma gramática que "Nuevo recuerdo" — sin héroe, sin chip
            flotante, sin duplicar el título. */}
        <div className={styles.content}>
          {editingMeta ? (
            <EditMomentForm
              moment={moment}
              title={editTitle}
              onTitleChange={setEditTitle}
              description={description}
              onDescriptionChange={setDescription}
              date={editDate}
              onDateChange={setEditDate}
              maxDate={editMaxDate}
              place={editPlace}
              onPlaceChange={setEditPlace}
              saving={savingMeta}
              onCancel={() => setEditingMeta(false)}
              onSave={() => void saveMeta()}
              onGalleryChanged={onEdited}
            />
          ) : (
            <>
              {/* ── HERO: FOTO A SANGRE ───────────────────────────────────────────
              La foto manda. Velo inferior con la info editorial encima. Ken Burns
              sutil vía CSS (anulado bajo reduced-motion). El "sello" de reto y el
              chip de lugar van superpuestos. */}
              <header className={styles.hero}>
                <div className={styles.heroPhoto} data-empty={!moment.imageUrl || undefined}>
                  <ChallengePhoto
                    src={moment.imageUrl}
                    alt={moment.title}
                    ratio="wide"
                    size="lg"
                    className={styles.heroImg}
                  />
                </div>

                {/* Cerrar: chip flotante arriba-izquierda (toca el velo del mapa de A). */}
                <button
                  type="button"
                  className={[styles.heroClose, 'lg-press'].join(' ')}
                  onClick={close}
                  aria-label="Volver"
                >
                  <Icon icon={ArrowLeft} size={20} />
                </button>

                {/* Estado del momento sobre la foto: sello dorado "Reto" o badge EN JUEGO. */}
                {isActive ? (
                  <div className={styles.heroSeal}>
                    <Badge tone="live" dot>
                      EN JUEGO
                    </Badge>
                  </div>
                ) : isReto ? (
                  <div className={styles.heroSeal}>
                    <span className={styles.seal}>
                      <Icon icon={Target} size={13} /> Reto
                    </span>
                  </div>
                ) : null}

                {/* Chip de lugar (país) sobre la foto, estilo "place-chip" de A. */}
                {country && (
                  <div className={styles.placeChip}>
                    <Icon icon={MapPin} size={13} />
                    <span>{country.name}</span>
                  </div>
                )}

                {/* Velo inferior con la info: eyebrow + título serif GRANDE + meta. */}
                <div className={styles.veil}>
                  <p className={styles.eyebrow}>{eyebrow}</p>
                  <h1 className={styles.title}>{moment.title}</h1>
                  <span className={styles.rule} aria-hidden="true" />
                  {(country || date) && (
                    <p className={styles.meta}>
                      {country && (
                        <span className={styles.country}>
                          <span aria-hidden="true">{country.flag}</span> {country.name}
                        </span>
                      )}
                      {country && date && <span aria-hidden="true"> · </span>}
                      {date}
                    </p>
                  )}
                  {/* Cuenta atrás VIVA solo si el reto está EN JUEGO. */}
                  {isActive && (
                    <div className={styles.countdown}>
                      <Countdown deadlineAt={moment.deadlineAt} />
                    </div>
                  )}
                </div>
              </header>

              {/* ── CUERPO EDITORIAL (papel) ──────────────────────────────────────
              lg-stagger: se ensambla en cascada al subir la hoja (anulado bajo
              reduced-motion por la utilidad global). */}
              <article className={`${styles.article} lg-stagger`}>
                {/* EDITAR el recuerdo (título, fecha, lugar, descripción): ahora vive en
                `EditMomentForm`, fuera de esta escena (#571) — este `article` solo
                se renderiza en modo VISTA. Cada sección de abajo se oculta por su
                cuenta mientras `promoting` (convertir en reto) es el foco. */}
                <>
                  {/* DESCRIPCIÓN: cuerpo de artículo con drop-cap sutil (injerto C).
                    Se muestra a todos; el DUEÑO la edita en línea. Se oculta durante
                    "Convertir en reto" para que ese flujo sea el foco. */}
                  {!promoting &&
                    (editing ? (
                      <div className={styles.descEdit}>
                        <textarea
                          className={styles.descArea}
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Cuenta el día: dónde fue, qué pasó…"
                          rows={4}
                          autoFocus
                          disabled={saving}
                        />
                        <div className={styles.descActions}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDescription(moment.description ?? '')
                              setEditing(false)
                            }}
                            disabled={saving}
                          >
                            Cancelar
                          </Button>
                          <Button size="sm" onClick={() => void saveDescription()} loading={saving}>
                            Guardar
                          </Button>
                        </div>
                      </div>
                    ) : trimmedDesc ? (
                      <div className={styles.descBlock}>
                        <p className={styles.description}>{trimmedDesc}</p>
                        {canEdit && (
                          <button
                            type="button"
                            className={styles.descEditBtn}
                            onClick={() => setEditing(true)}
                          >
                            <Icon icon={Pencil} size={14} /> Editar
                          </button>
                        )}
                      </div>
                    ) : canEdit ? (
                      <button
                        type="button"
                        className={[styles.descAdd, 'lg-press'].join(' ')}
                        onClick={() => setEditing(true)}
                      >
                        <Icon icon={Pencil} size={14} /> Añadir descripción del día
                      </button>
                    ) : null)}

                  {/* GALERÍA "la serie": tira de fotogramas enmarcados (injerto C),
                    solo en un RECUERDO (un reto muestra una sola foto). El componente
                    trae el carrusel + los controles del dueño (portada/añadir/quitar). */}
                  {isRecuerdo && !promoting && (
                    <section className={styles.gallerySection}>
                      <p className={styles.sectionLabel}>La serie</p>
                      <MomentGallery
                        challengeId={moment.challengeId}
                        initialCoverUrl={moment.imageUrl}
                        canEdit={canEdit}
                        onChanged={onEdited}
                      />
                    </section>
                  )}

                  {/* "EN EL MAPA": mapa REAL (Leaflet estático, preset diario) centrado
                    en las coordenadas con el pin, para que se vea DÓNDE es. Antes era un
                    blob abstracto de CSS que no decía nada. Solo si hay lugar visible
                    (recuerdo con lugar o reto cerrado). */}
                  {hasPlace && !promoting && (
                    <section className={styles.mapSection}>
                      <p className={styles.sectionLabel}>En el mapa</p>
                      <div className={styles.mapCard}>
                        <MomentMiniMap lat={moment.lat as number} lng={moment.lng as number} />
                        <div className={styles.mapFoot}>
                          <span className={styles.mapPlace}>
                            {country ? (
                              <span className={styles.mapPlaceName}>{country.name}</span>
                            ) : null}
                            <span className={styles.coord}>{coordLabel}</span>
                          </span>
                        </div>
                      </div>
                    </section>
                  )}

                  {/* Social ligero: contador real de PARTICIPACIÓN (derivado de votos);
                    solo tiene sentido en un reto. Es un recuento de quién JUGÓ, no de
                    aciertos, así que el copy dice "participó / participaron". En un
                    reto CERRADO que no es mío, este recuento cede el protagonismo al
                    bloque "Tu resultado" de abajo (#580): aquí solo se muestra si el
                    reto sigue EN JUEGO o si lo creé YO (`isOwn`, #582 — no si soy el
                    dueño del viaje: un miembro cualquiera puede crear un reto). */}
                  {(isActive || (isReto && moment.isOwn)) && !promoting ? (
                    <p className={styles.social}>
                      <span className={styles.socialIcon} aria-hidden="true">
                        <Icon icon={User} size={15} />
                      </span>
                      {moment.guessedCount}{' '}
                      {moment.guessedCount === 1 ? 'persona participó' : 'personas participaron'}
                    </p>
                  ) : null}

                  {/* "Tu resultado" (#580): en un reto CERRADO que no es mío, la hoja
                    antes solo enseñaba sello/descripción/lugar/participantes — nada de
                    cómo me fue. Puntos (+ distancia, o cifra en un reto de número) con
                    la tipografía de datos (tabular) si jugué; "No participaste" si no.
                    Nunca para quien lo creó (`isOwn`): fingir un resultado sería falso. */}
                  {isReto && !isActive && !moment.isOwn && !promoting && (
                    <section className={styles.resultSection}>
                      <p className={styles.sectionLabel}>Tu resultado</p>
                      {myVote === undefined ? (
                        <p className={styles.resultNone}>Cargando…</p>
                      ) : myVote === null ? (
                        <p className={styles.resultNone}>No participaste</p>
                      ) : (
                        <p className={styles.resultValue}>
                          <span className={styles.resultPoints}>
                            {myVote.points}
                            <span className={styles.resultUnit}>pts</span>
                          </span>
                          {myVote.distance_km != null && (
                            <span className={styles.resultExtra}>
                              {fmtDist(myVote.distance_km)}
                            </span>
                          )}
                          {myVote.guess_number != null && (
                            <span className={styles.resultExtra}>
                              {fmtNumber(myVote.guess_number)}
                            </span>
                          )}
                        </p>
                      )}
                    </section>
                  )}

                  {/* CTA "Ver marcador" (#580): un reto CERRADO no llevaba a ningún
                    sitio para ver "cómo quedó" el grupo. Para cualquiera (dueño o
                    jugador), no solo para quien jugó. */}
                  {isReto && !isActive && !promoting && onViewMarcador && (
                    <Button
                      variant="secondary"
                      size="lg"
                      fullWidth
                      onClick={onViewMarcador}
                      className={styles.cta}
                    >
                      <Icon icon={ListOrdered} size={16} /> Ver marcador
                    </Button>
                  )}

                  {/* CTA "Adivina dónde es →": el gancho del reto en juego. */}
                  {isActive && onPlay && !promoting && (
                    <Button size="lg" fullWidth onClick={onPlay} className={styles.cta}>
                      Adivina dónde es →
                    </Button>
                  )}

                  {/* CONVERTIR EN RETO — solo el dueño, solo sobre un RECUERDO. */}
                  {canEdit && isRecuerdo && !promoting && (
                    <Button
                      size="lg"
                      fullWidth
                      variant="secondary"
                      onClick={startPromote}
                      className={styles.cta}
                    >
                      <Icon icon={Target} size={16} /> Convertir en reto
                    </Button>
                  )}

                  {canEdit && isRecuerdo && promoting && (
                    <section className={styles.promote}>
                      <header className={styles.promoteHead}>
                        <span className={styles.promoteTitle}>
                          <Icon icon={Target} size={15} /> Convertir en reto
                        </span>
                        <span className={styles.promoteHint}>
                          Esconde el lugar y que adivinen dónde es, con cuenta atrás.
                        </span>
                      </header>

                      <div className={styles.promoteField}>
                        <span className={styles.promoteLabel}>Punto a adivinar</span>
                        <MapPicker
                          value={answer}
                          flyTo={answer}
                          center={answer ?? SPAIN}
                          zoom={answer ? 13 : 5}
                          onPick={setAnswer}
                        />
                        {!answer && (
                          <span className={styles.promoteWarn}>
                            Marca en el mapa el sitio que habrá que adivinar.
                          </span>
                        )}
                      </div>

                      <div className={styles.promoteField}>
                        <span className={styles.promoteLabel}>Duración: {durationStop.label}</span>
                        <input
                          type="range"
                          className={styles.promoteSlider}
                          min={0}
                          max={DURATION_STOPS.length - 1}
                          step={1}
                          value={durationIndex}
                          onChange={(e) => setDurationIndex(Number(e.target.value))}
                          aria-label="Duración del reto"
                          aria-valuetext={durationStop.label}
                        />
                      </div>

                      <div className={styles.promoteField}>
                        <span className={styles.promoteLabel}>Tiempo por jugada</span>
                        <div className={styles.promoteOptions}>
                          {GUESS_OPTIONS.map((opt) => (
                            <Button
                              key={opt.label}
                              variant={guessSeconds === opt.value ? 'primary' : 'secondary'}
                              size="sm"
                              aria-pressed={guessSeconds === opt.value}
                              onClick={() => setGuessSeconds(opt.value)}
                            >
                              {opt.label}
                            </Button>
                          ))}
                        </div>
                      </div>

                      <div className={styles.descActions}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPromoting(false)}
                          disabled={promoteBusy}
                        >
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => void confirmPromote()}
                          loading={promoteBusy}
                          disabled={!answer}
                        >
                          Crear reto
                        </Button>
                      </div>
                    </section>
                  )}

                  {/* Acciones del DUEÑO al pie: editar y borrar. Para un RECUERDO,
                    "Editar" abre el formulario de datos aquí; para un RETO lo lleva al
                    editor completo. Borrar pide confirmación. */}
                  {canEdit && !promoting && (
                    <div className={styles.ownerActions}>
                      {isRecuerdo ? (
                        <button
                          type="button"
                          className={[styles.ownerAction, 'lg-press'].join(' ')}
                          onClick={() => {
                            setEditTitle(moment.title)
                            setEditDate(dateInputValue(moment.date))
                            setEditPlace(
                              moment.lat != null && moment.lng != null
                                ? { lat: moment.lat, lng: moment.lng }
                                : null,
                            )
                            setEditingMeta(true)
                          }}
                        >
                          <Icon icon={Pencil} size={15} /> Editar recuerdo
                        </button>
                      ) : onEditChallenge ? (
                        <button
                          type="button"
                          className={[styles.ownerAction, 'lg-press'].join(' ')}
                          onClick={() => onEditChallenge(moment.challengeId)}
                        >
                          <Icon icon={Pencil} size={15} /> Editar reto
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={[styles.ownerAction, styles.ownerActionDanger, 'lg-press'].join(
                          ' ',
                        )}
                        onClick={() => setConfirmingDelete(true)}
                      >
                        <Icon icon={Trash2} size={15} /> Borrar
                      </button>
                    </div>
                  )}
                </>
              </article>
            </>
          )}
        </div>
      </div>

      {/* Confirmación de borrado (modal del kit): destructivo, así que pedimos un
          toque explícito. En un reto avisamos de que se pierden las jugadas. */}
      <Modal
        open={confirmingDelete}
        onClose={deleting ? undefined : () => setConfirmingDelete(false)}
        title={isRecuerdo ? '¿Borrar este recuerdo?' : '¿Borrar este reto?'}
        footer={
          <div className={styles.descActions}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className={styles.dangerBtn}
              onClick={() => void confirmDelete()}
              loading={deleting}
            >
              Borrar
            </Button>
          </div>
        }
      >
        <p className={styles.description}>
          {isRecuerdo
            ? 'Se borrará el recuerdo y sus fotos. No se puede deshacer.'
            : moment.guessedCount > 0
              ? `Se borrará el reto y las ${moment.guessedCount} ${
                  moment.guessedCount === 1 ? 'jugada' : 'jugadas'
                } ya emitidas. No se puede deshacer.`
              : 'Se borrará el reto. Aún no tiene jugadas. No se puede deshacer.'}
        </p>
      </Modal>
    </div>
  )
}
