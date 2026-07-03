import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Profile } from '../../lib/database.types'

// Issue #596: ProfileEditScreen migró de AuthScreen (tarjeta centrada) a
// ShellUtilitario + AppHeader (patrón CreateGroup post-#494). Este test cubre el
// MARKUP resultante: atrás en la cabecera, Guardar como CTA de footer y "Cerrar
// sesión" como acción secundaria separada al pie (no pegada al atrás). La lógica
// de guardado/avatar no cambia, así que se aíslan sus dependencias con mocks.
const trackMock = vi.fn()
vi.mock('../../lib/analytics', () => ({ track: (...args: unknown[]) => trackMock(...args) }))

// vi.fn() SIN implementación inicial (tipo `any[]`): con una implementación
// tipada TS infiere una aridad fija y el `...args` variádico de abajo deja de
// encajar (TS2556). El valor de retorno se fija en `beforeEach`.
const upsertProfileMock = vi.fn()
vi.mock('../../lib/profile', () => ({
  upsertProfile: (...args: unknown[]) => upsertProfileMock(...args),
}))

const signOutMock = vi.fn()
vi.mock('../../lib/auth', () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
}))

const uploadAvatarMock = vi.fn()
vi.mock('../../lib/storage', () => ({
  uploadAvatar: (...args: unknown[]) => uploadAvatarMock(...args),
}))

import { ProfileEditScreen } from './ProfileEditScreen'
import { ToastProvider } from '../../ui'

const profile = { display_name: 'Iker', avatar_url: null } as Profile

function renderScreen(props: Partial<Parameters<typeof ProfileEditScreen>[0]> = {}) {
  const onSaved = vi.fn()
  const onBack = vi.fn()
  render(
    <ToastProvider>
      <ProfileEditScreen
        userId="u-me"
        profile={profile}
        onSaved={onSaved}
        onBack={onBack}
        {...props}
      />
    </ToastProvider>,
  )
  return { onSaved, onBack }
}

beforeEach(() => {
  trackMock.mockClear()
  upsertProfileMock.mockReset().mockResolvedValue({})
  signOutMock.mockReset().mockResolvedValue(undefined)
  uploadAvatarMock.mockReset().mockResolvedValue('https://example.com/avatar.png')
})

describe('ProfileEditScreen — markup ShellUtilitario + AppHeader (#596)', () => {
  test('el "atrás" vive en la cabecera (AppHeader), no en el footer', async () => {
    const { onBack } = renderScreen()
    const back = screen.getByRole('button', { name: 'Volver' })
    await userEvent.setup().click(back)
    expect(onBack).toHaveBeenCalled()
  })

  test('el título "Tu perfil" aparece una sola vez, en la cabecera', () => {
    renderScreen()
    expect(screen.getAllByText('Tu perfil')).toHaveLength(1)
  })

  test('"Cerrar sesión" es una acción separada, distinta del CTA "Guardar"', () => {
    renderScreen()
    const save = screen.getByRole('button', { name: /Guardar/ })
    const signOut = screen.getByRole('button', { name: 'Cerrar sesión' })
    expect(save).toBeInTheDocument()
    expect(signOut).toBeInTheDocument()
    expect(save).not.toBe(signOut)
  })

  test('"Cerrar sesión" invoca signOut', async () => {
    renderScreen()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(signOutMock).toHaveBeenCalled()
  })

  test('sin onOpenAdmin no se muestra "Vista de administración"', () => {
    renderScreen()
    expect(screen.queryByText('Vista de administración')).not.toBeInTheDocument()
  })

  test('con onOpenAdmin se muestra y la dispara al pulsar', async () => {
    const onOpenAdmin = vi.fn()
    renderScreen({ onOpenAdmin })
    await userEvent.setup().click(screen.getByRole('button', { name: /Vista de administración/ }))
    expect(onOpenAdmin).toHaveBeenCalled()
  })

  test('el campo "Tu nombre" usa Field/Input del sistema y guarda el perfil', async () => {
    renderScreen()
    const input = screen.getByLabelText('Tu nombre')
    const user = userEvent.setup()
    await user.clear(input)
    await user.type(input, 'Nuevo nombre')
    await user.click(screen.getByRole('button', { name: /Guardar/ }))
    expect(upsertProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u-me', displayName: 'Nuevo nombre' }),
    )
  })
})
