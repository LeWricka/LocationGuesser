import { act, useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { OverlayBackProvider } from './OverlayBackProvider'
import { useOverlayLayer } from './overlayBack'

// Coordinador global (issue #972): valida el anidamiento REAL de capas (una
// capa sobre otra desde componentes distintos) contra el `popstate` del
// navegador — que aquí simulamos igual que en `useOverlayBack.test.ts`.

beforeEach(() => {
  window.history.replaceState(null, '', window.location.href)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Capa mínima autocontenida: un botón para abrir y, si está abierta, se declara
// al coordinador y muestra su propio botón de cerrar (el "✕"/scrim).
function Layer({ name }: { name: string }) {
  const [open, setOpen] = useState(false)
  useOverlayLayer(open, () => setOpen(false))
  return (
    <div>
      <button onClick={() => setOpen(true)}>abrir {name}</button>
      {open && (
        <div role="dialog" aria-label={name}>
          <button onClick={() => setOpen(false)}>cerrar {name}</button>
        </div>
      )}
    </div>
  )
}

function back() {
  act(() => {
    window.history.back()
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
}

describe('OverlayBackProvider + useOverlayLayer', () => {
  test('el atrás cierra dos capas anidadas de arriba a abajo, capa a capa', async () => {
    const user = userEvent.setup()
    render(
      <OverlayBackProvider>
        <Layer name="hoja" />
        <Layer name="lightbox" />
      </OverlayBackProvider>,
    )

    // Abrimos la hoja y, encima, el lightbox (dos capas apiladas).
    await user.click(screen.getByText('abrir hoja'))
    await user.click(screen.getByText('abrir lightbox'))
    expect(screen.getByRole('dialog', { name: 'hoja' })).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'lightbox' })).toBeInTheDocument()

    // 1er atrás → cierra la de encima (lightbox); la hoja SIGUE abierta.
    back()
    expect(screen.queryByRole('dialog', { name: 'lightbox' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'hoja' })).toBeInTheDocument()

    // 2º atrás → cierra la hoja.
    back()
    expect(screen.queryByRole('dialog', { name: 'hoja' })).not.toBeInTheDocument()
  })

  test('cerrar la capa de encima por UI no roba el atrás de la de abajo', async () => {
    const user = userEvent.setup()
    render(
      <OverlayBackProvider>
        <Layer name="hoja" />
        <Layer name="lightbox" />
      </OverlayBackProvider>,
    )

    await user.click(screen.getByText('abrir hoja'))
    await user.click(screen.getByText('abrir lightbox'))

    // El usuario cierra el lightbox con su ✕ (no con atrás).
    await user.click(screen.getByText('cerrar lightbox'))
    expect(screen.queryByRole('dialog', { name: 'lightbox' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'hoja' })).toBeInTheDocument()

    // Un solo atrás cierra la hoja que queda (el cierre por UI no dejó una
    // entrada colgada que se "comiera" este atrás).
    back()
    expect(screen.queryByRole('dialog', { name: 'hoja' })).not.toBeInTheDocument()
  })

  test('sin proveedor, useOverlayLayer es inocuo (no revienta)', async () => {
    const user = userEvent.setup()
    render(<Layer name="suelta" />)
    await user.click(screen.getByText('abrir suelta'))
    expect(screen.getByRole('dialog', { name: 'suelta' })).toBeInTheDocument()
    await user.click(screen.getByText('cerrar suelta'))
    expect(screen.queryByRole('dialog', { name: 'suelta' })).not.toBeInTheDocument()
  })
})
