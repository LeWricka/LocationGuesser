import { describe, test, expect } from 'vitest'
import { isSafeUpdateRoute } from './safeUpdateRoute'

describe('isSafeUpdateRoute', () => {
  test.each<[string, boolean]>([
    // Home: segura.
    ['', true],
    ['#', true],

    // Viaje en diario (sin `v`, sin `add`, sin `c`): segura.
    ['#g=abc123', true],
    ['g=abc123', true], // también sin el `#` inicial

    // Viaje en marcador: segura.
    ['#g=abc123&v=marcador', true],
    ['#g=abc123&v=fotos', true],
    ['#g=abc123&v=clasico', true], // legado

    // Jugando un reto (`c=`): NO segura, cortaría la partida.
    ['#g=abc123&c=reto1', false],
    ['#g=abc123&v=marcador&c=reto1', false],

    // Creando reto/momento (`add=`): NO segura.
    ['#g=abc123&add=recuerdo', false],
    ['#g=abc123&add=reto', false],
    ['#g=abc123&add=reto&from=momento1', false],
    ['#g=abc123&v=marcador&add=1', false], // asistente clásico

    // Vistas de app con posible edición: NO seguras.
    ['#nuevo', false],
    ['#perfil', false],
    ['#admin', false],

    // Hash no reconocido: por defecto, NO segura.
    ['#algo-desconocido', false],
    ['#c=reto-suelto', false], // reto sin grupo: no es la ruta de viaje reconocida
  ])('isSafeUpdateRoute(%j) === %j', (hash, expected) => {
    expect(isSafeUpdateRoute(hash)).toBe(expected)
  })
})
