import type { Meta, StoryObj } from '@storybook/react-vite'
import { HomeDashboard } from './HomeDashboard'
import type { HomeGroup, HomePinned } from './HomeDashboard'

// Miembros de ejemplo (issue #543): 4 en el viaje propio (3 avatares + chip
// "+1"), 2 en el de amigos (sin chip), 1 (solo el dueño) en el cerrado en
// solitario — `AvatarStack` no pinta nada con un único miembro.
const membersFull = [
  { userId: 'u1', name: 'Lewis' },
  { userId: 'u2', name: 'Marta' },
  { userId: 'u3', name: 'Iker' },
  { userId: 'u4', name: 'Noa' },
]

const groups: HomeGroup[] = [
  {
    id: 'a',
    name: 'Japón en primavera',
    status: 'toplay',
    owned: true,
    startsOn: '2026-06-15',
    endsOn: '2026-06-28',
    members: membersFull,
  },
  {
    id: 'b',
    name: 'Costa Amalfitana',
    status: 'live',
    startsOn: '2026-06-02',
    endsOn: '2026-06-09',
    members: [
      { userId: 'u5', name: 'Cris' },
      { userId: 'u6', name: 'Ana' },
    ],
  },
  {
    id: 'c',
    name: 'Ruta por los Alpes',
    status: 'idle',
    owned: true,
    closed: true,
    startsOn: '2026-04-04',
    members: [{ userId: 'u1', name: 'Lewis' }],
  },
]

// Reto abierto fijado arriba ("Te toca jugar"): foto + cuenta atrás + CTA jugar.
const pinned: HomePinned = {
  groupId: 'a',
  challengeId: 'ch1',
  title: '¿Dónde tomó Marta esta foto?',
  groupName: 'Japón en primavera',
  deadlineAt: new Date(Date.now() + 14 * 60 * 60 * 1000).toISOString(),
  coverUrl: null,
}

const meta = {
  title: 'Cuentas/HomeDashboard',
  component: HomeDashboard,
  parameters: { layout: 'fullscreen' },
  args: {
    userId: 'lewis-123',
    displayName: 'Lewis',
    groups,
    pinned,
  },
} satisfies Meta<typeof HomeDashboard>

export default meta
type Story = StoryObj<typeof meta>

export const Completa: Story = {}

export const SinRetoFijado: Story = { args: { pinned: null } }

export const UnViaje: Story = {
  args: {
    pinned: null,
    groups: [{ id: 'a', name: 'Japón en primavera', status: 'live', owned: true }],
  },
}
