import type { Meta, StoryObj } from '@storybook/react-vite'
import { Spinner } from './Spinner'

const meta = {
  title: 'UI/Spinner',
  component: Spinner,
  argTypes: {
    size: { control: { type: 'number', min: 12, max: 64, step: 2 } },
    color: { control: 'color' },
  },
} satisfies Meta<typeof Spinner>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Large: Story = { args: { size: 40 } }
export const Accent: Story = { args: { size: 32, color: 'var(--color-accent)' } }

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <Spinner size={16} />
      <Spinner size={24} />
      <Spinner size={40} />
    </div>
  ),
}
