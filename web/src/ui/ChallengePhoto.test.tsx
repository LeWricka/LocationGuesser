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

  test('con onClick es un botón y dispara el callback', async () => {
    const onClick = vi.fn()
    render(<ChallengePhoto src="/f.jpg" alt="Foto" onClick={onClick} />)
    await userEvent.click(screen.getByRole('button', { name: 'Foto' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  test('aplica la clase de proporción', () => {
    const { container } = render(<ChallengePhoto src="/f.jpg" ratio="wide" />)
    expect((container.firstElementChild as HTMLElement).className).toMatch(/ratio-wide/)
  })
})
