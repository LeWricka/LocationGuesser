import type { Meta, StoryObj } from '@storybook/react-vite'
import { Badge } from './Badge'

const meta = {
  title: 'UI/Badge',
  component: Badge,
  args: { children: 'estado' },
  argTypes: {
    tone: {
      control: 'inline-radio',
      options: ['neutral', 'accent', 'success', 'warning', 'danger', 'live'],
    },
    dot: { control: 'boolean' },
  },
} satisfies Meta<typeof Badge>

export default meta
type Story = StoryObj<typeof meta>

export const Neutral: Story = { args: { tone: 'neutral', children: 'cerrado' } }
export const Accent: Story = { args: { tone: 'accent', children: 'nuevo' } }
export const Success: Story = { args: { tone: 'success', children: '+5000' } }
export const Warning: Story = { args: { tone: 'warning', children: 'acaba pronto' } }
export const Danger: Story = { args: { tone: 'danger', children: 'expirado' } }
export const Live: Story = { args: { tone: 'live', dot: true, children: 'en vivo' } }

export const AllTones: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Badge tone="neutral">cerrado</Badge>
      <Badge tone="accent">nuevo</Badge>
      <Badge tone="success">+5000</Badge>
      <Badge tone="warning">acaba pronto</Badge>
      <Badge tone="danger">expirado</Badge>
      <Badge tone="live" dot>
        en vivo
      </Badge>
    </div>
  ),
}
