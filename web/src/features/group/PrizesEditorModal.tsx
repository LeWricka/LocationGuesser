import { useState } from 'react'
import { Gift } from 'lucide-react'
import { Button, Icon, Input, Modal, Row, Stack, useToast } from '../../ui'
import type { GroupPrizes } from '../../lib/database.types'
import { updateGroupPrizes } from '../../lib/groupData'
import { track } from '../../lib/analytics'
import { PRIZE_SLOTS } from './prizes'
import styles from './PrizesEditorModal.module.css'

interface Props {
  groupId: string
  prizes: GroupPrizes | null
  /** Desde dónde se abre (analítica, issues #752/#753): el nudge de crear viaje
   * o el propio Marcador. Nunca cambia el comportamiento, solo la prop del evento. */
  origin: 'marcador' | 'create_group_nudge'
  onClose: () => void
  onSaved: () => void
}

/**
 * Editor de premios por puesto (issue #123, #608): un campo opcional por puesto
 * (1º/2º/3º/último). Ninguno es obligatorio. Rescatado tal cual de GroupPage: el
 * RLS de `groups` respalda la edición en servidor (solo el dueño puede escribir).
 *
 * Extraído a fichero propio (issues #752/#753) para reutilizarse desde el
 * Marcador (chip/CTA "¿Qué se juega?") Y desde el nudge post-creación del viaje
 * (`CreateGroup`) — antes vivía privado dentro de `MarcadorTab.tsx`.
 */
export function PrizesEditorModal({ groupId, prizes, origin, onClose, onSaved }: Props) {
  // Arranca del valor actual para que el dueño edite sin reescribir todo.
  const [draft, setDraft] = useState<GroupPrizes>(() => ({ ...(prizes ?? {}) }))
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  async function save() {
    setBusy(true)
    try {
      await updateGroupPrizes(groupId, draft)
      // Mide desde dónde se define "qué se juega" (issues #752/#753), solo si
      // queda al menos un premio (guardar todo vacío no es "definir premios").
      if (PRIZE_SLOTS.some(({ key }) => (draft[key]?.trim() ?? '') !== '')) {
        track('prizes_defined', { group_id: groupId, origin })
      }
      toast.show('Premios guardados', { tone: 'success' })
      onSaved()
    } catch (err) {
      toast.show(`No se pudo guardar: ${err instanceof Error ? err.message : String(err)}`, {
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
          <Icon icon={Gift} size={18} /> Premios del viaje
        </>
      }
      footer={
        <Row gap={2} justify="end">
          <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" loading={busy} onClick={() => void save()}>
            Guardar
          </Button>
        </Row>
      }
    >
      <Stack gap={3}>
        <p className={styles.prizeHint}>Opcionales. Se marcan en la fila de cada puesto.</p>
        {PRIZE_SLOTS.map(({ key, label }, i) => (
          <label key={key} className={styles.prizeField}>
            <span className={styles.prizeFieldLabel}>{label}</span>
            <Input
              value={draft[key] ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
              maxLength={120}
              autoFocus={i === 0}
              placeholder="Ej: elige restaurante"
            />
          </label>
        ))}
      </Stack>
    </Modal>
  )
}
