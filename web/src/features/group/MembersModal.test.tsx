import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GroupMemberInfo } from '../../lib/membership'

// Mocks de la capa de datos (lib/membership) y analítica. El modal solo orquesta
// estas funciones + UI kit; aislamos la BD real.
const getGroupMembersMock = vi.fn<(groupId: string) => Promise<GroupMemberInfo[]>>()
const setMemberRoleMock = vi.fn<(...args: unknown[]) => Promise<void>>()
const kickMemberMock = vi.fn<(...args: unknown[]) => Promise<void>>()
const leaveGroupMock = vi.fn<(...args: unknown[]) => Promise<void>>()
const transferOwnershipMock = vi.fn<(...args: unknown[]) => Promise<void>>()

vi.mock('../../lib/membership', () => ({
  getGroupMembers: (groupId: string) => getGroupMembersMock(groupId),
  setMemberRole: (...args: unknown[]) => setMemberRoleMock(...args),
  kickMember: (...args: unknown[]) => kickMemberMock(...args),
  leaveGroup: (...args: unknown[]) => leaveGroupMock(...args),
  transferOwnership: (...args: unknown[]) => transferOwnershipMock(...args),
}))

vi.mock('../../lib/analytics', () => ({ track: vi.fn() }))

import { MembersModal } from './MembersModal'
import { ToastProvider } from '../../ui'

const CREATOR: GroupMemberInfo = {
  userId: 'u-creator',
  name: 'Ana',
  role: 'owner',
  isOwner: true,
  isCreator: true,
}
const COOWNER: GroupMemberInfo = {
  userId: 'u-coowner',
  name: 'Bob',
  role: 'owner',
  isOwner: true,
  isCreator: false,
}
const MEMBER: GroupMemberInfo = {
  userId: 'u-member',
  name: 'Cris',
  role: 'member',
  isOwner: false,
  isCreator: false,
}
const COOWNER2: GroupMemberInfo = {
  userId: 'u-coowner2',
  name: 'Dani',
  role: 'owner',
  isOwner: true,
  isCreator: false,
}

function renderModal(props: Partial<Parameters<typeof MembersModal>[0]> = {}) {
  return render(
    <ToastProvider>
      <MembersModal
        groupId="g1"
        meId="u-creator"
        onClose={vi.fn()}
        onLeft={vi.fn()}
        onChanged={vi.fn()}
        {...props}
      />
    </ToastProvider>,
  )
}

async function memberRow(name: string) {
  return (await screen.findByText(name)).closest('li') as HTMLElement
}

beforeEach(() => {
  vi.clearAllMocks()
  setMemberRoleMock.mockResolvedValue(undefined)
  kickMemberMock.mockResolvedValue(undefined)
  leaveGroupMock.mockResolvedValue(undefined)
  transferOwnershipMock.mockResolvedValue(undefined)
})

describe('MembersModal — lista y roles', () => {
  test('marca a los dueños (creador y co-dueño) con "Dueño" y a mí con "Tú"', async () => {
    getGroupMembersMock.mockResolvedValue([CREATOR, COOWNER, MEMBER])
    renderModal()
    await waitFor(() => expect(screen.getAllByText('Dueño')).toHaveLength(2))
    expect(screen.getByText('Miembro')).toBeInTheDocument()
    const myRow = await memberRow('Ana')
    expect(within(myRow).getByText('Tú')).toBeInTheDocument()
  })

  test('un dueño hace co-dueño a un miembro, con confirmación en el PROPIO modal (sin window.confirm)', async () => {
    getGroupMembersMock.mockResolvedValue([CREATOR, MEMBER])
    const confirmSpy = vi.spyOn(window, 'confirm')
    const onChanged = vi.fn()
    const user = userEvent.setup()
    renderModal({ onChanged })

    const row = await memberRow('Cris')
    await user.click(within(row).getByRole('button', { name: /Hacer co-dueño/ }))
    // La confirmación es una vista del modal, no un confirm() nativo.
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(screen.getByText(/co-dueño del viaje\? Podrá gestionarlo como tú/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Hacer co-dueño' }))
    await waitFor(() => expect(setMemberRoleMock).toHaveBeenCalledWith('g1', 'u-member', 'owner'))
    expect(onChanged).toHaveBeenCalled()
  })

  test('cancelar la confirmación vuelve a la lista sin llamar a setMemberRole', async () => {
    getGroupMembersMock.mockResolvedValue([CREATOR, MEMBER])
    const user = userEvent.setup()
    renderModal()

    const row = await memberRow('Cris')
    await user.click(within(row).getByRole('button', { name: /Hacer co-dueño/ }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(setMemberRoleMock).not.toHaveBeenCalled()
    expect(await screen.findByText('Cris')).toBeInTheDocument()
  })

  test('un dueño puede quitar el rol a un co-dueño', async () => {
    getGroupMembersMock.mockResolvedValue([CREATOR, COOWNER])
    const user = userEvent.setup()
    renderModal({ meId: 'u-creator' })

    const bobRow = await memberRow('Bob')
    await user.click(within(bobRow).getByRole('button', { name: /Quitar co-dueño/ }))
    await user.click(screen.getByRole('button', { name: 'Quitar co-dueño' }))
    await waitFor(() => expect(setMemberRoleMock).toHaveBeenCalledWith('g1', 'u-coowner', 'member'))
  })

  test('al CREADOR raíz no se le ofrece "Quitar co-dueño" (la RLS también lo impide)', async () => {
    getGroupMembersMock.mockResolvedValue([CREATOR, COOWNER])
    // me = co-dueño: el creador es "otro" y aun así no se le puede degradar.
    renderModal({ meId: 'u-coowner' })
    const creatorRow = await memberRow('Ana')
    expect(within(creatorRow).queryByRole('button', { name: /Quitar co-dueño/ })).toBeNull()
  })

  test('un NO dueño no ve ninguna acción de gestión', async () => {
    getGroupMembersMock.mockResolvedValue([CREATOR, COOWNER, MEMBER])
    renderModal({ meId: 'u-member' })
    await screen.findByText('Cris')
    expect(screen.queryByRole('button', { name: /Hacer co-dueño/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Quitar co-dueño/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Expulsar/ })).toBeNull()
  })
})

// Issue #758: el receptor sin cuenta (sesión anónima) que aún NO ha jugado ni
// guardado su cuenta no tiene display_name (PlayChallenge se lo pide justo
// antes de votar); getGroupMembers ya resuelve ese hueco a '—'. La lista de
// Miembros lo oculta hasta que tenga algo que mostrar.
describe('MembersModal — oculta anónimos sin actividad (issue #758)', () => {
  const LURKER: GroupMemberInfo = {
    userId: 'u-lurker',
    name: '—',
    role: 'member',
    isOwner: false,
    isCreator: false,
  }

  test('un miembro sin nombre elegido no aparece en la lista', async () => {
    getGroupMembersMock.mockResolvedValue([CREATOR, LURKER])
    renderModal()

    await screen.findByText('Ana')
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })

  test('en cuanto tiene nombre (jugó o guardó su cuenta), aparece como cualquier otro', async () => {
    getGroupMembersMock.mockResolvedValue([CREATOR, { ...LURKER, name: 'Ya jugué' }])
    renderModal()

    expect(await screen.findByText('Ya jugué')).toBeInTheDocument()
  })

  test('con solo el dueño visible, muestra la guía de invitar (cuenta visibles, no el total en BD)', async () => {
    getGroupMembersMock.mockResolvedValue([CREATOR, LURKER])
    renderModal({ onInvite: vi.fn() })

    await screen.findByText('Ana')
    expect(screen.getByText(/Aquí todavía estás tú/)).toBeInTheDocument()
  })
})

describe('MembersModal — expulsar (RLS group_members_delete, 0033)', () => {
  test('el creador expulsa a un miembro con confirmación propia', async () => {
    getGroupMembersMock.mockResolvedValue([CREATOR, MEMBER])
    const onChanged = vi.fn()
    const user = userEvent.setup()
    renderModal({ onChanged })

    const row = await memberRow('Cris')
    await user.click(within(row).getByRole('button', { name: /Expulsar/ }))
    expect(screen.getByText(/Perderá el acceso/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Expulsar' }))
    await waitFor(() => expect(kickMemberMock).toHaveBeenCalledWith('g1', 'u-member'))
    expect(onChanged).toHaveBeenCalled()
  })

  test('el creador puede expulsar también a un CO-DUEÑO (a cualquiera menos a sí mismo)', async () => {
    getGroupMembersMock.mockResolvedValue([CREATOR, COOWNER, MEMBER])
    const user = userEvent.setup()
    renderModal()

    const row = await memberRow('Bob')
    await user.click(within(row).getByRole('button', { name: /Expulsar/ }))
    await user.click(screen.getByRole('button', { name: 'Expulsar' }))
    await waitFor(() => expect(kickMemberMock).toHaveBeenCalledWith('g1', 'u-coowner'))
  })

  test('un CO-DUEÑO expulsa a un MIEMBRO (la RLS ahora lo permite si role=member)', async () => {
    getGroupMembersMock.mockResolvedValue([CREATOR, COOWNER, MEMBER])
    const onChanged = vi.fn()
    const user = userEvent.setup()
    renderModal({ meId: 'u-coowner', onChanged })

    const row = await memberRow('Cris')
    await user.click(within(row).getByRole('button', { name: /Expulsar/ }))
    await user.click(screen.getByRole('button', { name: 'Expulsar' }))
    await waitFor(() => expect(kickMemberMock).toHaveBeenCalledWith('g1', 'u-member'))
    expect(onChanged).toHaveBeenCalled()
  })

  test('un CO-DUEÑO no ve "Expulsar" en otro co-dueño ni en el creador (la RLS solo le respalda role=member)', async () => {
    getGroupMembersMock.mockResolvedValue([CREATOR, COOWNER, COOWNER2, MEMBER])
    renderModal({ meId: 'u-coowner' })
    const creatorRow = await memberRow('Ana')
    const otherOwnerRow = await memberRow('Dani')
    expect(within(creatorRow).queryByRole('button', { name: /Expulsar/ })).toBeNull()
    expect(within(otherOwnerRow).queryByRole('button', { name: /Expulsar/ })).toBeNull()
    // Pero sí gestiona roles (0026 lo respalda para cualquier owner).
    expect(screen.getByRole('button', { name: /Hacer co-dueño/ })).toBeInTheDocument()
  })

  test('nadie ve "Expulsar" en su propia fila (ni el creador ni un co-dueño)', async () => {
    getGroupMembersMock.mockResolvedValue([CREATOR, COOWNER, MEMBER])
    renderModal({ meId: 'u-coowner' })
    const myRow = await memberRow('Bob')
    expect(within(myRow).queryByRole('button', { name: /Expulsar/ })).toBeNull()
  })
})

describe('MembersModal — salir y transferir', () => {
  test('un miembro ve "Salir del viaje"; confirmar llama a leaveGroup y a onLeft', async () => {
    getGroupMembersMock.mockResolvedValue([CREATOR, MEMBER])
    const onLeft = vi.fn()
    const user = userEvent.setup()
    renderModal({ meId: 'u-member', onLeft })

    await user.click(await screen.findByRole('button', { name: /Salir del viaje/ }))
    expect(screen.getByText(/Dejarás de ver sus retos/)).toBeInTheDocument()

    // El botón de confirmar del pie comparte nombre con el disparador; cogemos el del pie.
    const confirmBtns = screen.getAllByRole('button', { name: 'Salir del viaje' })
    await user.click(confirmBtns[confirmBtns.length - 1])
    await waitFor(() => expect(leaveGroupMock).toHaveBeenCalledWith('g1', 'u-member'))
    expect(onLeft).toHaveBeenCalled()
  })

  test('el creador NO ve "Salir del viaje" (transfiere antes); sí ve "Transferir propiedad"', async () => {
    getGroupMembersMock.mockResolvedValue([CREATOR, MEMBER])
    renderModal({ meId: 'u-creator' })
    await screen.findByText('Cris')
    expect(screen.queryByRole('button', { name: /Salir del viaje/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Transferir propiedad/ })).toBeInTheDocument()
  })

  test('un co-dueño NO ve "Transferir propiedad" (la RLS groups_transfer_owner exige created_by)', async () => {
    getGroupMembersMock.mockResolvedValue([CREATOR, COOWNER, MEMBER])
    renderModal({ meId: 'u-coowner' })
    await screen.findByText('Cris')
    expect(screen.queryByRole('button', { name: /Transferir propiedad/ })).toBeNull()
  })

  test('transferir: elige al nuevo dueño y llama a transferOwnership', async () => {
    getGroupMembersMock.mockResolvedValue([CREATOR, COOWNER, MEMBER])
    const onChanged = vi.fn()
    const user = userEvent.setup()
    renderModal({ onChanged })

    await user.click(await screen.findByRole('button', { name: /Transferir propiedad/ }))
    expect(screen.getByText(/Tú pasarás a ser miembro/)).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Cris' }))
    await user.click(screen.getByRole('button', { name: 'Transferir' }))
    await waitFor(() =>
      expect(transferOwnershipMock).toHaveBeenCalledWith('g1', 'u-member', 'u-creator'),
    )
    expect(onChanged).toHaveBeenCalled()
  })
})
