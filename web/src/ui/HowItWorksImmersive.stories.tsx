import type { Meta, StoryObj } from '@storybook/react-vite'
import { HowItWorksImmersive } from './HowItWorksImmersive'

const meta = {
  title: 'Cuentas/HowItWorksImmersive',
  component: HowItWorksImmersive,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof HowItWorksImmersive>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { ctaLabel: 'Empieza un viaje', onCta: () => {} },
}

// Sin handler de CTA: modo puramente visual (el botón no se muestra).
export const SinCta: Story = {}
