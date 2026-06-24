import type { Meta, StoryObj } from '@storybook/react-vite'
import { Avatar } from './Avatar'
import { ANIMAL_EMOJIS, avatarToken } from '../lib/avatar'

const meta = {
  title: 'Cuentas/Avatar',
  component: Avatar,
  args: { userId: 'lewis-123', name: 'Lewis', size: 'md' },
  argTypes: { size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] } },
} satisfies Meta<typeof Avatar>

export default meta
type Story = StoryObj<typeof meta>

export const PorDefecto: Story = {}

export const AnimalElegido: Story = {
  args: { avatarUrl: avatarToken('🦊') },
}

export const ImagenRetrocompat: Story = {
  args: {
    avatarUrl:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=128&q=70&auto=format',
  },
}

export const Tamaños: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <Avatar userId="ana" name="Ana" size="sm" />
      <Avatar userId="lewis" name="Lewis" size="md" />
      <Avatar userId="marco" name="Marco" size="lg" />
    </div>
  ),
}

// Muestra todo el set sobre sus fondos para revisar contraste de un vistazo.
export const Galería: Story = {
  render: () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxWidth: 520 }}>
      {ANIMAL_EMOJIS.map((emoji) => (
        <Avatar key={emoji} userId={`u-${emoji}`} avatarUrl={avatarToken(emoji)} size="md" />
      ))}
    </div>
  ),
}
