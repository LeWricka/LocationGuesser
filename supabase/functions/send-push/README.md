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
// petición
{ "challenge_id": "<uuid>", "kind": "created" }   // kind: "created" | "closing"
```

| Status | Respuesta | Cuándo |
|--------|-----------|--------|
| `200`  | `{ "sent": n, "failed": n, "removed": n }` | Envío procesado (resumen) |
| `400`  | `{ "error": "..." }` | Body inválido (`challenge_id`/`kind`) |
| `401`  | `{ "error": "..." }` | Token ausente o incorrecto |
| `404`  | `{ "error": "..." }` | Reto no encontrado |
| `405`  | `{ "error": "..." }` | Método distinto de POST |
| `500`  | `{ "error": "..." }` | Config incompleta (secrets) o fallo interno |

- `removed` = suscripciones muertas (404/410 del push service) borradas de la tabla.
- El payload **nunca** lleva la respuesta del reto (lat/lng): solo "hay reto" / "cierra pronto".

## Quién la invoca

A diferencia de `resolve-maps-url` (la llama el front), a **esta solo la invoca la BASE
DE DATOS**, por dos caminos (ver `pwa-push.md` §1.3):

1. **Al crear un reto** → `AFTER INSERT on challenges`, vía Database Webhook del
   dashboard **o** trigger SQL + `pg_net` (migración `0025_notify_challenge_created.sql`).
   Así `web/src/features/create` y `web/src/lib/challenges.ts` **no cambian**: el aviso es
   consecuencia de la fila insertada, no una acción del cliente.
2. **Recordatorios de cierre** → job `pg_cron` periódico que llama con `kind: 'closing'`
   para retos por cerrar (Fase 3, aún no cableada — ver `pwa-push.md` §5).

## Secrets (Supabase)

```bash
# Genera el par VAPID UNA vez (la pública también va al front como VITE_VAPID_PUBLIC_KEY):
npx web-push generate-vapid-keys

npx supabase secrets set \
  VAPID_PUBLIC_KEY=<publica> \
  VAPID_PRIVATE_KEY=<privada> \
  VAPID_SUBJECT=mailto:icka69@gmail.com \
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
