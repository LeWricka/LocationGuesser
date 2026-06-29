import type { Meta, StoryObj } from '@storybook/react-vite'
import { HomeDashboard } from './HomeDashboard'
import type { HomeGroup } from './HomeDashboard'

const groups: HomeGroup[] = [
  { id: 'a', name: "Interrail '26", status: 'toplay', owned: true },
  { id: 'b', name: 'Finde Lisboa', status: 'live' },
  { id: 'c', name: 'Pirineos', status: 'idle' },
]

// El mapamundi real (HomeWorldMap) vive en features/home y depende de la capa de
// mapa; en Storybook lo sustituimos por un marcador visual para encuadrar el layout.
const worldMapPlaceholder = (
  <div
    style={{
      aspectRatio: '1 / 1.18',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--ink-900)',
      display: 'grid',
      placeItems: 'center',
      color: '#fff',
      fontFamily: 'var(--font-serif)',
    }}
  >
    Mapamundi satélite
  </div>
)

const meta = {
  title: 'Cuentas/HomeDashboard',
  component: HomeDashboard,
  parameters: { layout: 'fullscreen' },
  args: {
    userId: 'lewis-123',
    displayName: 'Lewis',
    groups,
    worldMap: worldMapPlaceholder,
  },
} satisfies Meta<typeof HomeDashboard>

export default meta
type Story = StoryObj<typeof meta>

export const Completa: Story = {}

export const SinMapa: Story = { args: { worldMap: undefined } }

export const UnViaje: Story = {
  args: { groups: [{ id: 'a', name: "Interrail '26", status: 'live', owned: true }] },
}
