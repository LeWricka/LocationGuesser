import { useEffect, useState } from 'react'
import {
  closeGroup,
  deleteGroup,
  getGroup,
  listTripPhotos,
  reopenGroup,
  updateGroupCover,
  updateGroupName,
  updateGroupTripData,
  type TripPhoto,
} from '../../lib/groupData'
import { track } from '../../lib/analytics'
import { Check, Flag, Image as ImageIcon, LockOpen, Settings } from 'lucide-react'
import {
  Button,
  DatePicker,
  Field,
  Icon,
  Input,
  Modal,
  Row,
  Spinner,
  Stack,
  useToast,
} from '../../ui'
import styles from './GroupPage.module.css'

interface Props {
  groupId: string
  /** Nombre actual (puede ser null → mostramos el código). */
  currentName: string | null
  /** Temporada cerrada (closed_at no null): mostramos "Reabrir" en vez de "Cerrar". */
  isClosed: boolean
  onClose: () => void
  /** Tras guardar (nombre/datos/portada): el grupo refresca la cabecera y el feed. */
  onRenamed: () => void
  /** Tras cerrar/reabrir la temporada: el grupo refresca (banner + solo-lectura). */
  onSeasonChanged: () => void
  /** Tras borrar el grupo: el grupo navega a la home. */
  onDeleted: () => void
}

// Ajustes del viaje (solo dueño): editar nombre, fechas, descripción, acompañantes
// y PORTADA; cerrar/reabrir temporada y borrar. La portada se elige entre las fotos
// ya subidas a los momentos del viaje (no se sube foto nueva aquí). El borrado es
// destructivo (arrastra retos/votos/miembros en cascada), así que exige escribir el
// nombre del viaje para confirmar. Cerrar la temporada congela el viaje en
// solo-lectura (reversible).
export function GroupSettingsModal({
  groupId,
  currentName,
  isClosed,
  onClose,
  onRenamed,
  onSeasonChanged,
  onDeleted,
}: Props) {
  const [name, setName] = useState(currentName ?? '')
  // Datos editoriales del viaje: se cargan al abrir (el modal solo recibe el id y el
  // nombre). Hasta que llegan, los campos van vacíos y en carga.
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [description, setDescription] = useState('')
  const [companions, setCompanions] = useState('')
  const [loadingTrip, setLoadingTrip] = useState(true)
  // Portada: path elegido (o null) + rejilla de fotos candidatas del viaje.
  const [coverPath, setCoverPath] = useState<string | null>(null)
  const [photos, setPhotos] = useState<TripPhoto[]>([])
  const [loadingPhotos, setLoadingPhotos] = useState(true)

  const [busy, setBusy] = useState(false)
  // Confirmación fuerte de borrado: el dueño teclea el nombre (o el código si no
  // hay nombre) para habilitar el botón.
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  // Confirmación ligera de cierre de temporada (reversible, no destructivo).
  const [confirmingClose, setConfirmingClose] = useState(false)
  const toast = useToast()

  // Carga los datos del viaje y sus fechas/portada al montar. Tolerante a fallo: si
  // falla, los campos quedan editables en su estado por defecto (no bloquea Ajustes).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const group = await getGroup(groupId)
        if (cancelled || !group) return
        setStartsOn(group.starts_on ?? '')
        setEndsOn(group.ends_on ?? '')
        setDescription(group.description ?? '')
        setCompanions(group.companions ?? '')
        setCoverPath(group.cover_image_path)
      } finally {
        if (!cancelled) setLoadingTrip(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [groupId])

  // Carga las fotos del viaje candidatas a portada (rejilla). Aparte de los datos
  // porque firma cada imagen y puede tardar algo más.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await listTripPhotos(groupId)
        if (!cancelled) setPhotos(list)
      } finally {
        if (!cancelled) setLoadingPhotos(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [groupId])

  // Lo que hay que teclear para borrar: el nombre si lo hay, si no el código.
  const deleteTarget = currentName?.trim() || groupId
  const canDelete = confirmText.trim() === deleteTarget
  // Rango inválido (la vuelta antes de la salida): avisamos, pero no bloqueamos —
  // al guardar lo enderezamos (normalizeTripData intercambia las fechas).
  const datesInverted = Boolean(startsOn && endsOn && endsOn < startsOn)

  // Guarda nombre + datos del viaje en un solo gesto (dos UPDATE al mismo grupo).
  async function save() {
    setBusy(true)
    try {
      await updateGroupName(groupId, name)
      await updateGroupTripData(groupId, { startsOn, endsOn, description, companions })
      track('group_trip_edited', {
        group_id: groupId,
        has_dates: Boolean(startsOn || endsOn),
        has_description: description.trim().length > 0,
        has_companions: companions.trim().length > 0,
      })
      toast.show('Viaje actualizado', { tone: 'success' })
      onRenamed()
    } catch (err) {
      toast.show(`No se pudo guardar: ${err instanceof Error ? err.message : String(err)}`, {
        tone: 'danger',
      })
      setBusy(false)
    }
  }

  // Fija (o quita, tocando la portada actual) la portada. Optimista en la selección
  // visual; ante error, revierte y avisa. No cierra el modal (el dueño puede seguir
  // ajustando); refresca el feed en segundo plano vía onRenamed.
  async function chooseCover(imagePath: string | null) {
    const previous = coverPath
    setCoverPath(imagePath)
    try {
      await updateGroupCover(groupId, imagePath)
      track('group_cover_set', { group_id: groupId, cleared: imagePath === null })
      onRenamed()
    } catch (err) {
      setCoverPath(previous)
      toast.show(
        `No se pudo cambiar la portada: ${err instanceof Error ? err.message : String(err)}`,
        {
          tone: 'danger',
        },
      )
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await deleteGroup(groupId)
      track('group_deleted', { group_id: groupId })
      onDeleted()
    } catch (err) {
      toast.show(`No se pudo borrar: ${err instanceof Error ? err.message : String(err)}`, {
        tone: 'danger',
      })
      setBusy(false)
    }
  }

  async function closeSeason() {
    setBusy(true)
    try {
      await closeGroup(groupId)
      track('group_closed', { group_id: groupId })
      toast.show('Temporada cerrada', { tone: 'success' })
      onSeasonChanged()
    } catch (err) {
      toast.show(`No se pudo cerrar: ${err instanceof Error ? err.message : String(err)}`, {
        tone: 'danger',
      })
      setBusy(false)
    }
  }

  async function reopenSeason() {
    setBusy(true)
    try {
      await reopenGroup(groupId)
      track('group_reopened', { group_id: groupId })
      toast.show('Temporada reabierta', { tone: 'success' })
      onSeasonChanged()
    } catch (err) {
      toast.show(`No se pudo reabrir: ${err instanceof Error ? err.message : String(err)}`, {
        tone: 'danger',
      })
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={busy ? undefined : onClose}
      title={
        <>
          <Icon icon={Settings} size={18} /> Ajustes del viaje
        </>
      }
      footer={
        confirmingDelete ? (
          <Row gap={2} justify="end">
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setConfirmingDelete(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="secondary"
              className={styles.dangerBtn}
              size="sm"
              loading={busy}
              disabled={!canDelete}
              onClick={() => void remove()}
            >
              Borrar viaje
            </Button>
          </Row>
        ) : confirmingClose ? (
          <Row gap={2} justify="end">
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setConfirmingClose(false)}
            >
              Cancelar
            </Button>
            <Button size="sm" loading={busy} onClick={() => void closeSeason()}>
              Cerrar temporada
            </Button>
          </Row>
        ) : (
          <Row gap={2} justify="end">
            <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
              Cerrar
            </Button>
            <Button size="sm" loading={busy} disabled={loadingTrip} onClick={() => void save()}>
              Guardar cambios
            </Button>
          </Row>
        )
      }
    >
      {confirmingDelete ? (
        <Stack gap={3}>
          <p className={styles.dangerText}>
            Esto borra el viaje y, en cascada, <strong>todos sus retos, votos y miembros</strong>.
            No se puede deshacer.
          </p>
          <Field label={`Escribe «${deleteTarget}» para confirmar`}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={deleteTarget}
                autoComplete="off"
              />
            )}
          </Field>
        </Stack>
      ) : confirmingClose ? (
        <Stack gap={3}>
          <p>
            Al cerrar la temporada el viaje queda <strong>congelado</strong>: nadie podrá añadir
            retos ni jugar, y se mostrará el podio final con el ganador. Podrás reabrirla cuando
            quieras.
          </p>
        </Stack>
      ) : (
        <Stack gap={4}>
          <Field label="Nombre del viaje" hint="Vacío usa el código del viaje.">
            {(fieldProps) => (
              <Input
                {...fieldProps}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder="Finde en Madrid"
              />
            )}
          </Field>

          {/* Fechas del viaje: rango de calendario opcional (vaciar → sin fecha). El
              diario se ordena por estos días. */}
          <Field
            label="Fechas del viaje"
            hint="Opcional. Marca un rango; el diario se ordena por estos días."
            error={
              datesInverted ? 'La vuelta es antes de la salida. La ordenaremos al guardar.' : null
            }
          >
            {(fieldProps) => (
              <Row gap={3} className={styles.tripDates}>
                <DatePicker
                  {...fieldProps}
                  aria-label="Fecha de salida"
                  placeholder="Salida"
                  value={startsOn}
                  max={endsOn || undefined}
                  onChange={(v) => setStartsOn(v ?? '')}
                />
                <DatePicker
                  aria-label="Fecha de vuelta"
                  placeholder="Vuelta"
                  value={endsOn}
                  min={startsOn || undefined}
                  onChange={(v) => setEndsOn(v ?? '')}
                />
              </Row>
            )}
          </Field>

          {/* Acompañantes: texto libre informativo (no membresía), como al crear. */}
          <Field
            label="¿Con quién vas?"
            hint="Opcional. Solo para recordarlo; a los tuyos los invitas con el enlace."
          >
            {(fieldProps) => (
              <Input
                {...fieldProps}
                value={companions}
                onChange={(e) => setCompanions(e.target.value)}
                maxLength={120}
                placeholder="Marta, Diego y yo"
              />
            )}
          </Field>

          {/* Descripción: de qué va el viaje (textarea). */}
          <Field label="De qué va" hint="Opcional.">
            {(fieldProps) => (
              <textarea
                {...fieldProps}
                className={styles.tripTextarea}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={280}
                rows={3}
                placeholder="Dos semanas de templos, ramen y trenes bala."
              />
            )}
          </Field>

          {/* Portada: se elige entre las fotos ya subidas a los momentos del viaje.
              Tocar una la fija; tocar la actual la quita (vuelve a la portada
              automática). No hay subida de foto nueva aquí. */}
          <div className={styles.settingsSection}>
            <p className={styles.settingsSectionLabel}>Portada del viaje</p>
            {loadingPhotos ? (
              <Row gap={2} align="center" className={styles.coverLoading}>
                <Spinner size={18} /> <span>Cargando fotos…</span>
              </Row>
            ) : photos.length === 0 ? (
              <div className={styles.coverEmpty}>
                <Icon icon={ImageIcon} size={22} />
                <p>Añade fotos a tus momentos para elegir portada.</p>
              </div>
            ) : (
              <>
                <p className={styles.coverHint}>
                  Toca una foto para usarla de portada. Sin portada, se usa una automática.
                </p>
                <ul className={styles.coverGrid}>
                  {photos.map((photo) => {
                    const selected = photo.imagePath === coverPath
                    return (
                      <li key={photo.imagePath}>
                        <button
                          type="button"
                          className={[
                            'lg-press',
                            styles.coverThumb,
                            selected ? styles.coverThumbOn : null,
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          style={{ backgroundImage: `url('${photo.url}')` }}
                          aria-pressed={selected}
                          aria-label={selected ? 'Quitar de portada' : 'Usar como portada'}
                          onClick={() => void chooseCover(selected ? null : photo.imagePath)}
                        >
                          {selected && (
                            <span className={styles.coverCheck} aria-hidden="true">
                              <Icon icon={Check} size={16} />
                            </span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </div>

          {/* Fin de temporada: cerrar congela el viaje (solo-lectura); reabrir lo
              reactiva. Reversible, por eso va separado de la zona peligrosa. */}
          <div className={styles.settingsSection}>
            <p className={styles.settingsSectionLabel}>Temporada</p>
            {isClosed ? (
              <Button
                variant="secondary"
                size="sm"
                loading={busy}
                onClick={() => void reopenSeason()}
              >
                <Icon icon={LockOpen} size={16} /> Reabrir temporada
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setConfirmingClose(true)}>
                <Icon icon={Flag} size={16} /> Cerrar temporada…
              </Button>
            )}
          </div>

          <div className={styles.dangerZone}>
            <p className={styles.dangerText}>Zona peligrosa</p>
            <Button
              variant="secondary"
              className={styles.dangerBtn}
              size="sm"
              onClick={() => setConfirmingDelete(true)}
            >
              Borrar viaje…
            </Button>
          </div>
        </Stack>
      )}
    </Modal>
  )
}
