import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mocks de la capa de datos (lib/groupData) y analítica: el modal solo orquesta
// estas funciones + UI kit; aislamos la BD real. Los datos del viaje resuelven
// vacíos (el foco de este test es QUÉ sección se muestra al abrir, no el
// contenido cargado).
vi.mock('../../lib/groupData', () => ({
  getGroup: vi.fn(async () => null),
  listTripPhotos: vi.fn(async () => []),
  closeGroup: vi.fn(async () => {}),
  reopenGroup: vi.fn(async () => {}),
  deleteGroup: vi.fn(async () => {}),
  updateGroupName: vi.fn(async () => {}),
  updateGroupTripData: vi.fn(async () => {}),
  updateGroupCover: vi.fn(async () => {}),
}))
vi.mock('../../lib/analytics', () => ({ track: vi.fn() }))

// vi.fn() SIN implementación inicial (tipo `any[]`): con una implementación
// tipada (p.ej. `async () => []`) TS infiere una aridad fija y el `...args`
// variádico de abajo deja de encajar (TS2556). Los valores de retorno se fijan
// en `beforeEach`/cada test con `mockResolvedValue`.
const getGroupMembers = vi.fn()
const setMemberRole = vi.fn()
vi.mock('../../lib/membership', () => ({
  getGroupMembers: (...args: unknown[]) => getGroupMembers(...args),
  setMemberRole: (...args: unknown[]) => setMemberRole(...args),
}))

import { GroupSettingsModal } from './GroupSettingsModal'
import { ToastProvider } from '../../ui'

// jsdom no implementa scrollIntoView; el modal lo usa para llevar al dueño a la
// sección "Temporada" cuando 'season' aterriza en un viaje ya cerrado (sin paso
// de confirmación intermedio que renderizar directamente).
Element.prototype.scrollIntoView = vi.fn()

beforeEach(() => {
  getGroupMembers.mockReset().mockResolvedValue([])
  setMemberRole.mockReset().mockResolvedValue(undefined)
})

function renderModal(props: Partial<Parameters<typeof GroupSettingsModal>[0]> = {}) {
  return render(
    <ToastProvider>
      <GroupSettingsModal
        groupId="g1"
        currentName="Japón 2026"
        isClosed={false}
        onClose={vi.fn()}
        onRenamed={vi.fn()}
        onSeasonChanged={vi.fn()}
        onDeleted={vi.fn()}
        {...props}
      />
    </ToastProvider>,
  )
}

// El menú "···" del viaje pasaba SIEMPRE 'settings' sin importar qué se pulsara,
// así que "Borrar viaje" aterrizaba en el formulario genérico en vez de en la
// confirmación (issue #510). Con `initialSection` cada entrada abre YA su sección.
describe('GroupSettingsModal — initialSection', () => {
  test("por defecto ('settings') muestra el formulario general", () => {
    renderModal()
    expect(screen.getByLabelText('Nombre del viaje')).toBeInTheDocument()
    expect(screen.queryByText(/Escribe «.*» para confirmar/)).not.toBeInTheDocument()
  })

  test("'danger' aterriza directo en la confirmación de borrado", () => {
    renderModal({ initialSection: 'danger' })
    expect(screen.getByText(/Escribe «Japón 2026» para confirmar/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Nombre del viaje')).not.toBeInTheDocument()
  })

  test("'season' con el viaje abierto aterriza directo en cerrar temporada", () => {
    renderModal({ initialSection: 'season', isClosed: false })
    expect(screen.getByText(/Al cerrar la temporada el viaje queda/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Nombre del viaje')).not.toBeInTheDocument()
  })

  test("'season' con el viaje ya cerrado muestra el formulario (reabrir no tiene confirmación)", () => {
    renderModal({ initialSection: 'season', isClosed: true })
    // Reabrir actúa directo (sin paso de confirmación intermedio): el formulario
    // general es lo que se muestra, con el botón de reabrir dentro.
    expect(screen.getByLabelText('Nombre del viaje')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reabrir temporada/ })).toBeInTheDocument()
  })
})

// Issue #596: la lista de "Miembros" de Ajustes deja al dueño promover a un
// miembro a co-dueño. Quien abre este modal ya es dueño/co-dueño (el menú "···"
// solo ofrece "Ajustes" a `canCreate`), así que la acción se ve para cualquier
// miembro que aún no sea dueño.
describe('GroupSettingsModal — miembros y co-dueños', () => {
  test('lista los miembros con corona para el dueño', async () => {
    getGroupMembers.mockResolvedValue([
      { userId: 'u-owner', name: 'Amaia', role: 'owner', isOwner: true, isCreator: true },
      { userId: 'u-member', name: 'Diego', role: 'member', isOwner: false, isCreator: false },
    ])
    renderModal()
    expect(await screen.findByText('Amaia')).toBeInTheDocument()
    expect(screen.getByText('Diego')).toBeInTheDocument()
    expect(screen.getByText('Dueño')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Hacer co-dueño/ })).toBeInTheDocument()
  })

  test('"Hacer co-dueño" pide confirmación y actualiza el ROL vía UPDATE (no INSERT)', async () => {
    getGroupMembers.mockResolvedValue([
      { userId: 'u-member', name: 'Diego', role: 'member', isOwner: false, isCreator: false },
    ])
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    renderModal()

    const promoteBtn = await screen.findByRole('button', { name: /Hacer co-dueño/ })
    await user.click(promoteBtn)

    expect(window.confirm).toHaveBeenCalled()
    await waitFor(() => expect(setMemberRole).toHaveBeenCalledWith('g1', 'u-member', 'owner'))
    // Tras promover, el miembro pasa a mostrarse con la corona de dueño.
    expect(await screen.findByText('Dueño')).toBeInTheDocument()
  })

  test('cancelar la confirmación no llama a setMemberRole', async () => {
    getGroupMembers.mockResolvedValue([
      { userId: 'u-member', name: 'Diego', role: 'member', isOwner: false, isCreator: false },
    ])
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const user = userEvent.setup()
    renderModal()

    const promoteBtn = await screen.findByRole('button', { name: /Hacer co-dueño/ })
    await user.click(promoteBtn)

    expect(setMemberRole).not.toHaveBeenCalled()
  })
})
