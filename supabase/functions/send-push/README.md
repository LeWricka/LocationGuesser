# send-push

Edge Function (Deno) que **envía notificaciones Web Push** a los miembros de un viaje.
Fase 2 de PWA + Web Push (diseño: [`docs/estrategia/pwa-push.md`](../../../docs/estrategia/pwa-push.md) §1.3).

La suscripción del cliente (Fase 1, `web/src/lib/push.ts`) ya guarda filas en
`push_subscriptions`. Esta función las lee con `service_role` (se salta RLS), firma el
push con VAPID y lo entrega a cada endpoint (FCM/Apple/Mozilla).

## Contrato

`POST /functions/v1/send-push`

Cabecera obligatoria `X-Push-Token: <PUSH_SEND_TOKEN>` (secreto compartido con la BD).

```json
// petición (reto/recuerdo): kind: "created" | "closing" | "memory" | "closed"
{ "challenge_id": "<uuid>", "kind": "created" }

// petición (fin de viaje): NO lleva challenge_id, cuelga de groups.id
{ "group_id": "<code>", "kind": "trip_closed", "excluded_user_id": "<uuid>" }
```

| Status | Respuesta | Cuándo |
|--------|-----------|--------|
| `200`  | `{ "sent": n, "failed": n, "removed": n }` | Envío procesado (resumen) |
| `400`  | `{ "error": "..." }` | Body inválido (`challenge_id`/`group_id`/`kind`) |
| `401`  | `{ "error": "..." }` | Token ausente o incorrecto |
| `404`  | `{ "error": "..." }` | Reto/viaje no encontrado |
| `405`  | `{ "error": "..." }` | Método distinto de POST |
| `500`  | `{ "error": "..." }` | Config incompleta (secrets) o fallo interno |

- `removed` = suscripciones muertas (404/410 del push service) borradas de la tabla.
- El payload **nunca** lleva la respuesta de un reto EN JUEGO (lat/lng): solo "hay
  reto" / "cierra pronto" / "hay un momento nuevo" / "cerró, mira el resultado" /
  "fin de viaje, mira la clasificación".
- **Preferencias (issue #857):** antes de enviar, se filtra por
  `profiles.push_prefs[kind]` — `false` explícito excluye al destinatario; clave
  ausente o perfil sin `push_prefs` = se envía (ver `payload.ts#isPushEnabled`).

## Quién la invoca

A diferencia de `resolve-maps-url` (la llama el front), a **esta solo la invoca la BASE
DE DATOS**, por tres caminos (ver `pwa-push.md` §1.3 y migraciones `0040`/`0041`/`0042`):

1. **Al crear un reto o recuerdo** → `AFTER INSERT on challenges`, trigger SQL +
   `pg_net` (`notify_challenge_created`, 0040/0041). Así `web/src/features/create` y
   `web/src/lib/challenges.ts` **no cambian**: el aviso es consecuencia de la fila
   insertada, no una acción del cliente.
2. **Fin de reto** (`kind: 'closed'`, issue #857) → `pg_cron` cada 5 min llama a
   `notify_closed_challenges()` (0042), que busca retos con `deadline_at` ya
   pasado y `closed_notified_at is null` (y ≥1 voto). Es un POLL, no un trigger:
   el cierre por plazo no es una escritura que uno pueda enganchar.
3. **Fin de viaje** (`kind: 'trip_closed'`, issue #857) → trigger
   `AFTER UPDATE OF closed_at on groups` (`notify_group_closed`, 0042), disparado
   cuando `closed_at` pasa de NULL a NOT NULL (el dueño cierra el viaje).

## Secrets (Supabase)

```bash
# Genera el par VAPID UNA vez (la pública también va al front como VITE_VAPID_PUBLIC_KEY):
npx web-push generate-vapid-keys

npx supabase secrets set \
  VAPID_PUBLIC_KEY=<publica> \
  VAPID_PRIVATE_KEY=<privada> \
  VAPID_SUBJECT=mailto:Iker@540deg.com \
  PUSH_SEND_TOKEN=<token-aleatorio-largo> \
  --project-ref ykquigyjvgxisgdxryxr
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya están disponibles para las functions
del proyecto (no hay que setearlas). La **privada VAPID** y el **service_role** NUNCA
van al cliente ni a git. Detalle operativo: [`docs/operativa.md`](../../../docs/operativa.md) §6.

## Desplegar

```bash
npx supabase functions deploy send-push --project-ref ykquigyjvgxisgdxryxr
```

> No usar `--no-verify-jwt`: a esta función no la llama el front anónimo, así que el
> JWT por defecto + el `X-Push-Token` son dos capas de protección.

## Desarrollo

```bash
deno check supabase/functions/send-push/index.ts
```
