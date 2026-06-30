import { useEffect, useRef, useState } from 'react'
import { Pencil, Target, Trash2, User } from 'lucide-react'
import { Badge, Button, ChallengePhoto, Icon, Modal, useToast } from '../../ui'
import type { Moment } from '../../lib/trip'
import type { LatLng } from '../../lib/geo'
import {
  deleteChallenge,
  promoteToChallenge,
  updateChallengeDescription,
  updateMoment,
} from '../../lib/challenges'
import { deadlineFromMinutes } from '../../lib/time'
import { lockBodyScroll } from '../../lib/scrollLock'
import { MapPicker } from '../create/MapPicker'
import { Countdown } from './Countdown'
import { MomentGallery } from './MomentGallery'
import styles from './MomentSheet.module.css'

interface Props {
  /** Momento a mostrar; `null` = hoja cerrada. */
  moment: Moment | null
  /** El usuario es dueño del viaje: puede editar la descripción y convertir en reto. */
  canEdit?: boolean
  onClose: () => void
  /** Solo en momentos en juego: lanza el flujo de adivinar. */
  onPlay?: () => void
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

// Umbral de arrastre (px) a partir del cual soltar cierra la hoja. Por debajo,
// la hoja vuelve a su sitio (gesto cancelado).
const DRAG_CLOSE_PX = 110

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
  onClose,
  onPlay,
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
  const [editingMeta, setEditingMeta] = useState(false)
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

  // Cierra reseteando el arrastre, para que la próxima apertura entre limpia
  // (el panel además se remonta por `key`, ver más abajo).
  const close = () => {
    setDragY(0)
    onClose()
  }

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
    } catch (err) {
      toast.show(`No se pudo guardar: ${err instanceof Error ? err.message : String(err)}`, {
        tone: 'danger',
      })
    } finally {
      setSaving(false)
    }
  }

  // Guarda los datos del RECUERDO (título, fecha y lugar). Optimista igual que la
  // descripción: cierra la edición y avisa al padre para refrescar el viaje (la
  // tarjeta, el mapa y el orden de la línea de tiempo dependen de estos campos).
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
        createdAt: editDate ? dateInputToIso(editDate, moment.date) : undefined,
        // Lugar: el dueño lo marca/mueve en el mapa; null lo quita del mapa.
        place: editPlace ? { lat: editPlace.lat, lng: editPlace.lng } : null,
      })
      setEditingMeta(false)
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

  // Arrastre desde el asa: seguimos el dedo solo hacia abajo; al soltar, si pasó
  // el umbral cerramos, si no la hoja vuelve a su sitio.
  const onPointerDown = (e: React.PointerEvent) => {
    dragStart.current = e.clientY
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
    if (shouldClose) close()
    else setDragY(0)
  }

  return (
    <div className={styles.overlay} onClick={close}>
      <div
        // Remontar al cambiar de momento garantiza arrastre/scroll a cero.
        key={moment.challengeId}
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={moment.title}
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
        // El panel no propaga el click al overlay (que cierra).
        onClick={(e) => e.stopPropagation()}
      >
        {/* Asa de arrastre: zona de gesto para cerrar tirando hacia abajo. */}
        <div
          className={styles.handleZone}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <span className={styles.handle} aria-hidden="true" />
        </div>

        {/* lg-stagger: el bloque editorial se ensambla en cascada al subir la hoja.
            Se anula bajo reduced-motion (la utilidad global ya lo gestiona). */}
        <div className={`${styles.content} lg-stagger`}>
          {/* RECUERDO: galería multi-foto (carrusel + controles del dueño). RETO:
              su foto única (la que se adivina), sin galería. */}
          {isRecuerdo ? (
            <MomentGallery
              challengeId={moment.challengeId}
              initialCoverUrl={moment.imageUrl}
              canEdit={canEdit}
              onChanged={onPromoted}
            />
          ) : (
            <div className={styles.photoWrap}>
              <ChallengePhoto
                src={moment.imageUrl}
                alt={moment.title}
                ratio="wide"
                size="lg"
                className={styles.photo}
              />
              {/* Estado sobre la foto: EN JUEGO (cálido) o "🎯 Reto" (cerrado/práctica). */}
              {isActive ? (
                <div className={styles.photoBadge}>
                  <Badge tone="live" dot>
                    EN JUEGO
                  </Badge>
                </div>
              ) : isReto ? (
                <div className={styles.photoBadge}>
                  <Badge tone="accent">
                    <Icon icon={Target} size={13} /> Reto
                  </Badge>
                </div>
              ) : null}
            </div>
          )}

          {/* EDITAR el recuerdo (título, fecha, lugar): sustituye el bloque de
              título/meta por el formulario. Solo recuerdos del dueño. */}
          {editingMeta ? (
            <div className={styles.metaEdit}>
              <label className={styles.editLabel}>
                Título
                <input
                  className={styles.editInput}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Ponle un título al recuerdo"
                  maxLength={120}
                  autoFocus
                  disabled={savingMeta}
                />
              </label>

              <label className={styles.editLabel}>
                Fecha
                <input
                  type="date"
                  className={styles.editInput}
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  disabled={savingMeta}
                />
              </label>

              <div className={styles.promoteField}>
                <span className={styles.editLabel}>Lugar en el mapa</span>
                <MapPicker
                  value={editPlace}
                  flyTo={editPlace}
                  center={editPlace ?? SPAIN}
                  zoom={editPlace ? 12 : 4}
                  onPick={setEditPlace}
                />
                <div className={styles.editPlaceRow}>
                  <span className={styles.promoteHint}>
                    {editPlace
                      ? `${editPlace.lat.toFixed(4)}, ${editPlace.lng.toFixed(4)}`
                      : 'Toca el mapa para situarlo (opcional).'}
                  </span>
                  {editPlace && (
                    <button
                      type="button"
                      className={styles.descEditBtn}
                      onClick={() => setEditPlace(null)}
                      disabled={savingMeta}
                    >
                      Quitar lugar
                    </button>
                  )}
                </div>
              </div>

              <div className={styles.descActions}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingMeta(false)}
                  disabled={savingMeta}
                >
                  Cancelar
                </Button>
                <Button size="sm" onClick={() => void saveMeta()} loading={savingMeta}>
                  Guardar
                </Button>
              </div>
            </div>
          ) : (
            <>
              <h2 className={styles.title}>{moment.title}</h2>
              {/* Meta-línea estilo Polarsteps: "🇲🇾 MALASIA · 8 de abril de 2026". El país
                  solo está si ya se resolvió; si no, queda solo la fecha. El separador "·"
                  únicamente cuando hay ambos. */}
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
            </>
          )}

          {/* Cuenta atrás VIVA solo si el reto está EN JUEGO (un recuerdo no caduca). */}
          {isActive && (
            <div className={styles.countdown}>
              <Countdown deadlineAt={moment.deadlineAt} />
            </div>
          )}

          {/* Mientras se editan los datos del recuerdo (título/fecha/lugar) ocultamos
              el resto (descripción, social, CTA, acciones) para que el formulario sea
              el foco único de la hoja. */}
          {editingMeta ? null : (
            <>
              {/* Descripción del día. Se muestra a todos; el DUEÑO la edita en línea. */}
              {editing ? (
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
                <button type="button" className={styles.descAdd} onClick={() => setEditing(true)}>
                  <Icon icon={Pencil} size={14} /> Añadir descripción del día
                </button>
              ) : null}

              {/* Social ligero. Lo REAL es el contador de adivinadores (derivado de
              votos); solo tiene sentido en un reto (un recuerdo no se "adivina"). */}
              {isReto || isActive ? (
                <p className={styles.social}>
                  <span className={styles.socialIcon} aria-hidden="true">
                    <Icon icon={User} size={15} />
                  </span>
                  {moment.guessedCount}{' '}
                  {moment.guessedCount === 1 ? 'persona adivinó' : 'personas adivinaron'}
                </p>
              ) : null}

              {isActive && onPlay && (
                <Button size="lg" fullWidth onClick={onPlay} className={styles.cta}>
                  Adivina →
                </Button>
              )}

              {/* CONVERTIR EN RETO — solo el dueño, solo sobre un RECUERDO. Esconde el
              lugar (ahora respuesta a adivinar) con plazo y tiempo por jugada. */}
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

              {/* Acciones del DUEÑO al pie: editar y borrar. Para un RECUERDO, "Editar"
              abre el formulario de datos (título/fecha/lugar) aquí mismo; para un
              RETO lo lleva al editor completo (mecánica/Street View/votos). Borrar
              pide confirmación. Se ocultan durante "Convertir en reto" (otro flujo). */}
              {canEdit && !promoting && (
                <div className={styles.ownerActions}>
                  {isRecuerdo ? (
                    <button
                      type="button"
                      className={styles.ownerAction}
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
                      className={styles.ownerAction}
                      onClick={() => onEditChallenge(moment.challengeId)}
                    >
                      <Icon icon={Pencil} size={15} /> Editar reto
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={`${styles.ownerAction} ${styles.ownerActionDanger}`}
                    onClick={() => setConfirmingDelete(true)}
                  >
                    <Icon icon={Trash2} size={15} /> Borrar
                  </button>
                </div>
              )}
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
