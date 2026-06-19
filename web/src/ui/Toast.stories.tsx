import type { Meta, StoryObj } from '@storybook/react-vite'
import { ToastProvider } from './ToastProvider'
import { useToast } from './toast-context'
import { Button } from './Button'
import { Row } from './Row'

// Demo: los toasts se disparan vía useToast() dentro de un ToastProvider.
function ToastDemo() {
  const toast = useToast()
  return (
    <Row gap={2} wrap>
      <Button onClick={() => toast.show('Enlace copiado')}>Neutral</Button>
      <Button variant="secondary" onClick={() => toast.show('Reto creado', { tone: 'success' })}>
        Éxito
      </Button>
      <Button
        variant="ghost"
        onClick={() => toast.show('No se pudo subir la foto', { tone: 'danger' })}
      >
        Error
      </Button>
      <Button
        variant="ghost"
        onClick={() => toast.show('Aviso persistente (clic en ✕)', { duration: 0 })}
      >
        Persistente
      </Button>
    </Row>
  )
}

const meta = {
  title: 'UI/Toast',
  component: ToastProvider,
  // children lo aporta el decorator/render; este arg satisface el tipo.
  args: { children: null },
  // Todas las stories viven dentro del provider para tener acceso a useToast.
  decorators: [
    (Story) => (
      <ToastProvider>
        <Story />
      </ToastProvider>
    ),
  ],
} satisfies Meta<typeof ToastProvider>

export default meta
type Story = StoryObj<typeof meta>

export const Tones: Story = {
  render: () => <ToastDemo />,
}
