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
})
