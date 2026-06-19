# LocationGuesser — Pivote a GeoGuessr con Street View

**Fecha:** 19 junio 2026 · **Estado:** propuesta de rediseño (investigacion cerrada, lista para crear issues)

> **Decision del usuario:** pivotamos de "el creador sube una **foto**" a **"el creador elige una ubicacion y los demas exploran un panorama de Street View interactivo"** (el GeoGuessr clasico, pero con los sitios que eligen tus amigos del viaje).

---

## 0. Que cambia de vision (y que NO)

Este documento **revierte explicitamente** el diferenciador central del [aterrizaje de producto](aterrizaje-producto.md): alli el angulo defendible era *"fotos reales de tus amigos, no Street View abstracto"* (seccion 2, "Hueco"). **Esa decision queda anulada.** Ahora el producto es GeoGuessr con Street View, donde el valor no esta en la foto sino en **que las ubicaciones las eligen los amigos del viaje** (no un mapa global random) y en la **capa social asincrona** (grupo, histórico, clasificacion del viaje) que ya construimos en la [prueba de un dia](prueba-de-un-dia.md).

| Eje | Antes (v0.2 foto) | Ahora (pivote SV) |
|-----|-------------------|-------------------|
| Contenido del reto | Foto subida por el creador | Ubicacion (lat/lng) + panorama de Street View |
| Como adivinas | Miras una foto fija | **Exploras** un panorama 360 movible (girar, mirar, avanzar por la calle) |
| Diferenciador | "Las fotos de tus amigos" | "Los **sitios** de tus amigos, en GeoGuessr" + capa social |
| Coste | ~0 EUR (Storage Supabase) | Requiere **API key de Google Maps con facturacion** (free tier amplio para un grupo) |
| Privacidad | EXIF/GPS de la foto era sensible | Desaparece el riesgo de EXIF; SV es imagen publica de Google |

**Por que tiene sentido el pivote:** la friccion de creacion baja (no hay que sacar/subir/comprimir foto ni estripar EXIF), el realismo del "estar alli" sube (panorama explorable), y elimina el riesgo de privacidad de la foto. El coste es introducir una dependencia de Google con facturacion (mitigado por el free tier, ver seccion 4).

---

## 1. Mecanica de GeoGuessr (ronda individual)

El bucle de una ronda basica de GeoGuessr es:

1. El jugador **aparece dentro de un panorama de Street View interactivo**: puede **girar la camara (pan), mirar arriba/abajo, hacer zoom y avanzar por la calle** (mover entre panoramas enlazados) para buscar pistas (vegetacion, idioma de carteles, lado de conduccion, sol). [[GeoGuessr — Wikipedia](https://en.wikipedia.org/wiki/GeoGuessr)] [[ArchDaily](https://archdaily.com/963797/geoguessr-game-uses-street-view-to-create-a-geographical-puzzle)]
2. Cuando cree saber donde esta, **abre un mapa mundial y coloca un pin** en su mejor estimacion. [[GeoGuessr — Wikipedia](https://en.wikipedia.org/wiki/GeoGuessr)]
3. **Confirma** ("Make Guess"). Se **revela la ubicacion real**, la **distancia** entre su pin y el punto, y los **puntos** ganados. [[GeoGuessr — Wikipedia](https://en.wikipedia.org/wiki/GeoGuessr)]
4. La puntuacion es **0–5000 puntos por ronda, decae exponencialmente con la distancia**: `Score = 5000 · e^(−distancia_km / 2000)`. Un acierto dentro de 50 km da >4800 puntos. [[GeoGuessr — Wikipedia](https://en.wikipedia.org/wiki/GeoGuessr)]

**Esto encaja perfecto con lo que ya tenemos:** nuestro scoring es literalmente `5000·e^(−km/2000)` (el mismo de GeoGuessr) y nuestro flujo de adivinar (pin en Leaflet → revelar → distancia) ya implementa los pasos 2–4. Lo unico **nuevo** es el paso 1: sustituir la foto fija por el **panorama explorable**.

Ignoramos los modos competitivos (Battle Royale, Duels, etc.); queremos la ronda basica, que es lo que ya modela nuestra app asincrona.

---

## 2. Integrar Street View interactivo en React

### 2.1 Que API y por que requiere facturacion

El panorama **movible** (no una imagen estatica) lo da la **Google Maps JavaScript API**, clase **`google.maps.StreetViewPanorama`**. Es la unica forma soportada y oficial de tener el panorama 360 interactivo embebido en una web. (La *Street View Static API* devuelve solo una imagen fija — no sirve para explorar.)

Usar `StreetViewPanorama` consume el SKU **"Dynamic Street View"** y **requiere una API key con cuenta de facturacion activa** (tarjeta asociada en Google Cloud), aunque haya free tier. Sin facturacion habilitada, la API no carga.

### 2.2 Libreria recomendada para React 19 + Vite

| Criterio | `@vis.gl/react-google-maps` | `@react-google-maps/api` |
|----------|------------------------------|---------------------------|
| Recomendacion de Google | **Si** — Google la promociona oficialmente en su blog como la libreria React para Maps [[Google Maps Platform blog](https://mapsplatform.google.com/resources/blog/streamline-the-use-of-the-maps-javascript-api-within-your-react-applications/)] | No |
| Gobernanza | OpenJS / vis.gl (deck.gl), no propiedad privada [[GitHub discussion #163](https://github.com/visgl/react-google-maps/discussions/163)] | Mantenida por un individuo |
| Mantenimiento | Activo: **v1.8.3 (abril 2026)**, 58 releases [[GitHub](https://github.com/visgl/react-google-maps)] | Menos activo |
| React 19 | **Si** — `peerDependencies` incluyen `^19.0` [[package.json](https://raw.githubusercontent.com/visgl/react-google-maps/main/package.json)] | Compatible pero sin endorsement |
| Carga de la API | Hook `useMapsLibrary()` + `<APIProvider>` carga el loader y librerias bajo demanda [[GitHub](https://github.com/visgl/react-google-maps)] | Loader propio |

**Recomendacion: `@vis.gl/react-google-maps`.** Es la que recomienda Google, soporta React 19, esta bien mantenida y bajo gobernanza de OpenJS.

**Matiz importante de implementacion:** vis.gl **no expone un componente `<StreetViewPanorama>`** propio (a dia de hoy expone `<Map>`, `<AdvancedMarker>`, `<InfoWindow>`, geometria, y los hooks `useMap`/`useMapsLibrary`). El panorama se monta usando la **clase nativa** `google.maps.StreetViewPanorama` sobre un `ref`, mientras vis.gl gestiona el loader y el contexto. Patron:

```
// pseudocodigo (NO codigo de la app — solo ilustra el patron)
const streetViewLib = useMapsLibrary('streetView')   // carga la libreria
const ref = useRef<HTMLDivElement>(null)
useEffect(() => {
  if (!streetViewLib || !ref.current) return
  new streetViewLib.StreetViewPanorama(ref.current, {
    position: { lat, lng },
    pov: { heading, pitch: 0 },
    addressControl: false,        // ocultar la direccion (= spoiler)
    showRoadLabels: false,        // ocultar nombres de calle (= spoiler)
    fullscreenControl: false,
  })
}, [streetViewLib, lat, lng, heading])
```

> Detalle clave de juego: hay que **ocultar los controles que revelan la respuesta** (`addressControl`, `showRoadLabels`, el link de "report a problem" que muestra direccion). GeoGuessr hace exactamente esto.

### 2.3 Crear el reto (elegir ubicacion SV)

El creador elige el punto y **encajamos el panorama mas cercano** antes de guardar:

1. El creador coloca el punto (reutilizamos los metodos que ya tenemos: clic en mapa, GPS, busqueda Nominatim, pegar URL de Google Maps — ver [prueba de un dia §6](prueba-de-un-dia.md)).
2. Llamamos a **`StreetViewService.getPanorama({ location, radius, preference })`** para encontrar el panorama mas cercano: `radius` en metros (default 50; recomendado ≤1 km con `preference: NEAREST`), `preference: BEST` para el panorama "mas representativo" del entorno. [[Street View Service — Google](https://developers.google.com/maps/documentation/javascript/streetview)] [[StreetViewService reference](https://developers.google.com/maps/documentation/javascript/reference/street-view-service)]
3. Si hay panorama, guardamos: **`lat`/`lng` del punto real** (la respuesta), opcionalmente el **`pano_id`** (panorama exacto, robusto frente a cambios de cobertura) y el **`heading`** inicial (POV) para que todos arranquen mirando lo mismo.
4. **Cobertura:** si `getPanorama` devuelve `ZERO_RESULTS` (no hay SV cerca), avisamos al creador: *"No hay Street View cerca de este punto. Prueba a mover el pin a una calle cercana."* — y no dejamos crear el reto hasta que haya panorama. Opcional: ampliar el `radius` progresivamente y mostrar donde caera realmente el panorama.

### 2.4 Jugar (panorama interactivo + adivinar)

1. Montamos `StreetViewPanorama` en la **posicion/`pano_id` guardados**, con el POV inicial (`heading`) y los controles spoiler ocultos. El jugador puede **girar, mirar y avanzar** por la calle.
2. **El mapa de adivinar sigue siendo Leaflet** (ya lo tenemos): el jugador coloca su pin en un mapa **aparte** del panorama (split o panorama a pantalla con un mini-mapa que se expande, estilo GeoGuessr).
3. Al confirmar, **scoring por distancia con la formula actual** (`5000·e^(−km/2000)`, haversine) — **sin cambios**. Se revela ubicacion real + distancia + puntos (paso 3–4 de §1).

> Decision de diseno: Leaflet (gratis, OSM) para **adivinar** y Google SV solo para **explorar**. Asi el unico SKU de Google que consumimos es Dynamic Street View; el mapa de adivinar no añade coste de Google.

### 2.5 Seguridad de la API key (clave en cliente, expuesta)

La key de Maps JS **viaja en el cliente y es visible** (esta en el bundle). No se puede ocultar. La defensa estandar y recomendada por Google es **restringir la key por referrer HTTP** al dominio de produccion, para que aunque la copien no la puedan usar desde otro sitio: [[Google Maps Platform best practices](https://mapsplatform.google.com/resources/blog/google-maps-platform-best-practices-restricting-api-keys/)] [[Google security guidance](https://developers.google.com/maps/api-security-best-practices)]

- **Application restriction → HTTP referrers (web sites):** limitar a nuestro dominio Vercel. Patrones:
  - `https://locationguesser-sage.vercel.app/*`
  - `https://*.vercel.app/*` solo si queremos cubrir las preview deployments (mas laxo; valorar).
  - `http://localhost:*/*` para desarrollo local.
- **API restriction:** restringir la key a **solo "Maps JavaScript API"** (y Street View va dentro de ella). No habilitar nada mas en esa key.
- **Una key por uso:** no reutilizar esta key client-side para nada server-side. [[Google security guidance](https://developers.google.com/maps/api-security-best-practices)]
- **Cuota/alerta de presupuesto:** poner un budget alert en Cloud Billing y, si es posible, un cap de cuota diaria por SKU para acotar abuso.

> Aviso: las **preview deployments de Vercel** generan URLs con hash (`*-git-*.vercel.app`). Si las queremos jugables, hay que cubrirlas con un patron `*.vercel.app` (mas abierto) o jugar solo en el dominio estable. Recomendacion: restringir al dominio estable + localhost; las previews no necesitan SV real.

---

## 3. Coverage / realismo de Street View

Limitaciones reales a tener en cuenta para "los sitios del viaje": [[Google Street View coverage — Wikipedia](https://en.wikipedia.org/wiki/Google_Street_View_coverage)]

- **Interiores y rincones sin calle:** SV cubre sobre todo **vias rodadas**. Un mirador a pie, una cala, una habitacion de hotel, un sendero de montaña pueden **no tener cobertura**. Algunos interiores de landmarks existen, pero no es lo normal.
- **Zonas rurales:** cobertura limitada a carreteras principales; pueblos pequeños o pistas pueden no estar.
- **Desfase temporal:** el panorama puede ser de hace años (otra estacion, obras distintas). No es "lo que tu amigo ve ahora".

**Como lo gestionamos:**
- En **crear**, el chequeo de `getPanorama` (§2.3) **garantiza que solo se crean retos donde SI hay SV**. El creador ve el aviso si su punto no tiene cobertura y mueve el pin.
- Comunicar en la UI que el reto usa "la calle mas cercana con Street View", no necesariamente el punto exacto donde estuvo (el pin guardado sigue siendo el real, para el scoring).
- **Trade-off del pivote frente a fotos:** la foto cubre el 100% de los sitios (cala, interior, cima); SV NO. Algunos "sitios del viaje" no seran jugables con SV. Es la principal contrapartida del pivote — aceptable si la mayoria de retos son en zonas con calle, pero hay que medirlo. (Posible "next": modo hibrido foto **o** SV; fuera de alcance de este pivote.)

---

## 4. Prerrequisito: API key de Google Maps + facturacion

### 4.1 Coste estimado para un grupo de amigos

Pricing 2026 vigente (el credito universal de 200 $/mes **se elimino el 1 marzo 2025** y se sustituyo por **free tier por SKU**): [[Google core services pricing list](https://developers.google.com/maps/billing-and-pricing/pricing)] [[Usage and billing — Google](https://developers.google.com/maps/billing-and-pricing/sku-details)]

| SKU | Categoria | Free/mes | Precio (0–100k) | Evento facturable |
|-----|-----------|----------|------------------|-------------------|
| **Dynamic Street View** | Pro | **5.000** eventos | **14,00 $ / 1.000** | carga de panorama exitosa |
| Dynamic Maps (no lo usamos) | Essentials | 10.000 | 7,00 $ / 1.000 | carga de mapa |

Tiers de volumen de Dynamic Street View: 14 $ (≤100k) · 11,20 $ (100k–500k) · 8,40 $ (500k–1M) · 4,20 $ (1M–5M) · 1,05 $ (5M+) por 1.000. [[Google core services pricing list](https://developers.google.com/maps/billing-and-pricing/pricing)]

**Estimacion para nuestro caso (grupo de amigos):**
- 1 carga de panorama = 1 evento facturable. Un jugador juega un reto = ~1 carga (mas si recarga). Con creacion (el `getPanorama` del service tambien puede contar) seamos conservadores: **~2 cargas por reto-jugador**.
- Grupo de 10 personas, 20 retos/mes, todos juegan: 10 × 20 × 2 ≈ **400 cargas/mes**. Aun con 5 grupos activos a la vez: **~2.000 cargas/mes**.
- **5.000 eventos/mes gratis** → cabemos holgadamente **dentro del free tier (coste 0 EUR)** para decenas/cientos e incluso bajos miles de cargas.
- Para hacer numeros si crecieramos: 10.000 cargas/mes = 5.000 facturables × 14 $/1.000 ≈ **70 $/mes**. Pero eso es ~250 retos jugados por 20 personas — muy por encima de un grupo de viaje.

**Conclusion de coste: 0 EUR para el uso real previsto** (grupos de amigos), gracias a los 5.000 panoramas gratis/mes. El riesgo es **abuso de la key expuesta** → mitigado por restriccion de referrer + budget alert (§2.5).

### 4.2 Pasos de creacion de la key (Google Cloud)

1. **Crear proyecto** en [Google Cloud Console](https://console.cloud.google.com) (p.ej. `locationguesser`).
2. **Habilitar facturacion:** asociar una cuenta de facturacion (tarjeta) al proyecto. Sin esto, Maps JS no carga aunque haya free tier.
3. **Habilitar la API:** APIs & Services → habilitar **"Maps JavaScript API"** (Street View va incluida en ella).
4. **Crear credencial → API key.**
5. **Restringir la key** (§2.5):
   - *Application restrictions* → **HTTP referrers** → `https://locationguesser-sage.vercel.app/*` y `http://localhost:*/*`.
   - *API restrictions* → **Restrict key** → solo **Maps JavaScript API**.
6. **Budget alert** en Cloud Billing (p.ej. aviso a 5 $/mes) y, si procede, cap de cuota diaria por SKU.
7. **Guardar la key** como env del front: `VITE_GOOGLE_MAPS_API_KEY` en `web/.env.local` (gitignoreado) y en Vercel. Documentar en `web/.env.example`. **Es publica por diseño** (va al cliente); la seguridad la da la restriccion de referrer, no el secreto — consistente con la regla 0 del playbook (la publishable de Supabase tambien es publica).

---

## 5. Que se reutiliza y que cambia

### 5.1 Se reutiliza tal cual (el grueso de v0.2)
- **Grupos** (`#g=…`, codigo en el enlace, histórico y clasificacion del viaje).
- **Identidad sin login** (nombre + PIN, `client_id`, candado blando).
- **Mapa de adivinar (Leaflet)** + colocacion de pin.
- **Scoring** (`5000·e^(−km/2000)` + haversine) — identico a GeoGuessr, **cero cambios**.
- **Clasificacion general, retos en vivo, anteriores, Realtime** (toasts "X acaba de votar", marcador en vivo).
- **Regla anti-trampas** (antes de votar ves puntos pero no la ubicacion ni pines).
- **Dos relojes** (deadline del reto + tiempo por jugada con pop-up "Empezar").
- **Stack:** React+Vite+TS, Supabase (Postgres/Realtime/RLS), Vercel.

### 5.2 Cambia
- **Crear reto:** en vez de subir/comprimir/estripar-EXIF una foto → **elegir ubicacion** + `getPanorama` para encajar SV + chequeo de cobertura. **Desaparece todo el flujo de imagen** (compresion en cliente, EXIF, Storage upload).
- **Jugar:** en vez de mostrar la foto → montar **`StreetViewPanorama` interactivo** con controles spoiler ocultos.
- **Nueva dependencia:** `@vis.gl/react-google-maps` + API key de Google con facturacion (§4).
- **Modelo de datos:** ver §5.3.

### 5.3 Cambio de esquema propuesto (`challenges`)

Esquema actual (v0.2): `challenges(id, group_id, title, lat, lng, image_path, guess_seconds, deadline_at, created_at, created_by)`.

**Propuesta:**

```sql
-- Migracion: challenges pasa de foto a Street View
ALTER TABLE challenges ADD COLUMN sv_pano_id   text;      -- panorama exacto (robusto)
ALTER TABLE challenges ADD COLUMN sv_heading   real;      -- POV inicial (grados), opcional
ALTER TABLE challenges ADD COLUMN sv_pitch     real;      -- opcional, normalmente 0
-- image_path: ver decision abajo
ALTER TABLE challenges ALTER COLUMN image_path DROP NOT NULL;  -- si hoy es NOT NULL
```

- `lat`/`lng` se **mantienen** (siguen siendo la respuesta para el scoring) — no cambian.
- `sv_pano_id`: guardar el panorama exacto hace el reto **reproducible** aunque Google reorganice panoramas cercanos. `position` (lat/lng) sirve de fallback si el pano caduca.
- `sv_heading`/`sv_pitch`: opcionales; si no se guardan, el jugador arranca con un POV por defecto.

**¿Mantener `image_path` opcional o eliminarlo?**
- **Recomendacion: mantenerlo opcional (`NULL`), no eliminarlo ahora.** Dos razones: (1) **no rompe** los retos historicos con foto ya creados en el grupo (la pagina de "anteriores" los sigue reconstruyendo); (2) deja la puerta abierta a un **modo hibrido futuro** (reto con foto cuando no hay SV — la principal contrapartida de §3). Coste de mantenerlo: una columna nullable, trivial. Eliminarlo seria un cambio destructivo sin beneficio real hoy.
- A nivel de UI/logica, los retos nuevos no setean `image_path`; los viejos lo conservan. El render decide: si hay `sv_pano_id`/`lat-lng` SV → panorama; si solo `image_path` → foto (modo legacy).

> Bucket `images` de Storage: se mantiene (lo usan los retos legacy). No se borra.

---

## 6. Plan de issues (slices verticales, Shape Up ligero)

Priorizadas para el orquestador. Cada una = un area que no se pisa (ver playbook §1). Apetito en semanas.

| # | Slice (issue) | Area | Prioridad | Apetito | Notas |
|---|---------------|------|-----------|---------|-------|
| 1 | **Prerrequisito: API key de Google Maps + facturacion + restriccion referrer** | infra/docs | **P0** | ~0.5 sem | Bloquea todo lo demas. Crear proyecto, habilitar Maps JS, key restringida, env en Vercel + `.env.example`. Salida: key funcionando en local y prod. |
| 2 | **Migracion de esquema `challenges`** (sv_pano_id/heading/pitch + `image_path` nullable) | `supabase/**` | **P0** | ~0.5 sem | Migracion versionada + regenerar `database.types.ts`. Independiente de la UI. |
| 3 | **Crear reto con Street View** (elegir punto → `getPanorama` → guardar lat/lng+pano+heading, chequeo de cobertura) | `web/src/features` + `lib` | **P0** | 1–1.5 sem | Reutiliza los selectores de punto existentes. Bloquea por #1 y #2. |
| 4 | **Jugar: panorama interactivo** (`StreetViewPanorama` con controles spoiler ocultos) + adivinar en Leaflet + scoring existente | `web/src/features` | **P0** | 1–1.5 sem | El corazon del pivote. Bloquea por #1 y #2. Scoring sin tocar. |
| 5 | **Render legacy de fotos** (retos antiguos con `image_path` siguen reconstruibles en "anteriores") | `web/src/features` | **P1** | ~0.5 sem | Garantiza no romper historico. Bloquea por #2. |
| 6 | **Pulido de cobertura/UX** (aviso "no hay SV cerca", POV por defecto, mini-mapa estilo GeoGuessr, ocultar bien spoilers) | `web/src/ui` | **P1** | ~0.5–1 sem | Tras #3 y #4. |
| 7 | **Budget alert + verificacion de restriccion + smoke E2E con SV** | infra/CI/docs | **P2** | ~0.5 sem | Confirmar que la key falla fuera del dominio; E2E que carga un panorama. |

Orden sugerido: **1 → 2 → (3 ∥ 4) → 5 → 6 → 7**. #3 y #4 pueden ir en paralelo (areas distintas) una vez #1 y #2 esten.

---

## 7. Recomendacion final

**Adelante con el pivote a Street View, con `@vis.gl/react-google-maps`.** Resumen de la decision:

- **Mecanica:** ronda GeoGuessr clasica (explorar panorama → pin en mapa → revelar distancia + puntos). Encaja con nuestro scoring (`5000·e^(−km/2000)`) y flujo de adivinar **sin cambios**.
- **Libreria:** `@vis.gl/react-google-maps` (recomendada por Google, soporta React 19, bien mantenida). El panorama se monta con la clase nativa `StreetViewPanorama` sobre un ref; la libreria gestiona el loader.
- **Coste:** **0 EUR** para el uso real (5.000 panoramas gratis/mes cubren grupos de amigos de sobra; ~70 $/mes solo si llegaramos a ~10k cargas/mes).
- **Se reutiliza** casi todo v0.2 (grupos, identidad, scoring, Leaflet de adivinar, ranking, Realtime, anti-trampas, relojes). **Cambia** crear (elegir ubicacion + `getPanorama`) y jugar (panorama interactivo), y el esquema de `challenges` (añadir `sv_pano_id`/`heading`/`pitch`; `image_path` pasa a opcional, no se elimina).
- **Prerrequisito (P0, bloquea todo):** API key de Google Maps con **facturacion activa**, restringida por **referrer HTTP** al dominio Vercel + localhost, y solo "Maps JavaScript API"; budget alert por seguridad.
- **Principal contrapartida a vigilar:** cobertura de SV — algunos sitios del viaje (calas, interiores, cimas) no tendran panorama. El chequeo `getPanorama` en creacion lo contiene; un modo hibrido foto/SV queda como "next".
