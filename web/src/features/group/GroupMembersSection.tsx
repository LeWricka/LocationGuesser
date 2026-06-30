import { useCallback, useEffect, useState } from 'react'
import {
  getGroupMembers,
  kickMember,
  leaveGroup,
  transferOwnership,
  type GroupMemberInfo,
} from '../../lib/membership'
import { track } from '../../lib/analytics'
import { Crown, Users } from 'lucide-react'
import { Avatar, Badge, Button, Card, Icon, Modal, Row, Skeleton, Stack, useToast } from '../../ui'
import styles from './GroupPage.module.css'

interface Props {
  groupId: string
  /** Usuario actual: distingue "yo" del resto y habilita "salir". */
  meId?: string
  /** Soy el dueño: veo expulsar y transferir. */
  isOwner: boolean
  /** Tras salir del grupo: el grupo navega a la home. */
  onLeft: () => void
  /** Tras transferir la propiedad: el grupo recarga permisos y miembros. */
  onTransferred: () => void
}

// Lista de miembros del grupo con su rol. El dueño gestiona (expulsar,
// transferir la propiedad); cualquiera puede salir (el dueño debe transferir
// antes). Es prerequisito de la gestión de gente del #146.
export function GroupMembersSection({ groupId, meId, isOwner, onLeft, onTransferred }: Props) {
  const [members, setMembers] = useState<GroupMemberInfo[] | null>(null)
  const [error, setError] = useState(false)
  const [transferring, setTransferring] = useState(false)
  const toast = useToast()

  const refresh = useCallback(async () => {
    try {
      setMembers(await getGroupMembers(groupId))
    } catch {
      setError(true)
    }
  }, [groupId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh es async: setState corre tras el fetch, no síncrono
    void refresh()
  }, [refresh])

  async function kick(member: GroupMemberInfo) {
    if (!confirm(`¿Expulsar a ${member.name} del viaje? Perderá el acceso.`)) return
    try {
      await kickMember(groupId, member.userId)
      track('member_kicked', { group_id: groupId })
      toast.show(`${member.name} ha salido del viaje`, { tone: 'neutral' })
      void refresh()
    } catch (err) {
      toast.show(`No se pudo expulsar: ${err instanceof Error ? err.message : String(err)}`, {
        tone: 'danger',
      })
    }
  }

  async function leave() {
    // El dueño no puede salir sin transferir: se lo decimos y abrimos el flujo.
    if (isOwner) {
      toast.show('Como dueño, transfiere antes la propiedad a otro miembro.', { tone: 'danger' })
      setTransferring(true)
      return
    }
    if (!confirm('¿Salir de este viaje? Dejarás de ver sus retos y clasificación.')) return
    try {
      if (meId) await leaveGroup(groupId, meId)
      track('member_left', { group_id: groupId })
      onLeft()
    } catch (err) {
      toast.show(`No se pudo salir: ${err instanceof Error ? err.message : String(err)}`, {
        tone: 'danger',
      })
    }
  }

  if (error) return null

  return (
    <section>
      {members === null ? (
        <>
          <Row justify="between" align="center" gap={2}>
            <h2 className={styles.sectionTitle}>
              <Icon icon={Users} size={18} /> Miembros
            </h2>
            {meId && (
              <button type="button" className={styles.editPrizesBtn} onClick={() => void leave()}>
                Salir del viaje
              </button>
            )}
          </Row>
          <Card padding="none">
            <div>
              {[0, 1, 2].map((i) => (
                <Row key={i} justify="between" align="center" gap={3} className={styles.skelRow}>
                  <Skeleton width="40%" height={16} />
                  <Skeleton width={64} height={16} />
                </Row>
              ))}
            </div>
          </Card>
        </>
      ) : (
        <>
          {/* Lista colapsable: la membresía es secundaria (la página es larga), así
              que arranca cerrada. <details> da el toggle accesible nativo; el
              chevron lo rota el CSS según [open]. "Salir del grupo" queda fuera del
              <summary> para no entrar/salir del colapso al pulsarlo. */}
          <details className={styles.membersDetails}>
            <summary className={styles.membersSummary}>
              <span className={styles.sectionTitle}>
                <Icon icon={Users} size={18} /> Miembros ({members.length})
              </span>
              <span className={styles.membersChevron} aria-hidden="true">
                ▼
              </span>
            </summary>
            <Card padding="none">
              <ul className={styles.memberList}>
                {members.map((m) => {
                  const isMe = meId != null && m.userId === meId
                  return (
                    <li key={m.userId} className={styles.memberRow}>
                      <span className={styles.memberName}>
                        {/* getGroupMembers (lib, fuera de esta área) no trae el avatar;
                            usamos el avatar por defecto estable del userId, que es lo
                            que el propio Avatar resuelve sin avatarUrl. */}
                        <Avatar userId={m.userId} name={m.name} size="sm" />
                        {m.name}
                        {isMe && <span className={styles.youTag}>Tú</span>}
                      </span>
                      <Row gap={2} align="center">
                        {m.isOwner ? (
                          <Badge tone="accent">
                            <Icon icon={Crown} size={14} /> Dueño
                          </Badge>
                        ) : (
                          <Badge tone="neutral">Miembro</Badge>
                        )}
                        {/* El dueño puede expulsar a cualquier otro miembro. */}
                        {isOwner && !m.isOwner && (
                          <Button variant="ghost" size="sm" onClick={() => void kick(m)}>
                            Expulsar
                          </Button>
                        )}
                      </Row>
                    </li>
                  )
                })}
              </ul>
            </Card>
          </details>
          {meId && (
            <Row justify="end" className={styles.transferRow}>
              <button type="button" className={styles.editPrizesBtn} onClick={() => void leave()}>
                Salir del viaje
              </button>
            </Row>
          )}
        </>
      )}

      {isOwner && members && members.length > 1 && (
        <Row justify="end" className={styles.transferRow}>
          <button
            type="button"
            className={styles.editPrizesBtn}
            onClick={() => setTransferring(true)}
          >
            <Icon icon={Crown} size={15} /> Transferir propiedad
          </button>
        </Row>
      )}

      {transferring && members && meId && (
        <TransferOwnershipModal
          groupId={groupId}
          meId={meId}
          members={members}
          onClose={() => setTransferring(false)}
          onTransferred={() => {
            setTransferring(false)
            track('ownership_transferred', { group_id: groupId })
            onTransferred()
          }}
        />
      )}
    </section>
  )
}

// Modal para elegir el nuevo dueño entre los demás miembros. Tras transferir, el
// que era dueño pasa a miembro (y el flujo de salir queda disponible).
function TransferOwnershipModal({
  groupId,
  meId,
  members,
  onClose,
  onTransferred,
}: {
  groupId: string
  meId: string
  members: GroupMemberInfo[]
  onClose: () => void
  onTransferred: () => void
}) {
  const candidates = members.filter((m) => m.userId !== meId)
  const [selected, setSelected] = useState<string>(candidates[0]?.userId ?? '')
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  async function transfer() {
    if (!selected) return
    const target = candidates.find((c) => c.userId === selected)
    if (!confirm(`¿Hacer a ${target?.name ?? 'este miembro'} dueño del viaje? Dejarás de serlo.`)) {
      return
    }
    setBusy(true)
    try {
      await transferOwnership(groupId, selected, meId)
      toast.show('Propiedad transferida', { tone: 'success' })
      onTransferred()
    } catch (err) {
      toast.show(`No se pudo transferir: ${err instanceof Error ? err.message : String(err)}`, {
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
          <Icon icon={Crown} size={18} /> Transferir propiedad
        </>
      }
      footer={
        <Row gap={2} justify="end">
          <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" loading={busy} disabled={!selected} onClick={() => void transfer()}>
            Transferir
          </Button>
        </Row>
      }
    >
      <Stack gap={3}>
        <p className={styles.empty}>Elige al nuevo dueño. Tú pasarás a ser miembro.</p>
        <Stack gap={2}>
          {candidates.map((c) => (
            <label key={c.userId} className={styles.radioRow}>
              <input
                type="radio"
                name="new-owner"
                value={c.userId}
                checked={selected === c.userId}
                onChange={() => setSelected(c.userId)}
              />
              <span>{c.name}</span>
            </label>
          ))}
        </Stack>
      </Stack>
    </Modal>
  )
}
