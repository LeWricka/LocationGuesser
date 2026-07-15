import { describe, test, expect } from 'vitest'
import { prizeForRow, prizesLine } from './prizes'

// Mapea premio↔fila en la clasificación: índice 0/1/2 = 1º/2º/3º; la última fila
// = `last`. Cubre los casos delicados (sin premios, premios parciales, y el
// solapamiento de "primero y último a la vez" cuando hay un solo jugador).
describe('prizeForRow', () => {
  const prizes = { first: 'manda', second: 'plata', third: 'bronce', last: 'invita' }

  test('mapea cada puesto a su premio', () => {
    expect(prizeForRow(prizes, 0, 5)).toBe('manda')
    expect(prizeForRow(prizes, 1, 5)).toBe('plata')
    expect(prizeForRow(prizes, 2, 5)).toBe('bronce')
  })

  test('la última fila lleva el premio `last`', () => {
    expect(prizeForRow(prizes, 4, 5)).toBe('invita')
  })

  test('una fila intermedia sin premio de podio no muestra nada', () => {
    expect(prizeForRow({ first: 'manda', last: 'invita' }, 3, 5)).toBeNull()
  })

  test('sin premios definidos → null', () => {
    expect(prizeForRow(null, 0, 3)).toBeNull()
  })

  test('solo first definido: el 2º/3º no muestran chip', () => {
    expect(prizeForRow({ first: 'manda' }, 1, 4)).toBeNull()
    expect(prizeForRow({ first: 'manda' }, 2, 4)).toBeNull()
  })

  test('un solo jugador es primero y último: gana el premio alto (first)', () => {
    expect(prizeForRow(prizes, 0, 1)).toBe('manda')
  })

  test('solo `last` definido y un jugador: la única fila lleva `last`', () => {
    expect(prizeForRow({ last: 'invita' }, 0, 1)).toBe('invita')
  })
})

// Centralizada (issues #752/#753) desde `LeaderboardCard.tsx`: la reutilizan la
// tarjeta para compartir y la bienvenida del receptor.
describe('prizesLine', () => {
  test('sin premios → null', () => {
    expect(prizesLine(null)).toBeNull()
  })

  test('todos vacíos/en blanco → null', () => {
    expect(prizesLine({ first: '   ', second: '' })).toBeNull()
  })

  test('junta los puestos definidos, en orden, separados por "·"', () => {
    expect(prizesLine({ first: 'manda', last: 'invita' })).toBe('1º manda  ·  Último invita')
  })

  test('incluye 2º/3º cuando están definidos', () => {
    expect(prizesLine({ first: 'manda', second: 'plata', third: 'bronce', last: 'invita' })).toBe(
      '1º manda  ·  2º plata  ·  3º bronce  ·  Último invita',
    )
  })
})
