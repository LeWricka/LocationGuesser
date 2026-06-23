// Edge Function (Deno) que des-acorta enlaces de Google Maps y devuelve lat/lng.
//
// El botón "Compartir" de Google Maps en móvil genera enlaces cortos
// (maps.app.goo.gl/..., goo.gl/maps/...) que el front no puede resolver por CORS.
// Esta función sigue las redirecciones en servidor y extrae las coordenadas.
//
// Contrato:
//   POST { url: string }
//     200 -> { lat: number, lng: number }
//     422 -> { error: string }   (URL inválida o sin coordenadas)
//   OPTIONS -> 204 (preflight CORS)

import { parseLatLng } from "./parse.ts";

// CORS abierto: la función la llama el front estático desde cualquier origen de
// Vercel (incl. previews) y no maneja datos sensibles del usuario. RIESGO asumido:
// al permitir "*" cualquier web puede invocarla; lo mitigamos con la allowlist de
// hosts de abajo (no es un proxy abierto) y porque solo devuelve lat/lng públicos.
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Hosts de Google Maps permitidos. Sin allowlist, esta función es un SSRF: un
// atacante la usaría como proxy para alcanzar metadatos de la nube
// (169.254.169.254) o servicios internos. Solo seguimos enlaces de Maps.
//
// Dos grupos:
//  - exactHosts: acortadores y dominios de Maps que valen tal cual.
//  - googleMapsTld: dominios google.<tld> (google.com, google.es, …) que solo
//    valen si la ruta es de Maps (/maps) — google.com a secas NO.
const exactHosts = new Set<string>([
  "maps.app.goo.gl",
  "goo.gl",
  "maps.google.com",
  "g.co",
  "g.page",
]);

// google.<tld>: el TLD es 2–3 letras o un par compuesto tipo "co.uk"/"com.mx".
const googleMapsTld = /^(?:www\.)?google\.(?:[a-z]{2,3})(?:\.[a-z]{2})?$/;

// IPv4/IPv6/localhost que NUNCA debemos alcanzar (loopback, link-local con los
// metadatos de la nube, y rangos privados RFC 1918). Defensa en profundidad por
// si un host de la allowlist redirigiese a una IP (no debería).
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  // IPv6 entre corchetes o loopback.
  if (h.startsWith("[") || h === "::1") return true;
  // 169.254.x (link-local, incl. metadatos), 127.x (loopback), 10.x, 192.168.x.
  if (/^(169\.254|127|10|192\.168)\./.test(h)) return true;
  // 172.16.x – 172.31.x (privado).
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

// True si la URL es un enlace legítimo de Google Maps que podemos seguir. Valida
// esquema (solo https), host (allowlist) y, para google.<tld>, que la ruta sea
// de Maps. Devuelve false ante cualquier duda (fail-closed).
function isAllowedMapsUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  // Solo https: bloquea http://, file://, data:, gopher://, etc.
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (isBlockedHost(host)) return false;
  if (exactHosts.has(host)) return true;
  // google.<tld>: exigimos que la ruta sea de Maps (/maps…).
  if (googleMapsTld.test(host)) return u.pathname.startsWith("/maps");
  return false;
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Preflight CORS.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Usa POST con { url }" }, 405);
  }

  // Parseo del body.
  let url: unknown;
  try {
    const body = await req.json();
    url = body?.url;
  } catch {
    return json({ error: "Body JSON inválido" }, 422);
  }

  if (typeof url !== "string" || url.trim() === "") {
    return json({ error: "Falta el campo 'url' (string)" }, 422);
  }

  // Allowlist (anti-SSRF): rechazamos antes de hacer fetch cualquier URL que no
  // sea un enlace https de Google Maps. 400 (Bad Request) porque es input inválido,
  // no un fallo al resolver. Evita que la función sirva de proxy a la red interna.
  if (!isAllowedMapsUrl(url)) {
    return json({ error: "La URL no es un enlace de Google Maps" }, 400);
  }

  // Sigue las redirecciones del enlace corto hasta la URL final.
  let finalUrl: string;
  try {
    const res = await fetch(url, { redirect: "follow" });
    finalUrl = res.url || url;
    // Drenamos el cuerpo para no dejar la conexión colgada.
    await res.body?.cancel();
  } catch (_err) {
    // No degradamos a 500 mudo: devolvemos un 422 explicativo.
    return json({ error: "No se pudo seguir el enlace" }, 422);
  }

  // La URL final tras seguir redirecciones también debe ser de Google Maps: un
  // acortador permitido (goo.gl) podría, en teoría, redirigir fuera. Si el destino
  // no está en la allowlist, no parseamos su contenido (defensa en profundidad).
  if (!isAllowedMapsUrl(finalUrl)) {
    return json({ error: "El enlace redirige fuera de Google Maps" }, 400);
  }

  // Intentamos extraer coordenadas tanto de la URL final como de la original.
  const coords = parseLatLng(finalUrl) ?? parseLatLng(url);
  if (!coords) {
    return json({ error: "No se encontraron coordenadas en la URL" }, 422);
  }

  return json(coords, 200);
});
