import { useCallback, useEffect, useState } from 'react'
import {
  getGroupMembers,
  kickMember,
  leaveGroup,
  setMemberRole,
  transferOwnership,
  type GroupMemberInfo,
} from '../../lib/membership'
import { track } from '../../lib/analytics'
import { Crown, LogOut, UserMinus, Users } from 'lucide-react'
import { Avatar, Badge, Button, Icon, Modal, Row, Skeleton, Stack, useToast } from '../../ui'
// Estilos compartidos de la feature (youTag, empty, skelRow, radioRow, botón
// discreto) + los propios de esta lista (filas que envuelven, ver el .css).
import shared from './GroupPage.module.css'
import styles from './MembersModal.module.css'

interface Props {
  groupId: string
  /** Usuario actual: distingue "yo", habilita "salir" y decide qué acciones ve. */
  meId: string | null
  onClose: () => void
  /** Tras salir del viaje: el viaje navega a la home. */
  onLeft: () => void
  /** Tras promover/degradar, expulsar o transferir: el viaje recarga permisos y datos. */
  onChanged: () => void
}

/**
 * Vista dentro del modal. Las confirmaciones NO usan window.confirm ni un segundo
 * Modal apilado (dos listeners de Escape se pisarían): el propio modal cambia de
 * cuerpo, igual que hace GroupSettingsModal con borrar/cerrar temporada.
 */
type View =
  | { kind: 'list' }
  | { kind: 'promote' | 'demote' | 'kick'; member: GroupMemberInfo }
  | { kind: 'leave' }
  | { kind: 'transfer' }

/**
 * Gestión de miembros del viaje (issue #616), colgada del menú ⋯ como entrada
 * propia "Miembros": lista con rol y, según permisos, hacer/quitar co-dueño,
 * expulsar, salir del viaje y transferir la propiedad.
 *
 * Qué respalda el RLS real (la UI solo pinta lo que la BD permite):
 *   · Hacer/quitar co-dueño → `group_members_update_owner` (0026): cualquier
 *     dueño (creador raíz o co-dueño); el WITH CHECK impide degradar al creador.
 *   · Expulsar → `group_members_delete` (0004): filas ajenas SOLO las borra el
 *     CREADOR (`groups.created_by`). Un co-dueño no puede expulsar (recibiría 0
 *     filas), así que la acción solo se le ofrece al creador raíz.
 *   · Salir → `group_members_delete` (0004): la fila propia siempre; el creador
 *     no sale sin transferir antes (lo respalda también lib/membership).
 *   · Transferir → `groups_transfer_owner` (0009): solo el `created_by` actual,
 *     y el nuevo dueño debe ser ya miembro.
 */
export function MembersModal({ groupId, meId, onClose, onLeft, onChanged }: Props) {
  const [members, setMembers] = useState<GroupMemberInfo[] | null>(null)
  const [error, setError] = useState(false)
  const [view, setView] = useState<View>({ kind: 'list' })
  const [busy, setBusy] = useState(false)
  // Nuevo dueño elegido en la vista de transferir.
  const [selected, setSelected] = useState('')
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

  // Mis permisos, derivados de mi propia fila (la BD manda; esto solo decide qué
  // acciones PINTAR — cada acción la respalda su policy, ver el docblock).
  const me = meId ? (members ?? []).find((m) => m.userId === meId) : undefined
  const meIsOwner = me?.isOwner ?? false
  const meIsCreator = me?.isCreator ?? false
  const candidates = (members ?? []).filter((m) => m.userId !== meId)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    try {
      await action()
      setView({ kind: 'list' })
    } catch (err) {
      toast.show(`No se pudo completar: ${err instanceof Error ? err.message : String(err)}`, {
        tone: 'danger',
      })
    } finally {
      setBusy(false)
    }
  }

  // Promover a co-dueño / degradar a miembro (RLS group_members_update_owner, 0026).
  const changeRole = (member: GroupMemberInfo, role: 'owner' | 'member') =>
    run(async () => {
      await setMemberRole(groupId, member.userId, role)
      track('member_role_changed', { group_id: groupId, role })
      toast.show(
        role === 'owner' ? `${member.name} ya es co-dueño` : `${member.name} ya no es co-dueño`,
        { tone: role === 'owner' ? 'success' : 'neutral' },
      )
      await refresh()
      onChanged()
    })

  // Expulsar (RLS group_members_delete, 0004: solo el creador borra filas ajenas).
  const kick = (member: GroupMemberInfo) =>
    run(async () => {
      await kickMember(groupId, member.userId)
      track('member_kicked', { group_id: groupId })
      toast.show(`${member.name} ha salido del viaje`, { tone: 'neutral' })
      await refresh()
      onChanged()
    })

  // Salir del viaje (fila propia). El creador no ve esta acción: transfiere antes.
  const leave = () =>
    run(async () => {
      if (!meId) return
      await leaveGroup(groupId, meId)
      track('member_left', { group_id: groupId })
      onLeft()
    })

  // Transferir la propiedad raíz (RLS groups_transfer_owner, 0009). El propio
  // botón "Transferir" de esta vista ya es la confirmación explícita.
  const transfer = () =>
    run(async () => {
      if (!meId || !selected) return
      await transferOwnership(groupId, selected, meId)
      track('ownership_transferred', { group_id: groupId })
      toast.show('Propiedad transferida', { tone: 'success' })
      await refresh()
      onChanged()
    })

  const title =
    view.kind === 'list' ? (
      <>
        <Icon icon={Users} size={18} /> Miembros
      </>
    ) : view.kind === 'transfer' ? (
      <>
        <Icon icon={Crown} size={18} /> Transferir propiedad
      </>
    ) : view.kind === 'kick' ? (
      <>
        <Icon icon={UserMinus} size={18} /> Expulsar
      </>
    ) : view.kind === 'leave' ? (
      <>
        <Icon icon={LogOut} size={18} /> Salir del viaje
      </>
    ) : (
      <>
        <Icon icon={Crown} size={18} /> Co-dueño
      </>
    )

  const confirmFooter = (label: string, action: () => void, danger = false) => (
    <Row gap={2} justify="end">
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => setView({ kind: 'list' })}>
        Cancelar
      </Button>
      <Button
        variant={danger ? 'danger' : 'primary'}
        size="sm"
        loading={busy}
        onClick={action}
        disabled={view.kind === 'transfer' && !selected}
      >
        {label}
      </Button>
    </Row>
  )

  const footer =
    view.kind === 'list' ? (
      <Row gap={2} justify="end">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cerrar
        </Button>
      </Row>
    ) : view.kind === 'promote' ? (
      confirmFooter('Hacer co-dueño', () => void changeRole(view.member, 'owner'))
    ) : view.kind === 'demote' ? (
      confirmFooter('Quitar co-dueño', () => void changeRole(view.member, 'member'))
    ) : view.kind === 'kick' ? (
      confirmFooter('Expulsar', () => void kick(view.member), true)
    ) : view.kind === 'leave' ? (
      confirmFooter('Salir del viaje', () => void leave(), true)
    ) : (
      confirmFooter('Transferir', () => void transfer())
    )

  return (
    <Modal open onClose={busy ? undefined : onClose} title={title} footer={footer}>
      {view.kind === 'list' ? (
        <Stack gap={3}>
          {error ? (
            <p className={shared.empty}>No se pudieron cargar los miembros. Prueba de nuevo.</p>
          ) : members === null ? (
            <div>
              {[0, 1, 2].map((i) => (
                <Row key={i} justify="between" align="center" gap={3} className={shared.skelRow}>
                  <Skeleton width="40%" height={16} />
                  <Skeleton width={64} height={16} />
                </Row>
              ))}
            </div>
          ) : (
            <ul className={styles.list}>
              {members.map((m) => {
                const isMe = meId != null && m.userId === meId
                return (
                  <li key={m.userId} className={styles.row}>
                    <span className={styles.name}>
                      {/* getGroupMembers no trae el avatar; el Avatar resuelve el
                          por-defecto estable del userId sin avatarUrl. */}
                      <Avatar userId={m.userId} name={m.name} size="sm" />
                      {m.name}
                      {isMe && <span className={shared.youTag}>Tú</span>}
                    </span>
                    {m.isOwner ? (
                      <Badge tone="accent">
                        <Icon icon={Crown} size={14} /> Dueño
                      </Badge>
                    ) : (
                      <Badge tone="neutral">Miembro</Badge>
                    )}
                    <span className={styles.actions}>
                      {/* Cualquier dueño promueve a un miembro a co-dueño. */}
                      {meIsOwner && !m.isOwner && !isMe && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setView({ kind: 'promote', member: m })}
                        >
                          <Icon icon={Crown} size={14} /> Hacer co-dueño
                        </Button>
                      )}
                      {/* Degradar a un co-dueño; nunca al creador raíz (la RLS también lo impide). */}
                      {meIsOwner && m.isOwner && !m.isCreator && !isMe && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setView({ kind: 'demote', member: m })}
                        >
                          Quitar co-dueño
                        </Button>
                      )}
                      {/* Expulsar: SOLO el creador raíz (es lo único que respalda la RLS
                          group_members_delete; un co-dueño recibiría 0 filas). A un
                          co-dueño se le quita antes el rol. */}
                      {meIsCreator && !m.isOwner && !isMe && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setView({ kind: 'kick', member: m })}
                        >
                          <Icon icon={UserMinus} size={14} /> Expulsar
                        </Button>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}

          {/* Acciones de pie de lista: salir (no-creador) y transferir (creador). */}
          {me && !meIsCreator && (
            <Row justify="end">
              <button
                type="button"
                className={shared.editPrizesBtn}
                onClick={() => setView({ kind: 'leave' })}
              >
                <Icon icon={LogOut} size={15} /> Salir del viaje
              </button>
            </Row>
          )}
          {meIsCreator && candidates.length > 0 && (
            <Row justify="end">
              <button
                type="button"
                className={shared.editPrizesBtn}
                onClick={() => {
                  setSelected(candidates[0]?.userId ?? '')
                  setView({ kind: 'transfer' })
                }}
              >
                <Icon icon={Crown} size={15} /> Transferir propiedad
              </button>
            </Row>
          )}
        </Stack>
      ) : view.kind === 'promote' ? (
        <p>
          ¿Hacer a <strong>{view.member.name}</strong> co-dueño del viaje? Podrá gestionarlo como
          tú.
        </p>
      ) : view.kind === 'demote' ? (
        <p>
          ¿Quitar a <strong>{view.member.name}</strong> como co-dueño? Volverá a ser miembro.
        </p>
      ) : view.kind === 'kick' ? (
        <p>
          ¿Expulsar a <strong>{view.member.name}</strong> del viaje? Perderá el acceso.
        </p>
      ) : view.kind === 'leave' ? (
        <p>¿Salir de este viaje? Dejarás de ver sus retos y su clasificación.</p>
      ) : (
        <Stack gap={3}>
          <p className={shared.empty}>Elige al nuevo dueño. Tú pasarás a ser miembro.</p>
          <Stack gap={2}>
            {candidates.map((c) => (
              <label key={c.userId} className={shared.radioRow}>
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
      )}
    </Modal>
  )
}
