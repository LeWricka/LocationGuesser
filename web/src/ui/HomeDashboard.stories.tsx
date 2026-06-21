import type { Meta, StoryObj } from '@storybook/react-vite'
import { HomeDashboard } from './HomeDashboard'
import type { HomeGroup, HomeTurn } from './HomeDashboard'

const groups: HomeGroup[] = [
  { id: 'a', name: "Interrail '26", status: 'toplay', owned: true },
  { id: 'b', name: 'Finde Lisboa', status: 'live' },
  { id: 'c', name: 'Pirineos', status: 'idle' },
]

const turns: HomeTurn[] = [
  { id: 't1', groupName: "Interrail '26", author: 'Ana', countdown: '3 h 12 m' },
]

const meta = {
  title: 'Cuentas/HomeDashboard',
  component: HomeDashboard,
  parameters: { layout: 'fullscreen' },
  args: {
    displayName: 'Lewis',
    groups,
    turns,
    stats: { totalPoints: 12480, groupsPlayed: 3, best: { points: 4932, groupName: 'Lisboa' } },
  },
} satisfies Meta<typeof HomeDashboard>

export default meta
type Story = StoryObj<typeof meta>

export const Completa: Story = {}

export const SinTurnos: Story = { args: { turns: [] } }

export const UsuarioNuevo: Story = {
  args: { groups: [], turns: [], stats: null },
}

export const SinNumeros: Story = { args: { stats: null } }
