import type { Meta, StoryObj } from '@storybook/react-vite'
import { FileButton } from './FileButton'

const meta = {
  title: 'UI/FileButton',
  component: FileButton,
  args: {
    children: '📷 Añadir foto',
    accept: 'image/*',
    ariaLabel: 'Añadir foto',
    onPick: () => {},
  },
  argTypes: {
    variant: { control: 'inline-radio', options: ['primary', 'secondary', 'ghost'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    loading: { control: 'boolean' },
    fullWidth: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
} satisfies Meta<typeof FileButton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Cargando: Story = { args: { loading: true, children: 'Subiendo foto…' } }
export const ConFoto: Story = { args: { children: 'Cambiar foto' } }
export const Deshabilitado: Story = { args: { disabled: true } }
export const AnchoCompleto: Story = { args: { fullWidth: true } }
