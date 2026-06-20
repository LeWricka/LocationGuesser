import type { Meta, StoryObj } from '@storybook/react-vite'
import { GroupCard } from './GroupCard'

const meta = {
  title: 'Cuentas/GroupCard',
  component: GroupCard,
  args: { name: "Interrail '26", status: 'idle' },
  argTypes: {
    status: { control: 'inline-radio', options: ['live', 'toplay', 'idle'] },
    owned: { control: 'boolean' },
  },
} satisfies Meta<typeof GroupCard>

export default meta
type Story = StoryObj<typeof meta>

export const Live: Story = { args: { status: 'live' } }
export const ToPlay: Story = { args: { status: 'toplay' } }
export const Idle: Story = { args: { status: 'idle' } }
export const Owned: Story = { args: { status: 'toplay', owned: true } }
export const WithMeta: Story = { args: { status: 'idle', meta: '5 miembros · 3 retos' } }

export const Lista: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
      <GroupCard name="Interrail '26" status="toplay" owned onClick={() => {}} />
      <GroupCard name="Finde Lisboa" status="live" onClick={() => {}} />
      <GroupCard name="Pirineos" status="idle" onClick={() => {}} />
    </div>
  ),
}
