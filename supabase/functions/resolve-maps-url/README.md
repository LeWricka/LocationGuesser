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
| `422`  | `{ "error": "..." }` | URL ausente/inválida o sin coordenadas |
| `405`  | `{ "error": "..." }` | Método distinto de POST |
| `204`  | _(vacío)_ | Preflight `OPTIONS` (CORS) |

Cabeceras CORS abiertas (`Access-Control-Allow-Origin: *`) en todas las respuestas.

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
