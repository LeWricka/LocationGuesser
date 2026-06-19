import type { Meta, StoryObj } from '@storybook/react-vite'
import { Card } from './Card'

const meta = {
  title: 'UI/Card',
  component: Card,
  args: {
    children: (
      <>
        <h3>Reto en Lisboa</h3>
        <p style={{ color: 'var(--color-muted)' }}>3 jugadores han adivinado.</p>
      </>
    ),
  },
  argTypes: {
    padding: { control: 'inline-radio', options: ['none', 'sm', 'md', 'lg'] },
    raised: { control: 'boolean' },
  },
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Raised: Story = { args: { raised: true } }

export const Paddings: Story = {
  render: (args) => (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card {...args} padding="sm">
        padding sm
      </Card>
      <Card {...args} padding="md">
        padding md
      </Card>
      <Card {...args} padding="lg">
        padding lg
      </Card>
    </div>
  ),
}
