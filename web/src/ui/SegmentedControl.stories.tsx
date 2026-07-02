import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { SegmentedControl } from './SegmentedControl'

// El componente es genérico y controlado; cada historia usa `render` con su
// propio estado. `args` aquí solo satisface los props requeridos del meta (las
// historias los sustituyen por completo en su render).
const meta = {
  title: 'UI/SegmentedControl',
  component: SegmentedControl,
  args: {
    label: 'Ejemplo',
    options: [{ value: 'a', label: 'A' }],
    value: 'a',
    onChange: () => {},
  },
} satisfies Meta<typeof SegmentedControl>

export default meta
type Story = StoryObj<typeof meta>

// El control es controlado: cada historia mantiene su propio estado local para
// poder deslizar el thumb entre opciones en la galería.
function DiaryMarker() {
  const [value, setValue] = useState<'diario' | 'marcador'>('diario')
  return (
    <SegmentedControl
      label="Sección del viaje"
      options={[
        { value: 'diario', label: 'Diario' },
        { value: 'marcador', label: 'Marcador' },
      ]}
      value={value}
      onChange={setValue}
    />
  )
}

function ThreeOptions() {
  const [value, setValue] = useState<'1h' | '4h' | 'hoy'>('4h')
  return (
    <SegmentedControl
      label="Plazo para jugar"
      options={[
        { value: '1h', label: '1h' },
        { value: '4h', label: '4h' },
        { value: 'hoy', label: 'Hoy' },
      ]}
      value={value}
      onChange={setValue}
    />
  )
}

function Auto() {
  const [value, setValue] = useState<'a' | 'b'>('a')
  return (
    <div style={{ display: 'flex' }}>
      <SegmentedControl
        label="Compacto"
        fullWidth={false}
        options={[
          { value: 'a', label: 'Sorpresa' },
          { value: 'b', label: 'Pista' },
        ]}
        value={value}
        onChange={setValue}
      />
    </div>
  )
}

// Dos opciones a ancho completo (el caso "Diario | Marcador" de la vista viaje).
export const DiarioMarcador: Story = { render: () => <DiaryMarker /> }
// Tres opciones (ajustes de reto: plazo, tiempo por jugada, estrictez).
export const TresOpciones: Story = { render: () => <ThreeOptions /> }
// Ancho automático (no fullWidth): la pastilla se ciñe a su contenido.
export const AnchoAuto: Story = { render: () => <Auto /> }
