import type { Meta, StoryObj } from '@storybook/react-vite'
import { HomeEmptyState } from './HomeEmptyState'

const meta = {
  title: 'Cuentas/HomeEmptyState',
  component: HomeEmptyState,
  parameters: { layout: 'padded' },
  args: { name: 'Lewis', onCreateGroup: () => {} },
} satisfies Meta<typeof HomeEmptyState>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
