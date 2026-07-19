// Lógica PURA de copy/tag/exclusión del push de `send-push` — sin red ni cliente
// de Supabase, para poder testear con `deno test` sin mockear infraestructura
// (mismo patrón que `resolve-maps-url/parse.ts`). `index.ts` hace el fetch de
// challenge/grupo/miembros y el envío; aquí solo se decide QUÉ se manda.
//
// `closed` (fin de reto) y `trip_closed` (fin de viaje) son issue #857: además
// del copy, añaden el FILTRO DE PREFERENCIAS (`isPushEnabled`) que aplica a
// TODOS los kinds, viejos y nuevos por igual.

export type PushKind = 'created' | 'closing' | 'memory' | 'closed' | 'trip_closed'

export interface PushPayload {
  title: string
  body: string
  url: string
  tag: string
}

/** Preferencias por tipo de notificación (`profiles.push_prefs`, issue #857).
 * Clave ausente = activada (comportamiento histórico, previo a la existencia
 * de la columna): un perfil con push_prefs='{}' o sin la clave concreta debe
 * seguir recibiendo ese tipo. Solo `false` explícito desactiva. */
export type PushPrefs = Partial<Record<PushKind, boolean>>

/** ¿Este destinatario quiere avisos de este `kind`? `prefs` puede ser null
 * (perfil sin fila, no debería pasar pero es defensivo) — en ese caso, activado. */
export function isPushEnabled(kind: PushKind, prefs: PushPrefs | null | undefined): boolean {
  return prefs?.[kind] !== false
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
 *  - `closed` (fin de reto, issue #857): "Se acabó: «título»" / "Mira los
 *    resultados y quién ha ganado." — a diferencia de `created`/`closing`, aquí
 *    SÍ hay spoiler potencial (la respuesta ya se reveló al cerrar), así que el
 *    deep-link va al DETALLE del reto (`ver=`, no `c=` de "ir a jugar") y con
 *    dominio absoluto (viene de un trigger/cron de BD, no de un cliente que ya
 *    esté en la app). Tag por reto (`closed-<id>`).
 */
export function buildPushPayload(
  kind: Exclude<PushKind, 'trip_closed'>,
  groupCode: string,
  challengeId: string,
  title: string,
  groupName: string | null,
): PushPayload {
  if (kind === 'closed') {
    return {
      title: `Se acabó: ${title.trim() || 'un reto'}`,
      body: 'Mira los resultados y quién ha ganado.',
      // Deep-link al DETALLE (no a jugar): el reto ya cerró.
      url: `https://www.momentu.art/#g=${groupCode}&ver=${challengeId}`,
      tag: `closed-${challengeId}`,
    }
  }

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
 * Payload de "fin de viaje" (`trip_closed`, issue #857): a diferencia de los
 * demás kinds, NO cuelga de un `challenges.id` — cuelga de `groups.id`
 * (el código del viaje, `group_id`). Título con el nombre del viaje, cuerpo fijo
 * ("mira la clasificación final"), deep-link a la pestaña Marcador
 * (`v=marcador`, el mismo hash que `marcadorGroupHash` del front). Tag por
 * viaje (`trip-closed-<group_id>`): un recierre legítimo (ver migración 0042)
 * reemplaza el aviso anterior en vez de apilarlo.
 */
export function buildTripClosedPayload(groupId: string, groupName: string | null): PushPayload {
  return {
    title: `Fin del viaje: ${groupName?.trim() || 'tu viaje'}`,
    body: 'Mira la clasificación final y el resumen.',
    url: `https://www.momentu.art/#g=${groupId}&v=marcador`,
    tag: `trip-closed-${groupId}`,
  }
}

/**
 * ¿Se avisa al propio creador de la fila? En `closing` y `closed` sí
 * (recordatorio / resultados a todos los miembros, incluido quien lo creó); en
 * `created` y `memory` no (evita "te avisamos de tu propio reto/recuerdo").
 * No aplica a `trip_closed`: ese kind no tiene "creador de fila" — excluye a
 * quien CERRÓ EL VIAJE, un dato distinto que `index.ts` recibe aparte
 * (`excluded_user_id`) y compara directamente, sin pasar por esta función.
 */
export function shouldNotifyCreator(kind: Exclude<PushKind, 'trip_closed'>): boolean {
  return kind === 'closing' || kind === 'closed'
}
