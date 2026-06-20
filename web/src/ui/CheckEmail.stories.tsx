import type { Meta, StoryObj } from '@storybook/react-vite'
import { CheckEmail } from './CheckEmail'

const meta = {
  title: 'Cuentas/CheckEmail',
  component: CheckEmail,
  parameters: { layout: 'fullscreen' },
  args: { email: 'lewis@ejemplo.com' },
} satisfies Meta<typeof CheckEmail>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Reenviando: Story = { args: { resending: true } }
