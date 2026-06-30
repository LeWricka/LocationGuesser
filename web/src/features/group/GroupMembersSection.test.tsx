import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GroupMemberInfo } from '../../lib/membership'

// Mocks de la capa de datos (lib/membership) y analítica. La sección solo orquesta
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

import { GroupMembersSection } from './GroupMembersSection'
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

function renderSection(props: Partial<Parameters<typeof GroupMembersSection>[0]> = {}) {
  return render(
    <ToastProvider>
      <GroupMembersSection
        groupId="g1"
        meId="u-creator"
        isOwner
        onLeft={vi.fn()}
        onTransferred={vi.fn()}
        {...props}
      />
    </ToastProvider>,
  )
}

// Abre la lista colapsable <details> para que las filas de miembros sean visibles.
async function openMembers(user: ReturnType<typeof userEvent.setup>) {
  const summary = await screen.findByText(/Miembros \(/)
  await user.click(summary)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('GroupMembersSection — roles', () => {
  test('marca a todos los dueños (creador y co-dueño) con la insignia "Dueño"', async () => {
    getGroupMembersMock.mockResolvedValue([CREATOR, COOWNER, MEMBER])
    const user = userEvent.setup()
    renderSection()
    await openMembers(user)
    // Dos insignias "Dueño" (creador + co-dueño) y una "Miembro".
    await waitFor(() => expect(screen.getAllByText('Dueño')).toHaveLength(2))
    expect(screen.getByText('Miembro')).toBeInTheDocument()
  })

  test('un dueño puede hacer co-dueño a un miembro', async () => {
    getGroupMembersMock.mockResolvedValue([CREATOR, MEMBER])
    const user = userEvent.setup()
    renderSection()
    await openMembers(user)
    const row = (await screen.findByText('Cris')).closest('li') as HTMLElement
    await user.click(within(row).getByRole('button', { name: /Hacer co-dueño/ }))
    await waitFor(() => expect(setMemberRoleMock).toHaveBeenCalledWith('g1', 'u-member', 'owner'))
  })

  test('un dueño puede quitar el rol a un co-dueño', async () => {
    getGroupMembersMock.mockResolvedValue([CREATOR, COOWNER])
    const user = userEvent.setup()
    renderSection()
    await openMembers(user)
    const row = (await screen.findByText('Bob')).closest('li') as HTMLElement
    await user.click(within(row).getByRole('button', { name: /Quitar co-dueño/ }))
    await waitFor(() => expect(setMemberRoleMock).toHaveBeenCalledWith('g1', 'u-coowner', 'member'))
  })

  test('al CREADOR raíz no se le ofrece "Quitar co-dueño"', async () => {
    // me = co-dueño (no el creador), para que el creador sea "otro" y aun así no
    // aparezca la acción de degradarlo.
    getGroupMembersMock.mockResolvedValue([CREATOR, COOWNER])
    const user = userEvent.setup()
    renderSection({ meId: 'u-coowner' })
    await openMembers(user)
    const row = (await screen.findByText('Ana')).closest('li') as HTMLElement
    expect(within(row).queryByRole('button', { name: /Quitar co-dueño/ })).toBeNull()
  })

  test('un NO dueño no ve acciones de gestión de roles', async () => {
    getGroupMembersMock.mockResolvedValue([CREATOR, COOWNER, MEMBER])
    const user = userEvent.setup()
    renderSection({ isOwner: false, meId: 'u-member' })
    await openMembers(user)
    await screen.findByText('Cris')
    expect(screen.queryByRole('button', { name: /Hacer co-dueño/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Quitar co-dueño/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Expulsar/ })).toBeNull()
  })
})
