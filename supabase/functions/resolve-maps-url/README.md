# resolve-maps-url

Edge Function (Deno) que des-acorta enlaces de Google Maps y devuelve sus coordenadas.

El botón **Compartir** de Google Maps en móvil genera enlaces cortos
(`maps.app.goo.gl/...`, `goo.gl/maps/...`) que el front **no puede resolver por CORS**.
Esta función sigue las redirecciones en servidor y extrae `lat`/`lng`.

## Contrato

`POST /functions/v1/resolve-maps-url`

```json
// petición
{ "url": "https://maps.app.goo.gl/AbCdEf123" }
```

| Status | Respuesta | Cuándo |
|--------|-----------|--------|
| `200`  | `{ "lat": 41.4036, "lng": 2.1743 }` | Se resolvieron coordenadas |
| `400`  | `{ "error": "..." }` | La URL (o su destino tras redirección) no es de Google Maps |
| `422`  | `{ "error": "..." }` | URL ausente/inválida o sin coordenadas |
| `405`  | `{ "error": "..." }` | Método distinto de POST |
| `204`  | _(vacío)_ | Preflight `OPTIONS` (CORS) |

Cabeceras CORS abiertas (`Access-Control-Allow-Origin: *`) en todas las respuestas.

## Seguridad — allowlist anti-SSRF

La función hace `fetch` siguiendo redirecciones, así que sin validación sería un
**SSRF**: un atacante podría usarla de proxy hacia metadatos de la nube
(`169.254.169.254`) o servicios internos. Por eso solo seguimos enlaces de Google
Maps; cualquier otra URL se rechaza con `400` **antes** de hacer fetch:

- **Esquema:** solo `https`.
- **Hosts exactos:** `maps.app.goo.gl`, `goo.gl`, `maps.google.com`, `g.co`, `g.page`.
- **`google.<tld>`** (`google.com`, `google.es`, `google.co.uk`, …): solo si la ruta
  empieza por `/maps` (`google.com` a secas no vale).
- **IPs/hosts bloqueados:** `localhost`, loopback (`127.x`, `::1`), link-local
  (`169.254.x`) y rangos privados (`10.x`, `172.16–31.x`, `192.168.x`).
- La **URL final tras seguir redirecciones** se vuelve a validar (un acortador
  permitido no puede llevar fuera de la allowlist).

CORS sigue abierto (`*`) por diseño (lo llama el front estático desde cualquier
origen de Vercel). El riesgo de proxy abierto queda acotado por la allowlist: solo
devuelve `lat`/`lng` públicos de enlaces de Maps.

## Formatos de URL soportados

El parser (`parse.ts`) prueba, en orden:

1. `@<lat>,<lng>` — centro del mapa
2. `!3d<lat>!4d<lng>` — pin dentro de `data=...`
3. query `q=`, `query=`, `ll=`, `center=`, `destination=`, `daddr=` con `<lat>,<lng>`
4. cualquier par `<lat>,<lng>` suelto en la URL (último recurso)

Solo acepta pares dentro de rango (`lat ∈ [-90,90]`, `lng ∈ [-180,180]`).

## Desarrollo y tests

```bash
deno test supabase/functions/resolve-maps-url   # tests del parser
deno check supabase/functions/resolve-maps-url/index.ts
```

## Desplegar

```bash
npx supabase functions deploy resolve-maps-url
```
