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

  // Intentamos extraer coordenadas tanto de la URL final como de la original.
  const coords = parseLatLng(finalUrl) ?? parseLatLng(url);
  if (!coords) {
    return json({ error: "No se encontraron coordenadas en la URL" }, 422);
  }

  return json(coords, 200);
});
