import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Paleta de marca (sistema "Atelier" de src/ui/tokens.css) para el manifest:
// el navegador la usa para la barra de estado y la pantalla de carga al instalar.
const PAPER = '#f6f7f9' // background_color (papel claro de la app)
const ACCENT = '#34506b' // theme_color (azul pizarra de marca)

// GALERÍA (issue #364): entry de DESARROLLO para revisar visualmente cada pantalla
// con fixtures deterministas (sin login ni red). Se activa SOLO con GALLERY=1 (lo
// pone `npm run gallery:shots`); con eso (1) añadimos gallery.html como input de
// Rollup y (2) aliaseamos la capa de datos y los paquetes de mapas a sus dobles de
// `src/gallery/`. Sin la env, la app de producción no se ve afectada en absoluto.
const galleryMode = process.env.GALLERY === '1'
// GALERÍA CON MAPA REAL (issue #695): variante de captura, SOLO para regenerar los
// assets del showcase de la landing (`web/src/assets/landing/*.webp`) con el
// satélite Esri de verdad en vez del stub plano oscuro. Mantiene TODOS los demás
// dobles (fakeSupabase/session/Google Maps) y el determinismo de la galería (reloj
// congelado, animaciones apagadas): solo deja pasar el paquete REAL `maplibre-gl`
// (y su CSS) para que los pines-foto queden clavados sobre el mundo de verdad. La
// usa exclusivamente `npm run landing:assets` (ver playwright.landing-assets.config.ts);
// `npm run gallery`/`gallery:shots`/`a11y` siguen 100% herméticos, sin este flag.
const galleryRealMap = galleryMode && process.env.GALLERY_REAL_MAP === '1'
const resolvePath = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))

// Redirige los módulos reales a sus dobles cuando se compila la galería. Lo hacemos
// con un `resolveId` (no con resolve.alias) porque los imports de la capa de datos
// son RELATIVOS (`./supabase`, `../../lib/session`): un alias por string no casa de
// forma fiable, pero sí podemos inspeccionar el id YA RESUELTO y redirigir por sufijo
// de ruta. Solo se enchufa con GALLERY=1, así producción no se toca.
function galleryDoublesPlugin(): Plugin {
  const bareDoubles: Record<string, string> = {
    '@vis.gl/react-google-maps': resolvePath('./src/gallery/stubs/react-google-maps.tsx'),
  }
  // Con GALLERY_REAL_MAP=1 NO aliaseamos maplibre-gl (ni su CSS): el import real
  // resuelve tal cual y el mapa pinta teselas de verdad. En cualquier otro caso
  // (galería normal) se mantiene el doble plano de siempre.
  if (!galleryRealMap) {
    bareDoubles['maplibre-gl/dist/maplibre-gl.css'] = resolvePath('./src/gallery/stubs/empty.css')
    bareDoubles['maplibre-gl'] = resolvePath('./src/gallery/stubs/maplibre-gl.ts')
  }
  const fileDoubles: { suffix: string; target: string }[] = [
    { suffix: '/lib/supabase.ts', target: resolvePath('./src/gallery/fakeSupabase.ts') },
    { suffix: '/lib/session.tsx', target: resolvePath('./src/gallery/FakeSession.tsx') },
  ]
  return {
    name: 'gallery-doubles',
    enforce: 'pre',
    async resolveId(source, importer) {
      // Paquetes de mapas: por nombre exacto (specifier "bare").
      if (source in bareDoubles) return bareDoubles[source]
      // Capa de datos: resolvemos el import relativo a su fichero real y, si su ruta
      // termina en uno de los sufijos vigilados, devolvemos el doble en su lugar.
      const resolved = await this.resolve(source, importer, { skipSelf: true })
      if (!resolved) return null
      const hit = fileDoubles.find((d) => resolved.id.endsWith(d.suffix))
      // Evita el bucle: no redirijas el propio doble (que importa session-context, etc.).
      if (hit && !resolved.id.includes('/src/gallery/')) return hit.target
      return null
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  build: galleryMode
    ? {
        rollupOptions: {
          input: {
            main: resolvePath('./index.html'),
            gallery: resolvePath('./gallery.html'),
          },
        },
      }
    : {},
  plugins: [
    react(),
    // Dobles de la galería (solo con GALLERY=1; si no, no hace nada).
    ...(galleryMode ? [galleryDoublesPlugin()] : []),
    // PWA ADITIVA: hace la app instalable y registra el service worker que
    // precachea el app-shell. `prompt` (antes `autoUpdate`, #549): el SW nuevo se
    // queda EN ESPERA hasta que main.tsx decide aplicarlo (banner "Actualizar" o,
    // en silencio, al ocultarse la pestaña) — NUNCA se auto-activa. Con
    // `autoUpdate` cualquier deploy tomaba el control y recargaba de golpe TODAS
    // las pestañas abiertas, aunque hubiera un formulario a medias (#498 → #549:
    // 18 deploys en una noche = formularios perdidos). No rompe nada en el
    // navegador normal: si el SW no se registra, la app va igual.
    // `cleanupOutdatedCaches` borra precachés viejos para que un deploy nuevo no
    // quede servido desde caché obsoleta.
    //
    // injectManifest: usamos NUESTRO propio service worker (`src/sw.ts`) en vez
    // del que autogenera Workbox, porque necesitamos manejar los eventos `push` y
    // `notificationclick` de Web Push (Workbox no los cubre). El plugin inyecta en
    // ese SW el precache-manifest de Workbox (`self.__WB_MANIFEST`), así que el
    // app-shell se sigue precacheando igual; solo añadimos los handlers de push
    // encima. El build sigue 100% estático en Vercel (emite `sw.js` + manifest a
    // `dist/`); no introduce backend.
    VitePWA({
      registerType: 'prompt',
      // Registro MANUAL del SW (en main.tsx) en vez de auto-inyectado: necesitamos
      // el callback `onRegisteredSW` para SONDEAR actualizaciones periódicamente. Un
      // SPA no navega, así que sin ese sondeo un deploy nuevo no se detecta y el
      // usuario se queda en la versión cacheada. `null` desactiva el auto-registro.
      injectRegister: null,
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        // OJO: en injectManifest el SPA navigation fallback (y su denylist para
        // `/api/*`, `/v/*`, `/j/*`, que protege las metas OG de Vercel) se registra
        // en el propio SW (`src/sw.ts`), NO aquí: `navigateFallbackDenylist` solo es
        // válido en modo generateSW.
      },
      // En desarrollo NO activamos el SW: evita cachés agresivas mientras se
      // programa y mantiene el dev server limpio (el SW solo en build/prod).
      devOptions: {
        enabled: false,
      },
      manifest: {
        name: 'Momentu',
        short_name: 'Momentu',
        description: 'Guarda los momentos de tu viaje para siempre y compártelos con tu gente.',
        lang: 'es',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: ACCENT,
        background_color: PAPER,
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            // Maskable: Android recorta el icono a su forma (círculo/squircle);
            // el contenido vive dentro de la "safe zone" central.
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
