import { assertEquals, assertNotEquals } from 'jsr:@std/assert@1'
import { buildPushPayload, shouldNotifyCreator } from './payload.ts'

Deno.test('reto creado: copy y tag intactos (regresión issue #775)', () => {
  const p = buildPushPayload('created', 'abc123', 'challenge-uuid', 'Dónde estoy', null)
  assertEquals(p.title, 'Nuevo reto en tu viaje')
  assertEquals(p.body, 'Te retan en «Dónde estoy». ¿Aciertas dónde es?')
  assertEquals(p.url, '/#g=abc123&c=challenge-uuid')
  assertEquals(p.tag, 'challenge-challenge-uuid-created')
})

Deno.test('reto por cerrar: copy y tag intactos (regresión issue #775)', () => {
  const p = buildPushPayload('closing', 'abc123', 'challenge-uuid', 'Dónde estoy', null)
  assertEquals(p.title, 'Un reto está por cerrar')
  assertEquals(p.body, 'Aún puedes jugar «Dónde estoy».')
  assertEquals(p.tag, 'challenge-challenge-uuid-closing')
})

Deno.test('recuerdo: título con el nombre del viaje, cuerpo con el título del recuerdo', () => {
  const p = buildPushPayload('memory', 'abc123', 'memory-uuid', 'Playa al atardecer', 'Fiordos 2026')
  assertEquals(p.title, 'Momento nuevo en Fiordos 2026')
  assertEquals(p.body, 'Playa al atardecer')
  assertEquals(p.url, '/#g=abc123&c=memory-uuid')
})

Deno.test('recuerdo sin nombre de viaje: cae a "tu viaje"', () => {
  const p = buildPushPayload('memory', 'abc123', 'memory-uuid', 'Playa al atardecer', null)
  assertEquals(p.title, 'Momento nuevo en tu viaje')
})

Deno.test('recuerdo sin título (defensivo): cuerpo de reserva, nunca vacío', () => {
  const p = buildPushPayload('memory', 'abc123', 'memory-uuid', '   ', 'Fiordos 2026')
  assertEquals(p.body, 'Se ha añadido a la línea de tiempo del viaje.')
})

Deno.test('anti-spam: recuerdos seguidos del mismo viaje comparten tag (colapsan)', () => {
  const p1 = buildPushPayload('memory', 'abc123', 'memory-uuid-1', 'Uno', 'Viaje')
  const p2 = buildPushPayload('memory', 'abc123', 'memory-uuid-2', 'Dos', 'Viaje')
  assertEquals(p1.tag, p2.tag)
  assertEquals(p1.tag, 'memory-abc123')
})

Deno.test('anti-spam: recuerdos de viajes distintos NO comparten tag', () => {
  const p1 = buildPushPayload('memory', 'abc123', 'memory-uuid-1', 'Uno', 'Viaje A')
  const p2 = buildPushPayload('memory', 'xyz789', 'memory-uuid-2', 'Dos', 'Viaje B')
  assertNotEquals(p1.tag, p2.tag)
})

Deno.test('retos con el mismo id pero distinto kind NO comparten tag (created vs closing)', () => {
  const created = buildPushPayload('created', 'abc123', 'challenge-uuid', 'T', null)
  const closing = buildPushPayload('closing', 'abc123', 'challenge-uuid', 'T', null)
  assertNotEquals(created.tag, closing.tag)
})

Deno.test('shouldNotifyCreator: solo "closing" avisa al propio creador', () => {
  assertEquals(shouldNotifyCreator('created'), false)
  assertEquals(shouldNotifyCreator('memory'), false)
  assertEquals(shouldNotifyCreator('closing'), true)
})
