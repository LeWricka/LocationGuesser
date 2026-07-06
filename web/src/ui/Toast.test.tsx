import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import fs from 'node:fs'
import path from 'node:path'
import { ToastProvider } from './ToastProvider'
import { useToast } from './toast-context'

// Botón de prueba que dispara un toast con las opciones que le pasemos.
function Trigger({
  message,
  duration,
  action,
}: {
  message: string
  duration?: number
  action?: { label: string; onClick: () => void }
}) {
  const toast = useToast()
  return (
    <button type="button" onClick={() => toast.show(message, { duration, action })}>
      mostrar
    </button>
  )
}

describe('Toast', () => {
  test('useToast fuera del provider lanza un error explicativo', () => {
    // Silenciamos el error que React imprime al romper el render.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Trigger message="x" />)).toThrow(/ToastProvider/)
    spy.mockRestore()
  })

  test('show pinta el aviso dentro de la región aria-live', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <Trigger message="Guardado" />
      </ToastProvider>,
    )
    expect(screen.queryByText('Guardado')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'mostrar' }))

    const region = screen.getByRole('region', { name: 'Avisos' })
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByText('Guardado')).toBeInTheDocument()
  })

  test('el botón de cerrar descarta el aviso', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <Trigger message="Bórrame" duration={0} />
      </ToastProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'mostrar' }))
    expect(screen.getByText('Bórrame')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cerrar aviso' }))
    expect(screen.queryByText('Bórrame')).not.toBeInTheDocument()
  })

  // Issue #718: el toast de "Recuperado tu borrador" ofrece "Descartar" sin
  // abrir un modal que interrumpa.
  test('la acción del toast se pinta y dispara su callback + descarta el aviso', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <ToastProvider>
        <Trigger message="Recuperado tu borrador" action={{ label: 'Descartar', onClick }} />
      </ToastProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'mostrar' }))
    expect(screen.getByText('Recuperado tu borrador')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(onClick).toHaveBeenCalledOnce()
    expect(screen.queryByText('Recuperado tu borrador')).not.toBeInTheDocument()
  })

  test('sin action no se pinta ningún botón extra (solo cerrar)', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <Trigger message="Aviso simple" />
      </ToastProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'mostrar' }))
    const toast = screen.getByText('Aviso simple').closest('[role="status"]') as HTMLElement
    expect(within(toast).getAllByRole('button')).toHaveLength(1)
  })

  describe('auto-cierre con timers falsos', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    // Con timers falsos usamos fireEvent (síncrono) en vez de userEvent, que
    // espera delays reales y colgaría el test.
    test('el aviso desaparece solo al cumplirse la duración', () => {
      render(
        <ToastProvider>
          <Trigger message="Efímero" duration={3000} />
        </ToastProvider>,
      )
      fireEvent.click(screen.getByRole('button', { name: 'mostrar' }))
      expect(screen.getByText('Efímero')).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(3000)
      })
      expect(screen.queryByText('Efímero')).not.toBeInTheDocument()
    })

    test('duration=0 lo deja persistente (no se auto-cierra)', () => {
      render(
        <ToastProvider>
          <Trigger message="Persistente" duration={0} />
        </ToastProvider>,
      )
      fireEvent.click(screen.getByRole('button', { name: 'mostrar' }))
      act(() => {
        vi.advanceTimersByTime(60_000)
      })
      expect(screen.getByText('Persistente')).toBeInTheDocument()
    })
  })
})

// --- Regresión #552: el toast desbordaba el viewport a la derecha -----------------
//
// Causa raíz REAL: no era el posicionamiento de `.region` (ya usaba insets, no
// `right` sin `left`), sino que `.message` es un ítem flex y por defecto
// `min-width` de un ítem flex es `auto`: eso le IMPIDE encoger por debajo del
// ancho de su propio contenido. Un mensaje sin espacios naturales (una lista de
// nombres de fichero separados por comas, típica de un error de subida) hacía
// que `.message` — y con él `.toast`/`.region`, que no recortan overflow — se
// ensanchara más allá del borde derecho del viewport, lo que en un navegador
// móvil real se traduce en scroll/zoom horizontal ("se amplía la pantalla").
//
// jsdom no calcula layout real (no hay `scrollWidth`/`getBoundingClientRect`
// fiables aquí — la reproducción visual con scrollWidth se hizo aparte con
// Playwright), así que este test monta la hoja de estilos REAL de
// `Toast.module.css` en jsdom (cuyo motor de selectores sí resuelve la cascada)
// y comprueba, vía `getComputedStyle`, las propiedades que evitan el
// desbordamiento: `.region` con `left`/`right` fijados (no `auto`) y un
// `max-width` acotado al viewport, y `.message` con `min-width: 0` +
// `overflow-wrap: anywhere`. Sin el fix, `min-width` de `.message` vuelve a
// ser `auto` y `overflow-wrap` a `normal`.
describe('Toast — el toast no desborda el viewport (#552)', () => {
  function loadRealStylesheet(): void {
    const css = fs.readFileSync(path.resolve(__dirname, './Toast.module.css'), 'utf8')
    const style = document.createElement('style')
    // Variables mínimas que usan las declaraciones bajo prueba (el resto de
    // tokens no afectan a las propiedades que comprobamos).
    style.textContent = `:root { --space-4: 1rem; --z-toast: 1100; } ${css}`
    document.head.appendChild(style)
  }

  test('.region fija left/right (insets seguros) y acota max-width al viewport', () => {
    loadRealStylesheet()
    const region = document.createElement('div')
    region.className = 'region'
    document.body.appendChild(region)

    const cs = getComputedStyle(region)
    expect(cs.left).not.toBe('auto')
    expect(cs.right).not.toBe('auto')
    // La región nunca debe depender de un ancho fijo en px: tiene que ceder ante
    // el viewport (100vw) para no poder sobresalir en pantallas estrechas.
    expect(cs.maxWidth).toContain('100vw')
  })

  test('.message permite encoger (min-width: 0) y rompe cadenas largas (overflow-wrap: anywhere)', () => {
    loadRealStylesheet()
    const message = document.createElement('span')
    message.className = 'message'
    document.body.appendChild(message)

    const cs = getComputedStyle(message)
    expect(cs.minWidth).toBe('0')
    expect(cs.overflowWrap).toBe('anywhere')
  })
})
