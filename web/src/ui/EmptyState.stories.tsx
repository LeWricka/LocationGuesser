import type { Meta, StoryObj } from '@storybook/react-vite'
import { EmptyState } from './EmptyState'

const meta = {
  title: 'UI/EmptyState',
  component: EmptyState,
  parameters: { layout: 'padded' },
  args: {
    icon: '🗺️',
    title: 'Aún nadie ha jugado este reto',
    description: 'Sé el primero en adivinar dónde es.',
  },
} satisfies Meta<typeof EmptyState>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithAction: Story = {
  args: { actionLabel: 'Crear el primer reto', onAction: () => {} },
}

export const Danger: Story = {
  args: {
    icon: '⚠️',
    tone: 'danger',
    title: 'No hemos podido cargar esto',
    description: 'Comprueba tu conexión e inténtalo de nuevo.',
    actionLabel: 'Reintentar',
    onAction: () => {},
  },
}
