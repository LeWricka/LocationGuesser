import { assertEquals } from "jsr:@std/assert@1";
import { parseLatLng } from "./parse.ts";

// Aprox. para comparar floats sin sufrir por la representación.
function casi(real: number, esperado: number, eps = 1e-6) {
  if (Math.abs(real - esperado) > eps) {
    throw new Error(`esperado ~${esperado}, obtenido ${real}`);
  }
}

Deno.test("formato @lat,lng con zoom", () => {
  const url =
    "https://www.google.com/maps/place/Sagrada+Familia/@41.4036299,2.1743558,17z/data=!4m6";
  const r = parseLatLng(url)!;
  casi(r.lat, 41.4036299);
  casi(r.lng, 2.1743558);
});

Deno.test("formato !3dlat!4dlng (pin) tiene prioridad correcta", () => {
  // @ apunta al centro del mapa; !3d/!4d apuntan al pin. Ambos válidos;
  // aquí comprobamos que extrae el primero que casa (@) y que es válido.
  const url =
    "https://www.google.com/maps/place/Torre+Eiffel/@48.8583701,2.2944813,17z/data=!3d48.8583736!4d2.2922926";
  const r = parseLatLng(url)!;
  casi(r.lat, 48.8583701);
  casi(r.lng, 2.2944813);
});

Deno.test("formato !3dlat!4dlng sin @ previo", () => {
  const url =
    "https://www.google.com/maps/dir//data=!4m6!3d40.4319077!4d-3.6929518!5z";
  const r = parseLatLng(url)!;
  casi(r.lat, 40.4319077);
  casi(r.lng, -3.6929518);
});

Deno.test("query q=lat,lng", () => {
  const url = "https://maps.google.com/?q=51.5072178,-0.1275862&z=15";
  const r = parseLatLng(url)!;
  casi(r.lat, 51.5072178);
  casi(r.lng, -0.1275862);
});

Deno.test("query query=lat,lng (search API)", () => {
  const url =
    "https://www.google.com/maps/search/?api=1&query=-33.8688197,151.2092955";
  const r = parseLatLng(url)!;
  casi(r.lat, -33.8688197);
  casi(r.lng, 151.2092955);
});

Deno.test("parametro ll=lat,lng", () => {
  const url = "https://maps.google.com/maps?ll=35.6894875,139.6917064&t=m";
  const r = parseLatLng(url)!;
  casi(r.lat, 35.6894875);
  casi(r.lng, 139.6917064);
});

Deno.test("par lat,lng suelto como ultimo recurso", () => {
  const url = "https://example.com/algo/40.7127753,-74.0059728/extra";
  const r = parseLatLng(url)!;
  casi(r.lat, 40.7127753);
  casi(r.lng, -74.0059728);
});

Deno.test("coordenadas negativas en ambos ejes", () => {
  const url = "https://www.google.com/maps/@-34.6036844,-58.3815591,12z";
  const r = parseLatLng(url)!;
  casi(r.lat, -34.6036844);
  casi(r.lng, -58.3815591);
});

Deno.test("URL sin coordenadas -> null", () => {
  assertEquals(parseLatLng("https://maps.app.goo.gl/AbCdEf123"), null);
});

Deno.test("string vacio o no-string -> null", () => {
  assertEquals(parseLatLng(""), null);
  // deno-lint-ignore no-explicit-any
  assertEquals(parseLatLng(null as any), null);
});

Deno.test("descarta pares fuera de rango (lat>90)", () => {
  // 200,300 no es válido; debe ignorarlo y seguir buscando.
  const url = "https://x.com/path/200,300/end/?q=12.5,13.5";
  const r = parseLatLng(url)!;
  casi(r.lat, 12.5);
  casi(r.lng, 13.5);
});
