import { useState } from 'react'
import { deleteGroup, updateGroupName } from '../../lib/groupData'
import { track } from '../../lib/analytics'
import { Button, Field, Input, Modal, Row, Stack, useToast } from '../../ui'
import styles from './GroupPage.module.css'

interface Props {
  groupId: string
  /** Nombre actual (puede ser null → mostramos el código). */
  currentName: string | null
  onClose: () => void
  /** Tras renombrar: el grupo refresca la cabecera. */
  onRenamed: () => void
  /** Tras borrar el grupo: el grupo navega a la home. */
  onDeleted: () => void
}

// Ajustes del grupo (solo dueño): renombrar y borrar. El borrado es destructivo
// (arrastra retos/votos/miembros en cascada), así que exige escribir el nombre
// del grupo para confirmar — una doble confirmación accidental no basta.
export function GroupSettingsModal({ groupId, currentName, onClose, onRenamed, onDeleted }: Props) {
  const [name, setName] = useState(currentName ?? '')
  const [busy, setBusy] = useState(false)
  // Confirmación fuerte de borrado: el dueño teclea el nombre (o el código si no
  // hay nombre) para habilitar el botón.
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const toast = useToast()

  // Lo que hay que teclear para borrar: el nombre si lo hay, si no el código.
  const deleteTarget = currentName?.trim() || groupId
  const canDelete = confirmText.trim() === deleteTarget

  async function rename() {
    setBusy(true)
    try {
      await updateGroupName(groupId, name)
      track('group_renamed', { group_id: groupId })
      toast.show('Nombre del grupo actualizado', { tone: 'success' })
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

  return (
    <Modal
      open
      onClose={busy ? undefined : onClose}
      title="⚙️ Ajustes del grupo"
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
              Borrar grupo
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
            Esto borra el grupo y, en cascada, <strong>todos sus retos, votos y miembros</strong>.
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
      ) : (
        <Stack gap={4}>
          <Field label="Nombre del grupo" hint="Vacío usa el código del grupo.">
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

          <div className={styles.dangerZone}>
            <p className={styles.dangerText}>Zona peligrosa</p>
            <Button
              variant="secondary"
              className={styles.dangerBtn}
              size="sm"
              onClick={() => setConfirmingDelete(true)}
            >
              Borrar grupo…
            </Button>
          </div>
        </Stack>
      )}
    </Modal>
  )
}
