import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'
import { Row } from './Row'

// Modal se controla con `open`; estos demos lo abren con un botón para verlo
// en acción. Son componentes (no render-props) para respetar rules-of-hooks.
function DismissableDemo() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Abrir modal</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Empezar reto"
        footer={
          <Row justify="end" gap={2}>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => setOpen(false)}>Empezar</Button>
          </Row>
        }
      >
        Tienes 2 minutos para adivinar dónde se hizo la foto. Cuando empieces, el cronómetro corre.
      </Modal>
    </>
  )
}

function NotDismissableDemo() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Abrir (bloqueante)</Button>
      <Modal
        open={open}
        title="Esperando al resto"
        footer={<Button onClick={() => setOpen(false)}>Continuar</Button>}
      >
        Este modal solo se cierra desde su propia acción.
      </Modal>
    </>
  )
}

const meta = {
  title: 'UI/Modal',
  component: Modal,
  // El demo controla `open`/`children` por su cuenta; estos args satisfacen el
  // tipo (Modal los exige) pero los render de las stories los ignoran.
  args: { open: false, children: null },
} satisfies Meta<typeof Modal>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => <DismissableDemo />,
}

// Sin onClose: modal no descartable (no Escape, no clic fuera, sin botón cerrar).
export const NotDismissable: Story = {
  render: () => <NotDismissableDemo />,
}
