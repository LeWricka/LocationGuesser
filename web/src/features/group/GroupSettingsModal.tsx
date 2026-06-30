import { useState } from 'react'
import { closeGroup, deleteGroup, reopenGroup, updateGroupName } from '../../lib/groupData'
import { track } from '../../lib/analytics'
import { Flag, LockOpen, Settings } from 'lucide-react'
import { Button, Field, Icon, Input, Modal, Row, Stack, useToast } from '../../ui'
import styles from './GroupPage.module.css'

interface Props {
  groupId: string
  /** Nombre actual (puede ser null → mostramos el código). */
  currentName: string | null
  /** Temporada cerrada (closed_at no null): mostramos "Reabrir" en vez de "Cerrar". */
  isClosed: boolean
  onClose: () => void
  /** Tras renombrar: el grupo refresca la cabecera. */
  onRenamed: () => void
  /** Tras cerrar/reabrir la temporada: el grupo refresca (banner + solo-lectura). */
  onSeasonChanged: () => void
  /** Tras borrar el grupo: el grupo navega a la home. */
  onDeleted: () => void
}

// Ajustes del grupo (solo dueño): renombrar, cerrar/reabrir temporada y borrar. El
// borrado es destructivo (arrastra retos/votos/miembros en cascada), así que exige
// escribir el nombre del grupo para confirmar — una doble confirmación accidental
// no basta. Cerrar la temporada congela el grupo en solo-lectura (es reversible).
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
  const [busy, setBusy] = useState(false)
  // Confirmación fuerte de borrado: el dueño teclea el nombre (o el código si no
  // hay nombre) para habilitar el botón.
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  // Confirmación ligera de cierre de temporada (reversible, no destructivo).
  const [confirmingClose, setConfirmingClose] = useState(false)
  const toast = useToast()

  // Lo que hay que teclear para borrar: el nombre si lo hay, si no el código.
  const deleteTarget = currentName?.trim() || groupId
  const canDelete = confirmText.trim() === deleteTarget

  async function rename() {
    setBusy(true)
    try {
      await updateGroupName(groupId, name)
      track('group_renamed', { group_id: groupId })
      toast.show('Nombre del viaje actualizado', { tone: 'success' })
      onRenamed()
    } catch (err) {
      toast.show(`No se pudo guardar: ${err instanceof Error ? err.message : String(err)}`, {
        tone: 'danger',
      })
      setBusy(false)
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
            <Button size="sm" loading={busy} onClick={() => void rename()}>
              Guardar nombre
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

          {/* Fin de temporada: cerrar congela el grupo (solo-lectura); reabrir lo
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
