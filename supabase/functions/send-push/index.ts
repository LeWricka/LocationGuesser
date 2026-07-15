// Edge Function (Deno) que ENVÍA notificaciones Web Push a los miembros de un viaje.
//
// Es la Fase 2 de PWA + Web Push (diseño: docs/estrategia/pwa-push.md §1.3). La
// suscripción del cliente (Fase 1) ya guarda filas en `push_subscriptions`; esta
// función las lee y manda el push firmado con VAPID.
//
// Contrato:
//   POST /functions/v1/send-push   (cabecera X-Push-Token con el token compartido)
//     { "challenge_id": "<uuid>", "kind": "created" | "closing" | "memory" }
//       200 -> { sent, failed, removed }   (resumen del envío)
//       400 -> { error }   (body inválido)
//       401 -> { error }   (token ausente o incorrecto)
//       404 -> { error }   (reto/recuerdo no encontrado)
//       500 -> { error }   (config incompleta / fallo interno)
//
// A diferencia de `resolve-maps-url` (la llama el front, CORS abierto), a ESTA solo
// la invoca la BASE DE DATOS (trigger AFTER INSERT on challenges — retos Y
// recuerdos desde 0041/issue #775 —, o pg_cron para los recordatorios de cierre).
// Por eso NO es endpoint público de usuario: se protege con un secreto compartido
// (PUSH_SEND_TOKEN) en la cabecera, además del `--verify-jwt` por defecto. NUNCA
// expone la respuesta oculta de un reto (lat/lng): el payload solo dice "hay
// reto" / "cierra pronto" / "hay un momento nuevo".

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { buildPushPayload, shouldNotifyCreator, type PushKind } from './payload.ts'

// ── Config (secrets de Supabase) ─────────────────────────────────────────────
// VAPID_PRIVATE_KEY: SECRETA, solo aquí (firma los push). VAPID_PUBLIC_KEY: la misma
// que el front usa como VITE_VAPID_PUBLIC_KEY. SUPABASE_SERVICE_ROLE_KEY: ya está
// disponible para las functions del proyecto; con ella el cliente se salta RLS para
// leer las suscripciones de TODOS los miembros del grupo. PUSH_SEND_TOKEN: secreto
// compartido entre la BD (webhook/cron) y esta función para que solo la BD la invoque.
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:Iker@540deg.com'
const PUSH_SEND_TOKEN = Deno.env.get('PUSH_SEND_TOKEN') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

interface StoredSubscription {
  endpoint: string
  p256dh: string
  auth: string
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return json({ error: 'Usa POST con { challenge_id, kind }' }, 405)
  }

  // Config mínima imprescindible para poder enviar. Si falta, fallamos explícito
  // (no en silencio) para que el operador lo vea en logs.
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: 'Configuración de push incompleta (faltan secrets VAPID/Supabase)' }, 500)
  }

  // Autenticación por token compartido: solo la BD (webhook/cron) conoce PUSH_SEND_TOKEN.
  if (!PUSH_SEND_TOKEN || req.headers.get('X-Push-Token') !== PUSH_SEND_TOKEN) {
    return json({ error: 'No autorizado' }, 401)
  }

  let challengeId: unknown
  let kind: unknown
  try {
    const body = await req.json()
    challengeId = body?.challenge_id
    kind = body?.kind
  } catch {
    return json({ error: 'Body JSON inválido' }, 400)
  }

  if (typeof challengeId !== 'string' || challengeId.trim() === '') {
    return json({ error: "Falta 'challenge_id' (string)" }, 400)
  }
  if (kind !== 'created' && kind !== 'closing' && kind !== 'memory') {
    return json({ error: "'kind' debe ser 'created', 'closing' o 'memory'" }, 400)
  }
  const pushKind: PushKind = kind

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  // service_role: se salta RLS para leer miembros y suscripciones de todo el grupo.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  // 1. Fila (reto o recuerdo, misma tabla desde 0022) -> grupo + creador + título.
  const { data: challenge, error: challengeErr } = await admin
    .from('challenges')
    .select('id, group_id, title, created_by')
    .eq('id', challengeId)
    .maybeSingle()
  if (challengeErr) return json({ error: challengeErr.message }, 500)
  if (!challenge) return json({ error: 'Reto/recuerdo no encontrado' }, 404)

  // 1b. Nombre del viaje: solo hace falta para el copy de 'memory' ("Momento nuevo
  //     en {viaje}"); en 'created'/'closing' el copy no lo usa, así que no se pide.
  let groupName: string | null = null
  if (pushKind === 'memory') {
    const { data: group, error: groupErr } = await admin
      .from('groups')
      .select('name')
      .eq('id', challenge.group_id)
      .maybeSingle()
    if (groupErr) return json({ error: groupErr.message }, 500)
    groupName = group?.name ?? null
  }

  // 2. Miembros del grupo. En 'created'/'memory' excluimos al creador (no se avisa
  //    a sí mismo de su propio reto/recuerdo); en 'closing' avisamos a todos los
  //    miembros (filtrar por votantes pendientes es una mejora posterior; el `tag`
  //    evita duplicar y el cron controla la frecuencia).
  const { data: members, error: membersErr } = await admin
    .from('group_members')
    .select('user_id')
    .eq('group_id', challenge.group_id)
  if (membersErr) return json({ error: membersErr.message }, 500)

  const recipientIds = (members ?? [])
    .map((m) => m.user_id as string)
    .filter((id) => shouldNotifyCreator(pushKind) || id !== challenge.created_by)

  if (recipientIds.length === 0) {
    return json({ sent: 0, failed: 0, removed: 0 })
  }

  // 3. Suscripciones (1..N por miembro/dispositivo).
  const { data: subs, error: subsErr } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('user_id', recipientIds)
  if (subsErr) return json({ error: subsErr.message }, 500)

  const subscriptions = (subs ?? []) as StoredSubscription[]
  if (subscriptions.length === 0) {
    return json({ sent: 0, failed: 0, removed: 0 })
  }

  const payload = JSON.stringify(
    buildPushPayload(pushKind, challenge.group_id, challenge.id, challenge.title, groupName),
  )

  // 4. Enviar a cada endpoint. 404/410 = suscripción muerta => borrarla para no
  //    reintentar eternamente contra un dispositivo que ya no existe.
  let sent = 0
  let failed = 0
  const deadEndpoints: string[] = []

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        )
        sent += 1
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) {
          deadEndpoints.push(sub.endpoint)
        } else {
          failed += 1
        }
      }
    }),
  )

  if (deadEndpoints.length > 0) {
    await admin.from('push_subscriptions').delete().in('endpoint', deadEndpoints)
  }

  return json({ sent, failed, removed: deadEndpoints.length })
})
