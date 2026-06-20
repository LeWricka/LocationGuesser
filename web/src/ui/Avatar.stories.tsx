import type { Meta, StoryObj } from '@storybook/react-vite'
import { Avatar } from './Avatar'

const meta = {
  title: 'Cuentas/Avatar',
  component: Avatar,
  args: { name: 'Lewis', size: 'md' },
  argTypes: { size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] } },
} satisfies Meta<typeof Avatar>

export default meta
type Story = StoryObj<typeof meta>

export const Inicial: Story = {}
export const ConFoto: Story = {
  args: {
    src: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=128&q=70&auto=format',
  },
}
export const Tamaños: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <Avatar name="Ana" size="sm" />
      <Avatar name="Lewis" size="md" />
      <Avatar name="Marco" size="lg" />
    </div>
  ),
}
