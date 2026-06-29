import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { EnterCode } from './EnterCode'

const meta = {
  title: 'Cuentas/EnterCode',
  component: EnterCode,
  parameters: { layout: 'fullscreen' },
  args: {
    email: 'lewis@ejemplo.com',
    code: '',
    onCodeChange: () => {},
    onResend: () => {},
    onChangeEmail: () => {},
  },
} satisfies Meta<typeof EnterCode>

export default meta
type Story = StoryObj<typeof meta>

// Wrapper con estado para que el input del código sea editable en Storybook.
function Demo() {
  const [code, setCode] = useState('')
  return (
    <EnterCode
      email="lewis@ejemplo.com"
      code={code}
      onCodeChange={setCode}
      onResend={() => {}}
      onChangeEmail={() => {}}
    />
  )
}

export const Default: Story = { render: () => <Demo /> }
export const Verificando: Story = { args: { code: '123456', verifying: true } }
export const Reenviando: Story = { args: { resending: true } }
export const ConError: Story = {
  args: { code: '0000', error: 'Código incorrecto o caducado. Revísalo o reenvía uno nuevo.' },
}
