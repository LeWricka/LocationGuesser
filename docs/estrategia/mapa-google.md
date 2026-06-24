# Cambiar el mapa de adivinar a Google Maps — exploracion

**Fecha:** 24 junio 2026 · **Estado:** exploracion (NO implementado) · **Tipo:** documento de decision

> Pregunta de producto: el mapa de adivinar + el Street View son el **core** del juego (GeoGuessr-like). El usuario, comparando con GeoGuessr, ve que un mapa de Google (POIs, bares, mas rapido, ligado al Street View) mejora **mucho** la experiencia; el Leaflet+OSM actual se queda corto. ¿Cambiamos a Google Maps? ¿Cuanto cuesta? ¿Hay riesgo de factura? ¿Alternativas (MapLibre)?

---

## 0. TL;DR (recomendacion)

- **Recomendacion:** migrar **solo el mapa de adivinar** a **Google Maps JS** (Dynamic Maps), reusando el `@vis.gl/react-google-maps` y el `APIProvider` que **ya estan montados** para Street View. Mismo SDK, misma key, POIs nativos y coherencia visual con el panorama. Mapa de resultado y selector de crear: migrar despues (fase 2), no son criticos.
- **Veredicto de coste:** **bajo riesgo** a nuestra escala (grupo de amigos). El SDK de Maps **ya se carga** en cada partida (Street View). Sumar el mapa de adivinar añade **cargas de "Dynamic Maps"** (~$7/1.000 tras 10.000 gratis/mes) y, si usamos **Places Autocomplete**, sesiones de Places. Con cientos o pocos miles de partidas/mes seguimos **dentro del tramo gratuito**. El budget de 5 € de `docs/operativa.md` cubre el pico por abuso. La factura solo se dispara si la key publica se abusa masivamente — mitigado por restriccion de referrer + budget.
- **Alternativa si el coste preocupa:** **MapLibre GL + MapTiler** (vector, POIs, 100.000 cargas gratis/mes, sin tarjeta). Mejor que el Leaflet actual en POIs/fluidez y mas barato que Google. **Pero** no se integra con Street View (seguiriamos con dos SDK distintos) y los POIs no son los de Google (los "bares" que el usuario quiere son la marca Google). 
- **Decision final (ver §6):** **Google Maps JS para el mapa de adivinar.** El argumento decisivo no es el coste (ambos son baratos a nuestra escala) sino que **el Street View YA es Google y ya esta pagado**: unificar el mapa con el panorama bajo un solo SDK reduce complejidad, da los POIs/bares que pide el usuario, y la integracion mapa↔panorama es nativa. MapLibre solo ganaria si quisieramos **quitar** Google del todo, y no es el caso (el panorama es Google y es core).

---

## 1. Inventario actual — como usamos los mapas hoy

Hoy conviven **dos motores de mapa**:

### 1.1 Leaflet + react-leaflet (raster, OSM/CARTO) — el mapa 2D

| Donde | Fichero | Que hace |
|---|---|---|
| **Adivinar** | `web/src/features/play/PlayMap.tsx` | Mapa mundi (zoom 2). Clic coloca el 📍 del jugador. Al revelar: dibuja 🎯 (respuesta), 📍 voto, **linea animada** pin→🎯 (SVG dashoffset) y **encuadre** de ambos puntos (`FitToReveal`, `fitBounds` con `pad(0.3)`, `maxZoom 12`). `AutoInvalidateSize` (ResizeObserver) re-mide al expandir el panel. |
| **Resultado** (grupo) | `web/src/features/group/RevealMap.tsx` | Mini-mapa del revelado: 🎯 + 📍 de cada jugador. `FitBounds` encuadra todos los votos. |
| **Selector al crear** | `web/src/features/create/MapPicker.tsx` | Clic coloca el punto. Toggle **Callejero (CARTO Voyager)** / **Satelite (Esri World Imagery)**. `Recenter` (flyTo) al elegir una sugerencia de busqueda. |

**Tiles (sin API key):**
- Callejero: `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png` (CARTO, gratis con atribucion).
- Satelite: Esri `World_Imagery` (gratis con atribucion).
- Anti-gris al hacer zoom: `maxNativeZoom=19` + reescalado, `keepBuffer=6`, `updateWhenZooming=false`, tiles 256px sin retina.

**CSS / z-index:** `.lg-map` en `index.css` (alto 340/420px, `isolation: isolate` para **contener los z-index internos de Leaflet** ~1000 y que no tapen el buscador ni el selector de capa). Pines = `L.divIcon` con emoji (📍/🎯) + animacion `lg-pin-drop`. Controles de zoom tematizados (`.leaflet-bar`).

### 1.2 Geocodificacion: Nominatim (OSM, gratis)

- En `CreateChallenge.tsx`: autocompletado con **debounce 300ms**, minimo 3 caracteres, `fetch` directo a `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=…` con `AbortController`. Al elegir sugerencia → `setPoint` + `flyTo`.
- Tambien: **pegar enlace de Maps** (`resolveMapsUrl` en `web/src/lib/mapsUrl.ts`) — parser local de `@lat,lng`, `!3d!4d`, `?q=`, par suelto; enlaces cortos (`maps.app.goo.gl`) via Edge Function `resolve-maps-url`. **Esto es independiente del motor de mapa y NO cambia.**

### 1.3 Google Maps (Street View) — el panorama 3D, YA en produccion

| Donde | Fichero | Que hace |
|---|---|---|
| `main.tsx` | `<APIProvider apiKey={VITE_GOOGLE_MAPS_API_KEY}>` envuelve la app | **El SDK de Google Maps ya se carga en toda la app.** |
| **Jugar / crear** | `play/StreetViewPano.tsx`, `create/StreetViewPreview.tsx` | Montan `google.maps.StreetViewPanorama` nativo via `useMapsLibrary('streetView')`. |
| **Encaje** | `lib/streetview.ts` (`findPanorama`, `findPanoramaNear`) | `StreetViewService.getPanorama` encaja el lat/lng al panorama mas cercano (guarda `pano_id`). |

**Implicacion clave:** la app **ya depende de Google Maps Platform** y **ya consume Street View** en cada reto con panorama. La key `VITE_GOOGLE_MAPS_API_KEY` ya existe, ya esta restringida por referrer (`docs/operativa.md` §1) y ya tiene budget de 5 € (§2). Migrar el mapa 2D a Google **no introduce un proveedor nuevo**: usa el que ya esta.

### 1.4 Que se gana / que se pierde al cambiar el mapa 2D a Google

| | Leaflet+OSM/CARTO (hoy) | Google Maps JS |
|---|---|---|
| **POIs / bares / comercios** | Pobres (CARTO Voyager los pinta flojos; Esri satelite, ninguno) | **Ricos y reconocibles** (la marca Google que el usuario asocia a GeoGuessr) |
| **Coherencia con Street View** | Dos SDK distintos (Leaflet + Google) | **Un solo SDK**; mapa y panorama comparten estilo y datos |
| **Integracion mapa↔panorama** | Manual | Nativa (pegman, click-to-streetview, etc. si se quisiera) |
| **Fluidez / zoom** | Raster, parpadeo gris mitigado a mano | Vector, suave de serie |
| **Coste** | 0 € (tiles gratis) | Cargas de Dynamic Maps (ver §3) — gratis hasta 10k/mes |
| **API key** | No necesita | Necesita (ya la tenemos) |
| **Riesgo de factura** | Ninguno | Bajo, acotado por budget (ver §3) |
| **Atribucion** | OSM + CARTO/Esri (manual) | Logo Google + ToS (de serie) |
| **Offline / self-host** | Posible | No |

---

## 2. Propuesta con Google Maps JS (reusando `@vis.gl/react-google-maps`)

El paquete `@vis.gl/react-google-maps` (v1.8.3) **ya esta instalado** y el `APIProvider` **ya esta montado** en `main.tsx`. Da componentes React (`<Map>`, `<AdvancedMarker>`, `useMap`, `useMapsLibrary`) sobre el SDK oficial. No hay que añadir dependencias ni cargar otro loader.

### 2.1 Mapa de adivinar (`PlayMap`)

- `<Map>` de vis.gl con `defaultCenter={{lat:25,lng:0}}`, `defaultZoom={2}`, `gestureHandling: 'greedy'` (un dedo mueve, como hoy), `disableDefaultUI` salvo zoom, `mapId` (necesario para `AdvancedMarker` y para estilar POIs).
- **Pin del jugador:** `<AdvancedMarker>` con el emoji 📍 (HTML content) → mantiene el look actual. Click en el mapa (`map.addListener('click')` o `onClick` del `<Map>`) coloca/mueve el pin mientras `!locked`.
- **POIs:** con un `mapId` y estilo "POIs visibles" se ven bares/comercios — exactamente lo que pide el usuario. Se puede atenuar el ruido si distrae (estilo de POI por categoria).
- **Reset / mundo:** `defaultZoom={2}` y `worldCopyJump` equivalente con `restriction` opcional.

### 2.2 Mapa de resultado (dos puntos + linea + encuadre)

- 📍 voto y 🎯 respuesta como dos `<AdvancedMarker>`.
- **Linea** pin→🎯: `google.maps.Polyline` (via `useMapsLibrary('maps')`). La animacion de "trazado" actual (SVG dashoffset) **no es portable** directamente a la Polyline de Google (no expone el path SVG igual); alternativas: (a) animar con `symbol`/`icons` desplazandose por la linea, o (b) aceptar linea estatica (mas simple). **Tradeoff:** se pierde el detalle de la linea dibujandose; bajo apetito, se puede recrear luego.
- **Encuadre de ambos puntos:** `LatLngBounds` + `map.fitBounds(bounds, padding)` — equivalente directo del `FitToReveal`/`FitBounds` actual. El bug ya resuelto en Leaflet (encuadrar tras asentarse el layout) se replica esperando al `idle`/`tilesloaded` o con un `requestAnimationFrame`.
- **`RevealMap`** (todos los votos): mismo patron, N `<AdvancedMarker>` + `fitBounds`.

### 2.3 Selector al crear (`MapPicker`)

- `<Map>` con click → `onPick`. El toggle **Callejero/Satelite** se mapea a `mapTypeId: 'roadmap' | 'hybrid'` (hybrid = satelite con etiquetas; mejor que el Esri pelado de hoy).
- `Recenter`/`flyTo` → `map.panTo` + `map.setZoom`.

### 2.4 Busqueda: Google Places Autocomplete en vez de Nominatim

- Sustituir el `fetch` a Nominatim por **Places Autocomplete (New)** via `useMapsLibrary('places')`.
- **Beneficio:** resultados mas relevantes (incluye POIs/negocios, no solo direcciones), tolerante a errores tipograficos, mismo proveedor que el mapa.
- **Coste:** usar **session tokens** — con un token de sesion, las peticiones de autocompletado son gratis y solo se cobra el *Place Details* terminal (ver §3). Sin token, cada pulsacion cuenta como request facturable.
- **Tradeoff:** Nominatim es 0 € y nos sirve. Places es mejor UX pero introduce coste por sesion. **Decision:** el buscador no es lo que rompe la experiencia; **se puede dejar Nominatim en fase 1** y migrar Places solo si el buscador se siente pobre. (Reduce coste y riesgo.)

### 2.5 Beneficio transversal: un solo SDK

Hoy cargamos Google (Street View) **y** Leaflet. Migrar el 2D a Google deja **un unico motor de mapa**: menos bundle (se puede quitar `leaflet`, `react-leaflet`, `@types/leaflet`), un solo modelo mental, y la posibilidad de integraciones nativas mapa↔panorama (pegman) que con dos SDK son artesanales.

---

## 3. COSTE / billing (lo importante)

> Fuente de precios: Google Maps Platform, cambios de **marzo 2025** y lista de SKU 2026 (ver enlaces al final). **Aviso:** Google retiro el credito universal de **$200/mes** y lo sustituyo por **tramos gratuitos por SKU**. Verificar siempre en la consola de facturacion antes de decidir.

### 3.1 Modelo de cobro relevante

| SKU | Que lo dispara | Tramo gratis/mes | Precio tras el tramo |
|---|---|---|---|
| **Dynamic Maps** (Maps JS) | **Cada carga de mapa** (init del `<Map>` en una pagina) | **10.000** cargas | ~**$7 / 1.000** (10k–100k) |
| **Street View dinamico** (panorama) | Cada panorama mostrado | (incluido en Essentials) | ~**$14 / 1.000** (primeras 100k) |
| **Places Autocomplete (New)** | Sesion de autocompletado | Con **session token**: requests de autocomplete **gratis**; se cobra el *Place Details* terminal | *Place Details* ~ por 1.000; **sesion abandonada** se cobra ~**$2,83/1.000** requests |
| **Geocoding** (si se usara) | Cada geocodificacion | 10.000 | ~$5 / 1.000 |

> **Nota sobre el budget de `docs/operativa.md`:** alli se cita "~5.000 cargas/mes gratis de Street View". El detalle 2026 da **10.000 gratis/mes por SKU** (Essentials) tras el cambio de marzo 2025. En cualquier caso: a escala de grupo de amigos vamos **muy por debajo**. Conviene actualizar ese numero en operativa cuando se implemente.

### 3.2 Estimacion de impacto a nuestra escala

Cada **partida** (un jugador abre un reto y adivina) hoy ya consume:
- **1 Street View** (panorama del reto) — ya lo pagamos hoy.

Si migramos el mapa de adivinar a Google, cada partida añade:
- **1 carga de Dynamic Maps** (el mapa de adivinar). El mapa de resultado, si se migra, puede ser la **misma** instancia de `<Map>` re-encuadrada (no una segunda carga) o una segunda carga si es un componente aparte. Diseñar para **reusar la instancia** mantiene 1 carga/partida.

Y si migramos el buscador a Places:
- ~**1 sesion de Places** por reto **creado** (no por partida jugada; crear es mucho menos frecuente que jugar).

**Cuentas redondas (mapa de adivinar en Google, buscador en Nominatim):**

| Escenario | Partidas/mes | Cargas Dynamic Maps/mes | ¿Dentro de los 10k gratis? | Coste aprox. |
|---|---|---|---|---|
| Un grupo activo | ~200 | ~200 | Si | **0 €** |
| 10 grupos | ~2.000 | ~2.000 | Si | **0 €** |
| Viralidad moderada | ~10.000 | ~10.000 | Justo en el limite | **~0 €** |
| Pico/abuso | 50.000 | 50.000 | No (40k facturables) | ~$280 (~260 €) → **lo corta el aviso del budget** |

**Lectura:** mientras seamos lo que decimos ser (grupos de amigos), el mapa de adivinar en Google es **0 €**. El Street View ya consume su SKU hoy sin problema. El buscador en Nominatim sigue siendo 0 €.

### 3.3 ¿Riesgo de factura? Acotado, no nulo

- **La key es publica** (va en el cliente). Riesgo real = **abuso** (alguien usa nuestra key en su sitio o un bot recarga el mapa en bucle). 
- **Mitigaciones ya en sitio** (`docs/operativa.md`): (1) **restriccion por referrer HTTP** (solo `locationguesser-sage.vercel.app`, `*.vercel.app`, `localhost:5173`) → la key no funciona desde otros origenes; (2) **restriccion de API** (hoy solo Maps JavaScript API; al migrar habria que **añadir** lo que se use — Maps JS ya cubre Dynamic Maps y Street View del SDK; Places si se usa); (3) **budget de 5 €** con alerta por email al 50/90/100%.
- **Limite duro recomendado:** añadir **cuotas por dia** en la consola de Google (Quotas → "Map loads per day") como cinturon ademas del budget — el budget **avisa pero no corta**; la cuota **si corta** (el mapa deja de cargar ese dia, peor UX pero sin factura). Tradeoff a decidir: ¿preferimos "se rompe el mapa" o "llega una factura"? Para un proyecto de amigos, **cuota dura** es lo prudente.
- **No depender de la cuota como UX:** la cuota es defensa anti-abuso, no un limite operativo esperado.

### 3.4 ¿Compensa?

Si. El SDK ya esta pagado/cargado por Street View; el incremento marginal del mapa 2D es **0 € a nuestra escala** y mejora el core (POIs/bares, coherencia con el panorama). El riesgo de factura es **bajo y acotable** con referrer + cuota dura + budget.

---

## 4. Alternativas (por si el coste preocupa)

| Opcion | Motor | POIs | Street View | Coste a nuestra escala | Esfuerzo migracion | Notas |
|---|---|---|---|---|---|---|
| **Seguir con Leaflet+OSM** | Raster | Pobres | Sigue siendo Google aparte | **0 €** | 0 | No resuelve el problema (POIs flojos, dos SDK igual) |
| **Google Maps JS** *(recomendado)* | Vector | **Ricos (Google)** | **Mismo SDK** | 0 € (gratis hasta 10k/mes); riesgo acotado | Medio | Un solo motor; la marca que el usuario asocia a GeoGuessr |
| **MapLibre GL + MapTiler** | Vector | Buenos (OSM/MapTiler, no Google) | **NO** (seguiriamos con Google aparte) | **0 €** (100.000 cargas gratis/mes, sin tarjeta) | Medio-alto | Open source, sin lock-in, barato; pero NO unifica con el panorama y los POIs no son "los de Google" |
| **Mapbox GL** | Vector | Buenos (no Google) | NO | 50.000 cargas gratis/mes (pide tarjeta) | Medio-alto | Similar a MapLibre pero con lock-in y tarjeta; menos free tier |

**Comparativa breve experiencia vs coste vs esfuerzo:**

- **MapLibre+MapTiler** es la mejor alternativa "anti-coste": vector, POIs decentes, **100k cargas gratis/mes** (el doble que Mapbox y sin tarjeta), open source (sin lock-in, self-host posible). Mejora el Leaflet actual en fluidez/POIs **y es mas barato que Google**.
- **Pero** no resuelve la pieza que mas importa aqui: **el Street View es y seguira siendo Google**. Con MapLibre mantendriamos **dos SDK** (MapLibre para el 2D + Google para el panorama) — justo la complejidad que Google nos quita. Y los "bares" que el usuario quiere ver son los de la marca Google (asociacion mental con GeoGuessr); los POIs de OSM/MapTiler son buenos pero no identicos.
- **Mapbox** no aporta sobre MapLibre para nuestro caso (menos free tier, pide tarjeta, lock-in).

**Recomendacion de la seccion:** si el coste de Google fuera un bloqueante (no lo es a nuestra escala), **MapLibre+MapTiler** seria el plan B. Como **no** es bloqueante y el panorama ya es Google, **Google Maps JS gana** por unificacion de SDK y POIs de marca.

---

## 5. Alcance e impacto en el codigo

### 5.1 Ficheros que cambian

| Fichero | Cambio |
|---|---|
| `web/src/features/play/PlayMap.tsx` | Reescribir con `<Map>` + `<AdvancedMarker>` de vis.gl. Recrear `ClickHandler`, `FitToReveal`, `DrawnLine`, `AutoInvalidateSize` con la API de Google. |
| `web/src/features/group/RevealMap.tsx` | Idem (markers + `fitBounds`). |
| `web/src/features/create/MapPicker.tsx` | `<Map>` + toggle `roadmap`/`hybrid` + `panTo`. |
| `web/src/index.css` | `.lg-map` se mantiene (caja/altura/`isolation`); ajustar reglas `.leaflet-*` → equivalentes Google (o quitarlas). Pines emoji: pasar de `L.divIcon` a contenido HTML de `AdvancedMarker`. |
| `web/src/features/create/CreateChallenge.tsx` | (Solo si migramos buscador) reemplazar el `fetch` a Nominatim por Places Autocomplete con session token. **Opcional en fase 1.** |
| `web/package.json` | Al final, **quitar** `leaflet`, `react-leaflet`, `@types/leaflet`. |
| `web/e2e/*.spec.ts` | Actualizar el ruido tolerado (ya incluye `maps.googleapis.com`/`maps.gstatic.com`); revisar selectores. |
| `docs/operativa.md` | Actualizar restriccion de API (añadir Places si se usa), cuota dura, y el "~5.000 → 10.000" gratis. |

**NO cambia:** `lib/mapsUrl.ts` (parser de enlaces), `lib/streetview.ts` y los componentes de Street View (ya son Google), `lib/geo.ts` (haversine/scoring), el modelo de datos Supabase.

### 5.2 ¿Incremental? Si — esa es la gran ventaja

Como el SDK de Google **ya esta cargado**, se puede migrar **un mapa cada vez** sin tocar el resto:

1. **Fase 1:** solo `PlayMap` (el mapa de adivinar — el que mas se usa y mas importa). Leaflet sigue vivo para `RevealMap` y `MapPicker`. **Maximo impacto, minimo riesgo.**
2. **Fase 2:** `RevealMap` + `MapPicker`.
3. **Fase 3:** buscador a Places (opcional) y **quitar Leaflet** del bundle.

### 5.3 Riesgos tecnicos

- **z-index / overlays:** hoy `.lg-map { isolation: isolate }` contiene los panes de Leaflet (~1000). Google Maps tiene su propia pila de z-index; hay que verificar que el buscador, el selector de capa y los controles flotantes (brujula, reset POV) **no queden tapados** ni tapen. **Es exactamente el tipo de regresion que caza el smoke E2E** (un click sobre un elemento tapado falla).
- **Movil:** `gestureHandling: 'greedy'` para que un dedo mueva el mapa (sin el banner "usa dos dedos"). Verificar que no rompe el scroll de la pagina alrededor del mapa.
- **Accesibilidad:** los `AdvancedMarker` con emoji necesitan `title`/aria equivalentes a los `L.divIcon` actuales; el contenedor de Google trae sus propios roles.
- **Animaciones de revelado:** la **linea dibujandose** (SVG dashoffset) y el **muelle del 🎯** (`lg-pin-drop`) estan atados a como Leaflet pinta el path y el icono. Con Google hay que recrearlas (Polyline animada con `icons`, o aceptar version estatica en fase 1). Riesgo bajo, cosmetico.
- **Smoke E2E que clica el mapa:** **importante** — el E2E actual (`create-full.spec.ts`) NO clica el canvas del mapa: marca el punto **via el buscador (Nominatim) + sugerencia**. Si en fase 1 dejamos Nominatim, **el E2E de crear no se rompe**. El de jugar (si clica el mapa) si necesita revisarse para clicar el contenedor de Google. Correr `npm run e2e` y `e2e:prod` antes de mergear (regla `always.md` §4).
- **`mapId` obligatorio** para `AdvancedMarker` y para estilar POIs: hay que crear un Map ID en la consola de Google y pasarlo por env o constante.
- **Atribucion/ToS:** el logo de Google y los terminos son obligatorios; con vis.gl vienen de serie, no añadir trabajo.

---

## 6. Plan por fases (Shape Up: impacto × apetito) y recomendacion final

> Priorizamos por **impacto** y **apetito** (no por estimacion), como marca el `CLAUDE.md`.

| Fase | Que | Impacto | Apetito | ¿Cuando? |
|---|---|---|---|---|
| **F1 — Mapa de adivinar a Google** | `PlayMap` con `<Map>` + `AdvancedMarker`, POIs visibles, click-to-pin, fitBounds al revelar (linea estatica al principio). Buscador y resto **siguen igual**. | **Alto** (es el core; POIs/bares + coherencia con el panorama) | **Pequeño-medio** (un fichero, SDK ya cargado) | **Ya** — primer corte |
| **F2 — Resultado + selector a Google** | `RevealMap` y `MapPicker` a Google. Toggle satelite = `hybrid`. | Medio | Pequeño | Tras validar F1 |
| **F3 — Pulido + Places + limpieza** | Buscador a Places (session tokens), recrear linea/muelle animados, **quitar Leaflet** del bundle, actualizar `operativa.md` (cuota dura + numeros). | Medio (UX buscador + bundle mas ligero) | Medio | Cuando el resto este estable |

**Antes de F1 (operativa, 30 min):** en la consola de Google — (1) confirmar restriccion por **referrer**; (2) crear un **Map ID**; (3) poner **cuota dura diaria** de "Map loads" como cinturon ademas del budget de 5 €; (4) verificar que **Maps JavaScript API** cubre Dynamic Maps (lo hace) y dejar Places fuera hasta F3.

### Recomendacion final

**Migrar el mapa de adivinar a Google Maps JS (Fase 1), reusando el SDK que ya tenemos para Street View.** 

- **No** seguir solo con Leaflet: no resuelve el problema (POIs flojos, y de todas formas ya cargamos Google para el panorama → mantener Leaflet es la peor combinacion: dos SDK *y* mapa pobre).
- **No** ir a MapLibre: seria cambiar de proveedor para el 2D mientras el panorama sigue en Google → **dos SDK permanentes** y POIs que no son los de la marca Google. MapLibre solo gana si el objetivo fuera **eliminar** Google, y no lo es (el Street View es core y es Google).
- **Si** a Google: **un solo motor**, POIs/bares de marca (lo que pide el usuario), integracion nativa con el panorama, **0 € a nuestra escala** y riesgo de factura **acotado** con referrer + cuota dura + budget. Empezar incremental por el mapa que mas importa.

---

## Fuentes (precios — verificar en consola antes de implementar)

- [Google Maps Platform — cambios de marzo 2025](https://developers.google.com/maps/billing-and-pricing/march-2025)
- [Google Maps Platform — lista de precios de servicios core](https://developers.google.com/maps/billing-and-pricing/pricing)
- [Maps JavaScript API — uso y facturacion (Dynamic Maps)](https://developers.google.com/maps/documentation/javascript/usage-and-billing)
- [Places API — precios por sesion (Autocomplete New)](https://developers.google.com/maps/documentation/places/web-service/session-pricing)
- [Street View — uso y facturacion](https://developers.google.com/maps/documentation/streetview/usage-and-billing)
- [Hasta 10.000 llamadas gratis/mes por producto (blog Google Maps Platform)](https://mapsplatform.google.com/resources/blog/start-building-today-with-up-to-10-000-monthly-free-calls-per-product/)
- [MapTiler Cloud — precios (100.000 cargas gratis/mes)](https://www.maptiler.com/cloud/pricing/)
- [MapLibre GL JS (open source)](https://maplibre.org/projects/gl-js/)
- [Mapbox — precios (50.000 cargas gratis/mes)](https://www.mapbox.com/pricing)
