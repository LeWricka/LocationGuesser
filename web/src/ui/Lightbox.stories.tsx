import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Lightbox } from './Lightbox'
import { Button } from './Button'

const SAMPLE =
  'https://images.unsplash.com/photo-1513735492246-483525079686?w=1600&q=80&auto=format'

const meta = {
  title: 'Cuentas/Lightbox',
  component: Lightbox,
  // args base (la historia los ignora porque controla el estado con un botón).
  args: { open: false, src: SAMPLE, alt: 'Paisaje del reto', onClose: () => {} },
} satisfies Meta<typeof Lightbox>

export default meta
type Story = StoryObj<typeof meta>

// El lightbox se controla con estado; la historia lo abre con un botón.
export const Default: Story = {
  render: () => {
    function Demo() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <Button onClick={() => setOpen(true)}>Ver foto grande</Button>
          <Lightbox
            open={open}
            src={SAMPLE}
            alt="Paisaje del reto"
            onClose={() => setOpen(false)}
          />
        </>
      )
    }
    return <Demo />
  },
}
