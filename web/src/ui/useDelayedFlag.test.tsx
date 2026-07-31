import { describe, test, expect, vi, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { useDelayedFlag, SKELETON_DELAY_MS } from './useDelayedFlag'

afterEach(() => {
  vi.useRealTimers()
})

function Probe({ ms }: { ms?: number }) {
  const show = useDelayedFlag(ms)
  return <span>{show ? 'true' : 'false'}</span>
}

describe('useDelayedFlag', () => {
  test('empieza en false y pasa a true tras `ms`', () => {
    vi.useFakeTimers()
    render(<Probe ms={100} />)
    expect(screen.getByText('false')).toBeInTheDocument()

    act(() => void vi.advanceTimersByTime(99))
    expect(screen.getByText('false')).toBeInTheDocument()

    act(() => void vi.advanceTimersByTime(1))
    expect(screen.getByText('true')).toBeInTheDocument()
  })

  test('usa SKELETON_DELAY_MS (250) si no se pasa `ms`', () => {
    vi.useFakeTimers()
    render(<Probe />)
    act(() => void vi.advanceTimersByTime(SKELETON_DELAY_MS - 1))
    expect(screen.getByText('false')).toBeInTheDocument()
    act(() => void vi.advanceTimersByTime(1))
    expect(screen.getByText('true')).toBeInTheDocument()
  })

  test('cancela el temporizador al desmontar: no llega a `true` tras desmontado', () => {
    vi.useFakeTimers()
    const clearSpy = vi.spyOn(window, 'clearTimeout')
    const { unmount } = render(<Probe ms={100} />)
    unmount()
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })
})
