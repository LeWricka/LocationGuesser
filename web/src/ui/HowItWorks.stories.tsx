import type { Meta, StoryObj } from '@storybook/react-vite'
import { HowItWorks } from './HowItWorks'

const meta = {
  title: 'Cuentas/HowItWorks',
  component: HowItWorks,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof HowItWorks>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Compact: Story = { args: { compact: true } }
