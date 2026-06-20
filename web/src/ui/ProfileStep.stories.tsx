import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ProfileStep } from './ProfileStep'

const meta = {
  title: 'Cuentas/ProfileStep',
  component: ProfileStep,
  parameters: { layout: 'fullscreen' },
  args: { displayName: '', onDisplayNameChange: () => {} },
} satisfies Meta<typeof ProfileStep>

export default meta
type Story = StoryObj<typeof meta>

function Demo() {
  const [name, setName] = useState('')
  return <ProfileStep displayName={name} onDisplayNameChange={setName} />
}

export const Default: Story = { render: () => <Demo /> }
export const ConError: Story = {
  args: { displayName: '', onDisplayNameChange: () => {}, error: 'Pon un nombre para jugar.' },
}
