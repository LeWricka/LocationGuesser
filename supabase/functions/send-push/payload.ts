// Lógica PURA de copy/tag/exclusión del push de `send-push` — sin red ni cliente
// de Supabase, para poder testear con `deno test` sin mockear infraestructura
// (mismo patrón que `resolve-maps-url/parse.ts`). `index.ts` hace el fetch de
// challenge/grupo/miembros y el envío; aquí solo se decide QUÉ se manda.

export type PushKind = 'created' | 'closing' | 'memory'

export interface PushPayload {
  title: string
  body: string
  url: string
  tag: string
}

/**
 * Construye el payload de la notificación según el tipo de aviso. SIN SPOILER en
 * ningún caso: nunca incluye lat/lng de la respuesta oculta de un reto, y el
 * recuerdo solo aporta su propio título público (nunca la descripción completa).
 *
 *  - `created` (reto nuevo, intacto): "Nuevo reto en tu viaje" / "Te retan en
 *    «título». ¿Aciertas dónde es?" — tag por reto (`challenge-<id>-created`).
 *  - `closing` (reto por cerrar, intacto): "Un reto está por cerrar" / "Aún
 *    puedes jugar «título»." — tag por reto (`challenge-<id>-closing`).
 *  - `memory` (recuerdo, issue #775): "Momento nuevo en {viaje}" / el título del
 *    recuerdo — corto y visual-first, sin spoiler. El `tag` es **por VIAJE**
 *    (`memory-<group_id>`), NO por recuerdo: si alguien sube varios recuerdos
 *    seguidos (backfill de un día), cada push nuevo reemplaza al anterior con el
 *    mismo tag y el sistema operativo los colapsa en una única notificación en
 *    vez de apilarlos (anti-spam).
 */
export function buildPushPayload(
  kind: PushKind,
  groupCode: string,
  challengeId: string,
  title: string,
  groupName: string | null,
): PushPayload {
  const url = `/#g=${groupCode}&c=${challengeId}`

  if (kind === 'memory') {
    return {
      title: `Momento nuevo en ${groupName?.trim() || 'tu viaje'}`,
      body: title.trim() || 'Se ha añadido a la línea de tiempo del viaje.',
      url,
      // Tag COMPARTIDO por viaje (no por recuerdo): ver docstring de la función.
      tag: `memory-${groupCode}`,
    }
  }

  const isCreated = kind === 'created'
  return {
    title: isCreated ? 'Nuevo reto en tu viaje' : 'Un reto está por cerrar',
    body: isCreated
      ? `Te retan en «${title}». ¿Aciertas dónde es?`
      : `Aún puedes jugar «${title}».`,
    url,
    // Colapsa avisos del mismo reto+tipo (no apila duplicados en el dispositivo).
    tag: `challenge-${challengeId}-${kind}`,
  }
}

/**
 * ¿Se avisa al propio creador de la fila? En `closing` sí (recordatorio a todos
 * los miembros, incluido quien lo creó); en `created` y `memory` no (evita
 * "te avisamos de tu propio reto/recuerdo").
 */
export function shouldNotifyCreator(kind: PushKind): boolean {
  return kind === 'closing'
}
