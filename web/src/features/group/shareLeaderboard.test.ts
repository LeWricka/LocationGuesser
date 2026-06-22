import { describe, test, expect } from 'vitest'
import { buildShareText } from './shareLeaderboard'
import type { LeaderboardEntry } from '../../lib/leaderboard'

// Resumen de texto de la clasificación para compartir en el chat. Función pura:
// cubrimos el camino normal (podio + puntos), los premios "en juego", el
// truncado del top 10 y la tabla vacía.
describe('buildShareText', () => {
  const link = 'https://app/#g=ABC'

  // Los puntos se formatean con toLocaleString('es-ES'); el runtime de test puede
  // no agrupar miles igual que el navegador, así que comparamos con el mismo
  // formateador en vez de hardcodear "3.000".
  const fmt = (n: number) => n.toLocaleString('es-ES')

  function entries(n: number): LeaderboardEntry[] {
    return Array.from({ length: n }, (_, i) => ({
      userId: `u${i}`,
      name: `Jugador ${i + 1}`,
      points: (n - i) * 1000,
      plays: 1,
    }))
  }

  test('cabecera con el nombre del grupo y medallas en el podio', () => {
    const text = buildShareText('Viaje a Italia', entries(3), null, link)
    expect(text).toContain('🏆 Clasificación · Viaje a Italia')
    expect(text).toContain(`🥇 Jugador 1 — ${fmt(3000)}`)
    expect(text).toContain(`🥈 Jugador 2 — ${fmt(2000)}`)
    expect(text).toContain(`🥉 Jugador 3 — ${fmt(1000)}`)
    expect(text).toContain(`👉 Únete y juega: ${link}`)
  })

  test('a partir del 4º usa número, no medalla', () => {
    const text = buildShareText('G', entries(4), null, link)
    expect(text).toContain(`4. Jugador 4 — ${fmt(1000)}`)
  })

  test('incluye solo los premios definidos, en orden', () => {
    const text = buildShareText('G', entries(2), { first: 'elige cena', last: 'paga rondas' }, link)
    expect(text).toContain('🎁 En juego: 🥇 elige cena · 🏁 paga rondas')
  })

  test('sin premios no añade la línea "En juego"', () => {
    const text = buildShareText('G', entries(2), {}, link)
    expect(text).not.toContain('En juego')
  })

  test('trunca a 10 jugadores y añade "…"', () => {
    const text = buildShareText('G', entries(15), null, link)
    expect(text).toContain('10. Jugador 10')
    expect(text).not.toContain('Jugador 11')
    expect(text).toContain('…')
  })

  test('clasificación vacía invita a unirse igualmente', () => {
    const text = buildShareText('G', [], null, link)
    expect(text).toContain('Aún no hay clasificación')
    expect(text).toContain(`👉 Únete y juega: ${link}`)
  })
})
