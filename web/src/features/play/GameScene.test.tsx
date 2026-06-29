import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GameScene, type GameSceneData } from './GameScene'

// PlayMap monta Google Maps (@vis.gl/react-google-maps), que necesita el SDK y un
// APIProvider. En estos tests solo nos importa el LAYOUT de la escena (mini-mapa
// expansible, controles, iconos), así que lo sustituimos por un stub inerte.
vi.mock('./PlayMap', () => ({
  PlayMap: () => <div data-testid="play-map" />,
}))

const photoScene: GameSceneData = { kind: 'photo', photoUrl: 'blob:foto' }

// Props mínimas reutilizables; cada test sobrescribe lo que necesita.
function baseProps(overrides: Partial<Parameters<typeof GameScene>[0]> = {}) {
  return {
    title: 'Reto de prueba',
    scene: photoScene,
    sceneReady: true,
    remaining: null,
    guessSeconds: null,
    backLabel: 'Inicio',
    onBack: vi.fn(),
    guess: null,
    onGuess: vi.fn(),
    mapOpen: false,
    onOpenMap: vi.fn(),
    onCloseMap: vi.fn(),
    meUserId: 'u1',
    onConfirm: vi.fn(),
    photoExpanded: false,
    onExpandPhoto: vi.fn(),
    onClosePhoto: vi.fn(),
    ...overrides,
  }
}

describe('GameScene — mini-mapa expansible', () => {
  test('en mini muestra el teaser para adivinar y NO el pie de confirmar', () => {
    render(<GameScene {...baseProps({ mapOpen: false })} />)
    // El mini-mapa es la única affordance para adivinar (sin FAB que se solape).
    expect(screen.getByRole('button', { name: 'Abrir el mapa para adivinar' })).toBeTruthy()
    // El pie con "Confirmar y revelar" solo existe al expandir.
    expect(screen.queryByRole('button', { name: /Confirmar y revelar/ })).toBeNull()
  })

  test('tocar el mini-mapa lo expande (llama onOpenMap)', () => {
    const onOpenMap = vi.fn()
    render(<GameScene {...baseProps({ mapOpen: false, onOpenMap })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir el mapa para adivinar' }))
    expect(onOpenMap).toHaveBeenCalledOnce()
  })

  test('el teaser cambia a "Ajustar pin" cuando ya hay un pin', () => {
    render(<GameScene {...baseProps({ guess: { lat: 40, lng: -3 } })} />)
    expect(screen.getByText('Ajustar pin')).toBeTruthy()
  })

  test('expandido muestra cabecera, confirmar y volver; sin teaser', () => {
    render(<GameScene {...baseProps({ mapOpen: true, guess: { lat: 40, lng: -3 } })} />)
    expect(screen.getByText('¿Dónde es?')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Confirmar y revelar/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cerrar el mapa' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Abrir el mapa para adivinar' })).toBeNull()
  })

  test('confirmar deshabilitado sin pin; habilitado con pin', () => {
    const { rerender } = render(<GameScene {...baseProps({ mapOpen: true, guess: null })} />)
    expect(screen.getByRole('button', { name: /Confirmar y revelar/ })).toHaveProperty(
      'disabled',
      true,
    )
    rerender(<GameScene {...baseProps({ mapOpen: true, guess: { lat: 1, lng: 2 } })} />)
    expect(screen.getByRole('button', { name: /Confirmar y revelar/ })).toHaveProperty(
      'disabled',
      false,
    )
  })
})
