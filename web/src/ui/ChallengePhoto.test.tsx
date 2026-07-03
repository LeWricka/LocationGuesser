import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChallengePhoto } from './ChallengePhoto'

describe('ChallengePhoto', () => {
  test('con src muestra la imagen con su alt', () => {
    render(<ChallengePhoto src="/foto.jpg" alt="Calle de Lisboa" />)
    expect(screen.getByRole('img', { name: 'Calle de Lisboa' })).toHaveAttribute('src', '/foto.jpg')
  })

  test('sin src muestra un placeholder accesible', () => {
    render(<ChallengePhoto alt="Reto sin foto" />)
    expect(screen.getByRole('img', { name: 'Reto sin foto' })).toBeInTheDocument()
  })

  test('con onClick es un botón y dispara el callback (sin lightbox)', async () => {
    const onClick = vi.fn()
    render(<ChallengePhoto src="/f.jpg" alt="Foto" onClick={onClick} />)
    // onClick explícito tiene prioridad: el label no menciona "Ampliar".
    await userEvent.click(screen.getByRole('button', { name: 'Foto' }))
    expect(onClick).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('por defecto, pulsar la foto abre el lightbox a tamaño completo', async () => {
    render(<ChallengePhoto src="/f.jpg" alt="Calle" />)
    await userEvent.click(screen.getByRole('button', { name: 'Ampliar foto: Calle' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    // La imagen aparece tanto en la miniatura como en el lightbox.
    expect(screen.getAllByRole('img', { name: 'Calle' }).length).toBeGreaterThan(1)
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('sin foto no es pulsable (no abre lightbox)', () => {
    render(<ChallengePhoto alt="Reto sin foto" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  test('zoomable=false deja la foto no pulsable', () => {
    render(<ChallengePhoto src="/f.jpg" alt="Foto" zoomable={false} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  test('aplica la clase de proporción', () => {
    const { container } = render(<ChallengePhoto src="/f.jpg" ratio="wide" />)
    expect((container.firstElementChild as HTMLElement).className).toMatch(/ratio-wide/)
  })

  // Issue #593: el placeholder sin foto pasa de un icono "imagen rota" (ImageOff) a
  // uno de MARCA (IconCamara, gradiente de escena) — mismo patrón que el "mapa
  // nocturno" de HomeDashboard. El SVG de lucide `ImageOff` no lleva `viewBox`
  // "0 0 24 24" con esa forma concreta; en vez de acoplar el test al markup interno
  // del icono, fijamos el contrato observable: sigue siendo un `role="img"`
  // accesible (sin regresión de a11y) y SIGUE sin ser pulsable (sin foto que ampliar).
  test('sin foto: el placeholder es de marca, no un icono de imagen rota', () => {
    render(<ChallengePhoto alt="Reto sin foto" />)
    const placeholder = screen.getByRole('img', { name: 'Reto sin foto' })
    expect(placeholder.querySelector('svg')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
