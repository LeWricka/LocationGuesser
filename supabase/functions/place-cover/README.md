# place-cover

Edge Function (Deno) que deriva una **portada** a partir del **nombre de un lugar**,
para cuando un viaje (`groups`) o un recuerdo/reto (`challenges`) no tiene imagen propia
y la tarjeta saldría gris.

Ej.: `"Finde Madrid"` / `"París"` → una foto de Madrid / París.

## Contrato

`POST /functions/v1/place-cover`

```json
// petición
{ "name": "Madrid", "lang": "es" }
```

`lang` es opcional (`es` | `en`; por defecto prueba `es` y luego `en`).

| Status | Respuesta                                                                | Cuándo                                  |
| ------ | ------------------------------------------------------------------------ | --------------------------------------- |
| `200`  | `{ "image_url": "https://upload.wikimedia.org/...", "page_url": "...", "title": "Madrid" }` | Se encontró una foto                    |
| `200`  | `{ "image_url": null, "page_url": null, "title": null }`                 | No hay foto (el front usa su placeholder) |
| `422`  | `{ "error": "..." }`                                                     | Falta `name` o body inválido            |
| `405`  | `{ "error": "..." }`                                                     | Método distinto de POST                 |
| `204`  | _(vacío)_                                                                | Preflight `OPTIONS` (CORS)              |

CORS abierto (`Access-Control-Allow-Origin: *`) en todas las respuestas.

## Fuente de imágenes y licencia

- **REST de Wikipedia** (`/api/rest_v1/page/summary/<titulo>`), sin API key. Devuelve
  `originalimage`/`thumbnail` del artículo (preferimos `originalimage`).
- Respaldo: **REST de búsqueda** (`/w/rest.php/v1/search/page`) cuando el nombre lleva
  ruido (p.ej. "finde madrid"): busca el mejor título y reintenta el summary.
- Las imágenes vienen del **CDN de Wikimedia** (`upload.wikimedia.org`); filtramos por
  ese host (fail-closed). Licencia **CC-BY-SA / dominio público**; la **atribución**
  está en la página del artículo, que devolvemos como `page_url`.
- La política de Wikimedia exige un **User-Agent** identificativo: va fijado en la
  función (público, no es un secreto).

No requiere variables nuevas ni secrets.

## Seguridad

- No hace fetch a una URL del usuario: solo a `*.wikipedia.org` con un `lang` de una
  **allowlist** (`es`/`en`). Sin SSRF: el usuario no controla el host.
- La imagen devuelta debe ser de `upload.wikimedia.org` o se descarta.

## Desarrollo y tests

```bash
deno check supabase/functions/place-cover/index.ts
```

La lógica testeable (normalización del nombre, cache) vive en el front
(`web/src/lib/placeCover.ts` + su test). La función es una capa fina sobre la REST.

## Desplegar

```bash
npx supabase functions deploy place-cover --project-ref ykquigyjvgxisgdxryxr --no-verify-jwt
```

`--no-verify-jwt`: la llama el front sin sesión (como `resolve-maps-url`). No usa la
key de Maps ni el `service_role`. El mismo efecto está ahora fijado también en
`supabase/config.toml` (`[functions.place-cover]` → `verify_jwt = false`), así que
el flag es cinturón-y-tirantes: aunque se olvide en el comando, el `deploy` lo lee
del `config.toml`.

> **Incidente #591 (jul 2026):** el `deploy` de esta función nunca llegó a
> ejecutarse tras mergear #354 — `npx supabase functions list` mostraba solo
> `resolve-maps-url` y `send-push`. El front la llamaba igualmente y la
> plataforma respondía `404 NOT_FOUND` al preflight `OPTIONS`; un 404 no es un
> "HTTP ok" para el navegador, así que el preflight fallaba en bucle y
> `resolvePlaceCover` (sin cachear el fallo) reintentaba en cada remonte de
> tarjeta, congelando la web. Tras desplegar, comprobar con:
> `curl -i -X OPTIONS "$URL/functions/v1/place-cover" -H "Origin: https://www.tabide.app" -H "Access-Control-Request-Method: POST"`
> — debe responder `204` (no `404` ni `401`).
