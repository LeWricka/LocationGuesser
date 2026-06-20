import type { Meta, StoryObj } from '@storybook/react-vite'
import { PhotoStrip } from './PhotoStrip'
import type { PhotoStripItem } from './PhotoStrip'

const photos: PhotoStripItem[] = [
  {
    id: '1',
    src: 'https://images.unsplash.com/photo-1513735492246-483525079686?w=300&q=60&auto=format',
    caption: 'Lisboa',
  },
  {
    id: '2',
    src: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=300&q=60&auto=format',
    caption: 'París',
  },
  { id: '3', src: null, caption: 'Pirineos' },
]

const meta = {
  title: 'Cuentas/PhotoStrip',
  component: PhotoStrip,
  args: { photos },
} satisfies Meta<typeof PhotoStrip>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Vacia: Story = { args: { photos: [] } }
