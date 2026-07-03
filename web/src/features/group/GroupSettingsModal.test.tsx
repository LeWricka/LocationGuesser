import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

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

import { GroupSettingsModal } from './GroupSettingsModal'
import { ToastProvider } from '../../ui'

// jsdom no implementa scrollIntoView; el modal lo usa para llevar al dueño a la
// sección "Temporada" cuando 'season' aterriza en un viaje ya cerrado (sin paso
// de confirmación intermedio que renderizar directamente).
Element.prototype.scrollIntoView = vi.fn()

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

  // La gestión de gente se movió a MembersModal (#616): Ajustes ya no lista
  // miembros ni ofrece "Hacer co-dueño" (un solo sitio canónico: menú ⋯ → Miembros).
  test('Ajustes ya no tiene sección de miembros ni "Hacer co-dueño"', () => {
    renderModal()
    expect(screen.queryByText('Miembros')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Hacer co-dueño/ })).not.toBeInTheDocument()
  })
})
