import type { Meta, StoryObj } from '@storybook/react-vite'
import { BackHomeButton } from './BackHomeButton'

const meta = {
  title: 'Cuentas/BackHomeButton',
  component: BackHomeButton,
  args: { onClick: () => {} },
} satisfies Meta<typeof BackHomeButton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const TextoCustom: Story = { args: { label: 'Volver' } }
