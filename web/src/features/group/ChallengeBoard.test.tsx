import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChallengeBoard } from './ChallengeBoard'
import type { VoteWithName } from '../../lib/leaderboard'

// Mínimo viable de un voto con nombre (los campos que ChallengeBoard NO lee
// se dejan a null/valores neutros — `rankedRowsOf` solo usa los de abajo).
function vote(
  over: Partial<VoteWithName> & Pick<VoteWithName, 'user_id' | 'display_name'>,
): VoteWithName {
  return {
    id: over.user_id,
    group_id: 'g1',
    challenge_id: 'c1',
    guess_lat: null,
    guess_lng: null,
    distance_km: null,
    guess_number: null,
    abs_error: null,
    points: 0,
    left_app: false,
    elapsed_seconds: null,
    play_started_at: null,
    created_at: '2026-01-01T00:00:00Z',
    avatar: null,
    ...over,
  }
}

describe('ChallengeBoard — selección de fila (issue #824)', () => {
  const votes = [
    vote({ user_id: 'a', display_name: 'Ana', points: 100 }),
    vote({ user_id: 'b', display_name: 'Bea', points: 50 }),
  ]

  test('cada fila es un botón con aria-pressed=false por defecto', () => {
    render(<ChallengeBoard votes={votes} myUserId={null} />)
    const ana = screen.getByRole('button', { name: /Ana/ })
    expect(ana).toHaveAttribute('aria-pressed', 'false')
  })

  test('la fila que coincide con selectedUserId lleva aria-pressed=true', () => {
    render(<ChallengeBoard votes={votes} myUserId={null} selectedUserId="a" />)
    expect(screen.getByRole('button', { name: /Ana/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Bea/ })).toHaveAttribute('aria-pressed', 'false')
  })

  test('tocar una fila no seleccionada llama a onSelectUser con su userId', () => {
    const onSelectUser = vi.fn()
    render(<ChallengeBoard votes={votes} myUserId={null} onSelectUser={onSelectUser} />)
    fireEvent.click(screen.getByRole('button', { name: /Bea/ }))
    expect(onSelectUser).toHaveBeenCalledWith('b')
  })

  test('tocar la fila YA seleccionada deselecciona (llama con null)', () => {
    const onSelectUser = vi.fn()
    render(
      <ChallengeBoard
        votes={votes}
        myUserId={null}
        selectedUserId="a"
        onSelectUser={onSelectUser}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Ana/ }))
    expect(onSelectUser).toHaveBeenCalledWith(null)
  })

  test('sin onSelectUser, tocar una fila no revienta', () => {
    render(<ChallengeBoard votes={votes} myUserId={null} />)
    expect(() => fireEvent.click(screen.getByRole('button', { name: /Ana/ }))).not.toThrow()
  })
})
