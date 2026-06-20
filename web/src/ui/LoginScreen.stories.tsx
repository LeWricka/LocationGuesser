import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { LoginScreen } from './LoginScreen'

const meta = {
  title: 'Cuentas/LoginScreen',
  component: LoginScreen,
  parameters: { layout: 'fullscreen' },
  args: { email: '', onEmailChange: () => {} },
} satisfies Meta<typeof LoginScreen>

export default meta
type Story = StoryObj<typeof meta>

// Wrapper con estado para que el input sea editable en Storybook.
function Demo({ groupName }: { groupName?: string }) {
  const [email, setEmail] = useState('')
  return <LoginScreen email={email} onEmailChange={setEmail} groupName={groupName} />
}

export const Generico: Story = { render: () => <Demo /> }
export const ConGrupo: Story = { render: () => <Demo groupName="Finde Lisboa" /> }
export const Cargando: Story = {
  args: { email: 'lewis@ejemplo.com', onEmailChange: () => {}, loading: true },
}
export const ConError: Story = {
  args: { email: 'x', onEmailChange: () => {}, error: 'Ese correo no parece válido.' },
}
