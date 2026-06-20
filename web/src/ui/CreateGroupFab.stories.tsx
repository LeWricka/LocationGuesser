import type { Meta, StoryObj } from '@storybook/react-vite'
import { CreateGroupFab } from './CreateGroupFab'

const meta = {
  title: 'Cuentas/CreateGroupFab',
  component: CreateGroupFab,
  parameters: { layout: 'fullscreen' },
  args: { onClick: () => {} },
} satisfies Meta<typeof CreateGroupFab>

export default meta
type Story = StoryObj<typeof meta>

// El FAB es fixed; lo mostramos sobre un lienzo alto para verlo en su sitio.
export const Default: Story = {
  render: (args) => (
    <div style={{ minHeight: '70vh', padding: 16 }}>
      <p style={{ color: 'var(--color-text-muted)' }}>
        El FAB queda fijo abajo-derecha. En pantallas anchas expande la etiqueta.
      </p>
      <CreateGroupFab {...args} />
    </div>
  ),
}
