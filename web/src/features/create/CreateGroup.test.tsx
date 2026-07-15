import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '@supabase/supabase-js'

const trackMock = vi.fn()
vi.mock('../../lib/analytics', () => ({ track: (...args: unknown[]) => trackMock(...args) }))

const createGroupMock = vi.fn()
vi.mock('../../lib/groupData', () => ({
  createGroup: (...args: unknown[]) => createGroupMock(...args),
}))

const joinGroupAsOwnerMock = vi.fn()
vi.mock('../../lib/membership', () => ({
  joinGroupAsOwner: (...args: unknown[]) => joinGroupAsOwnerMock(...args),
}))

// jsdom no implementa scrollIntoView; el desplegable "Añadir una descripción"
// lo usa para traer el campo a la vista tras expandirse (issue: el dueño
// reportó que no veía nada al pulsar, tenía que buscar el campo con scroll
// manual — ver el efecto en CreateGroup.tsx).
const scrollIntoViewMock = vi.fn()
Element.prototype.scrollIntoView = scrollIntoViewMock

import { CreateGroup } from './CreateGroup'
import { SessionContext, type SessionState } from '../../lib/session-context'
import { ToastProvider } from '../../ui'
import { loadDraft } from '../../lib/drafts'

const session: SessionState = {
  session: null,
  user: { id: 'u-me' } as User,
  profile: { display_name: 'Iker' } as SessionState['profile'],
  loading: false,
  verified: true,
  isAnonymous: false,
  refreshProfile: async () => {},
}

function renderCreate() {
  const onBack = vi.fn()
  return {
    onBack,
    ...render(
      <SessionContext.Provider value={session}>
        <ToastProvider>
          <CreateGroup onBack={onBack} />
        </ToastProvider>
      </SessionContext.Provider>,
    ),
  }
}

const DRAFT_KEY = 'group:new'

describe('CreateGroup — borrador persistente (#718)', () => {
  beforeEach(async () => {
    trackMock.mockClear()
    createGroupMock.mockReset()
    joinGroupAsOwnerMock.mockReset()
    scrollIntoViewMock.mockClear()
    // Un solo "Nuevo viaje" a la vez (clave fija): limpiamos entre tests para
    // que no se contaminen entre sí.
    const { clearDraft } = await import('../../lib/drafts')
    await clearDraft(DRAFT_KEY)
  })

  test('escribir el nombre, desmontar y volver a montar restaura el borrador con toast', async () => {
    const { unmount } = renderCreate()

    await userEvent.type(screen.getByLabelText('Nombre del viaje'), 'Japón en otoño')
    await userEvent.type(screen.getByLabelText('¿Con quién vas? · opcional'), 'Marta y Diego')

    await waitFor(async () => expect(await loadDraft(DRAFT_KEY)).not.toBeNull(), { timeout: 2000 })
    unmount()

    renderCreate()
    // La restauración es async (loadDraft): espera al toast, que solo aparece
    // tras aplicarla, antes de comprobar los valores de los campos.
    await screen.findByText(/recuperado tu borrador/i)
    expect(screen.getByLabelText('Nombre del viaje')).toHaveValue('Japón en otoño')
    expect(screen.getByLabelText('¿Con quién vas? · opcional')).toHaveValue('Marta y Diego')
    expect(trackMock).not.toHaveBeenCalledWith('group_created', expect.anything())
  })

  test('"Descartar" en el toast borra el draft y limpia el formulario', async () => {
    const { unmount } = renderCreate()
    await userEvent.type(screen.getByLabelText('Nombre del viaje'), 'Borrador a descartar')
    await waitFor(async () => expect(await loadDraft(DRAFT_KEY)).not.toBeNull(), { timeout: 2000 })
    unmount()

    const second = renderCreate()
    await screen.findByText(/recuperado tu borrador/i)
    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }))

    expect(screen.getByLabelText('Nombre del viaje')).toHaveValue('')
    expect(await loadDraft(DRAFT_KEY)).toBeNull()
    // Desmonta explícitamente: "Descartar" vació el snapshot y volvió a armar
    // el temporizador del autosave (ahora sobre un draft vacío) — sin
    // desmontar aquí, ese temporizador seguiría vivo y podría disparar en el
    // test siguiente (real timers, no falsos).
    second.unmount()
  })

  test('crear el viaje con éxito limpia el borrador', async () => {
    createGroupMock.mockResolvedValue(undefined)
    joinGroupAsOwnerMock.mockResolvedValue(undefined)
    const { unmount } = renderCreate()

    await userEvent.type(screen.getByLabelText('Nombre del viaje'), 'Japón en otoño')
    await userEvent.click(screen.getByRole('button', { name: /revisar y crear/i }))
    await userEvent.click(screen.getByRole('button', { name: /^crear viaje$/i }))

    await waitFor(() => expect(createGroupMock).toHaveBeenCalledTimes(1))
    expect(await loadDraft(DRAFT_KEY)).toBeNull()
    unmount()
  })

  test('un formulario en blanco no se guarda ni se restaura (nada que perder)', async () => {
    const { unmount } = renderCreate()
    // Espera más que el debounce sin escribir nada. `act()` envuelve el
    // temporizador REAL para que el `setRestored` async de esta instancia
    // no dispare el aviso de "setState fuera de act".
    await act(() => new Promise((r) => setTimeout(r, 900)))
    unmount()

    const { unmount: unmountSecond } = renderCreate()
    // Deja que el intento de restauración (async) termine antes de comprobar
    // que no hizo nada.
    await act(() => new Promise((r) => setTimeout(r, 50)))
    expect(screen.queryByText(/recuperado tu borrador/i)).not.toBeInTheDocument()
    unmountSecond()
  })

  test('al desplegar "Añadir una descripción" el campo se lleva a la vista (antes había que buscarlo con scroll manual)', async () => {
    const { unmount } = renderCreate()

    await userEvent.click(screen.getByRole('button', { name: 'Añadir una descripción' }))
    expect(screen.getByLabelText('Descripción · opcional')).toBeInTheDocument()

    await waitFor(() => expect(scrollIntoViewMock).toHaveBeenCalledTimes(1), { timeout: 2000 })
    unmount()
  })
})
