import type { Meta, StoryObj } from '@storybook/react-vite'
import { Input } from './Input'

const meta = {
  title: 'UI/Input',
  component: Input,
  args: { placeholder: 'Pega el enlace de Google Maps' },
  argTypes: {
    invalid: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
} satisfies Meta<typeof Input>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const WithValue: Story = { args: { defaultValue: 'Plaza Mayor, Madrid' } }
export const Invalid: Story = { args: { invalid: true, defaultValue: 'no es un enlace' } }
export const Disabled: Story = { args: { disabled: true, defaultValue: 'Bloqueado' } }
