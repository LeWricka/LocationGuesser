import { assertEquals, assertNotEquals } from 'jsr:@std/assert@1'
import {
  buildPushPayload,
  buildTripClosedPayload,
  isPushEnabled,
  shouldNotifyCreator,
} from './payload.ts'

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

Deno.test('shouldNotifyCreator: "closing" y "closed" avisan al propio creador', () => {
  assertEquals(shouldNotifyCreator('created'), false)
  assertEquals(shouldNotifyCreator('memory'), false)
  assertEquals(shouldNotifyCreator('closing'), true)
  assertEquals(shouldNotifyCreator('closed'), true)
})

Deno.test('fin de reto (closed): copy con resultado, url al DETALLE (ver=), tag por reto (issue #857)', () => {
  const p = buildPushPayload('closed', 'abc123', 'challenge-uuid', 'Dónde estoy', null)
  assertEquals(p.title, 'Se acabó: Dónde estoy')
  assertEquals(p.body, 'Mira los resultados y quién ha ganado.')
  assertEquals(p.url, 'https://www.momentu.art/#g=abc123&ver=challenge-uuid')
  assertEquals(p.tag, 'closed-challenge-uuid')
})

Deno.test('fin de reto (closed) sin título (defensivo): cae a "un reto"', () => {
  const p = buildPushPayload('closed', 'abc123', 'challenge-uuid', '   ', null)
  assertEquals(p.title, 'Se acabó: un reto')
})

Deno.test('retos con el mismo id pero distinto kind NO comparten tag (closing vs closed)', () => {
  const closing = buildPushPayload('closing', 'abc123', 'challenge-uuid', 'T', null)
  const closed = buildPushPayload('closed', 'abc123', 'challenge-uuid', 'T', null)
  assertNotEquals(closing.tag, closed.tag)
})

Deno.test('fin de viaje (trip_closed): copy con nombre del viaje, url al marcador, tag por viaje (issue #857)', () => {
  const p = buildTripClosedPayload('abc123', 'Fiordos 2026')
  assertEquals(p.title, 'Fin del viaje: Fiordos 2026')
  assertEquals(p.body, 'Mira la clasificación final y el resumen.')
  assertEquals(p.url, 'https://www.momentu.art/#g=abc123&v=marcador')
  assertEquals(p.tag, 'trip-closed-abc123')
})

Deno.test('fin de viaje (trip_closed) sin nombre: cae a "tu viaje"', () => {
  const p = buildTripClosedPayload('abc123', null)
  assertEquals(p.title, 'Fin del viaje: tu viaje')
})

Deno.test('fin de viaje (trip_closed): tags de viajes distintos no colisionan', () => {
  const a = buildTripClosedPayload('abc123', 'Viaje A')
  const b = buildTripClosedPayload('xyz789', 'Viaje B')
  assertNotEquals(a.tag, b.tag)
})

Deno.test('isPushEnabled: clave ausente o perfil sin prefs = activado (issue #857)', () => {
  assertEquals(isPushEnabled('created', null), true)
  assertEquals(isPushEnabled('created', undefined), true)
  assertEquals(isPushEnabled('created', {}), true)
  assertEquals(isPushEnabled('memory', { created: false }), true)
})

Deno.test('isPushEnabled: solo false explícito desactiva ese kind', () => {
  assertEquals(isPushEnabled('created', { created: false }), false)
  assertEquals(isPushEnabled('closed', { created: false, closed: false }), false)
  assertEquals(isPushEnabled('closed', { created: false }), true)
  assertEquals(isPushEnabled('trip_closed', { trip_closed: false }), false)
})
