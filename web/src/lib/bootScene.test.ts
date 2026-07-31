// Boot oscuro por hash (issue #982). `isDarkSceneHash` decide si un deep link
// aterriza en una escena oscura (viaje/reto, `#g=…`); es el MISMO criterio que
// el script inline de index.html (duplicado ahí porque corre antes de que
// exista el bundle) — este test cubre la versión TypeScript que usa BootScreen.

import { describe, test, expect, beforeEach } from 'vitest'
import { BOOT_SCENE_CLASS, isDarkSceneHash, clearBootScene } from './bootScene'

describe('isDarkSceneHash', () => {
  test('deep link de viaje (#g=…) es escena oscura', () => {
    expect(isDarkSceneHash('#g=ABC')).toBe(true)
  })

  test('deep link de reto (#g=…&c=…) es escena oscura', () => {
    expect(isDarkSceneHash('#g=ABC&c=uuid-reto')).toBe(true)
  })

  test('sin el # inicial también reconoce el grupo', () => {
    expect(isDarkSceneHash('g=ABC')).toBe(true)
  })

  test('vistas de app (#nuevo, #perfil, #admin) NO son escena oscura', () => {
    expect(isDarkSceneHash('#nuevo')).toBe(false)
    expect(isDarkSceneHash('#perfil')).toBe(false)
    expect(isDarkSceneHash('#admin')).toBe(false)
  })

  test('home sin hash NO es escena oscura', () => {
    expect(isDarkSceneHash('')).toBe(false)
  })

  test('no confunde un parámetro que contenga "g=" a mitad de otro valor', () => {
    // p.ej. un token/nombre que termine en "g" seguido de otro par sin ser el
    // propio grupo: el criterio exige "g=" tras `#` o `&`, no en cualquier parte.
    expect(isDarkSceneHash('#tag=xg=1')).toBe(false)
  })
})

describe('clearBootScene', () => {
  beforeEach(() => {
    document.documentElement.classList.remove(BOOT_SCENE_CLASS)
  })

  test('retira la clase si estaba puesta', () => {
    document.documentElement.classList.add(BOOT_SCENE_CLASS)
    clearBootScene()
    expect(document.documentElement.classList.contains(BOOT_SCENE_CLASS)).toBe(false)
  })

  test('no-op si no estaba puesta', () => {
    clearBootScene()
    expect(document.documentElement.classList.contains(BOOT_SCENE_CLASS)).toBe(false)
  })
})
