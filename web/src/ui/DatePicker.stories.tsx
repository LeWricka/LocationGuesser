import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { DatePicker } from './DatePicker'

// Wrapper con estado: el DatePicker es controlado, así que la story guarda el
// valor y lo refleja (uso real de la app).
function Demo({
  initial = null,
  min,
  max,
}: {
  initial?: string | null
  min?: string
  max?: string
}) {
  const [value, setValue] = useState<string | null>(initial)
  return (
    <div style={{ maxWidth: 320, padding: 24 }}>
      <DatePicker value={value} min={min} max={max} onChange={setValue} aria-label="Fecha" />
    </div>
  )
}

const meta = {
  title: 'UI/DatePicker',
  component: Demo,
} satisfies Meta<typeof Demo>

export default meta
type Story = StoryObj<typeof meta>

export const Vacio: Story = {}
export const ConFecha: Story = { args: { initial: '2026-03-15' } }
export const ConRango: Story = {
  args: { initial: '2026-03-10', min: '2026-03-05', max: '2026-03-20' },
}
