import type { Meta, StoryObj } from '@storybook/react-vite'
import { Field } from './Field'
import { Input } from './Input'

const meta = {
  title: 'UI/Field',
  component: Field,
  args: { label: 'Tu nombre' },
} satisfies Meta<typeof Field>

export default meta
type Story = StoryObj<typeof meta>

// Field es render-prop: inyecta id/aria-* al control hijo.
export const Default: Story = {
  args: {
    label: 'Tu nombre',
    children: (p) => <Input {...p} placeholder="p. ej. Iker" />,
  },
}

export const WithHint: Story = {
  args: {
    label: 'Enlace de Google Maps',
    hint: 'Pega el enlace de la ubicación exacta; quitamos los metadatos de la foto.',
    children: (p) => <Input {...p} placeholder="https://maps.app.goo.gl/…" />,
  },
}

export const WithError: Story = {
  args: {
    label: 'Tu nombre',
    error: 'Ese nombre ya está cogido en el grupo.',
    children: (p) => <Input {...p} defaultValue="Iker" />,
  },
}

export const HiddenLabel: Story = {
  args: {
    label: 'Buscar lugar',
    hideLabel: true,
    children: (p) => <Input {...p} placeholder="Buscar lugar…" />,
  },
}
