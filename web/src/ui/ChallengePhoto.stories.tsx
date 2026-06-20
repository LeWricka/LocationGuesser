import type { Meta, StoryObj } from '@storybook/react-vite'
import { ChallengePhoto } from './ChallengePhoto'

const SAMPLE = 'https://images.unsplash.com/photo-1513735492246-483525079686?w=600&q=70&auto=format'

const meta = {
  title: 'Cuentas/ChallengePhoto',
  component: ChallengePhoto,
  args: { src: SAMPLE, alt: 'Foto del reto', ratio: 'photo', size: 'md' },
  argTypes: {
    ratio: { control: 'inline-radio', options: ['square', 'photo', 'wide'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
  },
} satisfies Meta<typeof ChallengePhoto>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Cuadrada: Story = { args: { ratio: 'square' } }
export const ConCaption: Story = { args: { caption: 'reto de Ana' } }
export const SinFoto: Story = { args: { src: null } }
export const Pulsable: Story = { args: { onClick: () => {} } }
