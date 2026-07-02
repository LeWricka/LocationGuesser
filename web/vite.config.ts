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
const resolvePath = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))

// Redirige los módulos reales a sus dobles cuando se compila la galería. Lo hacemos
// con un `resolveId` (no con resolve.alias) porque los imports de la capa de datos
// son RELATIVOS (`./supabase`, `../../lib/session`): un alias por string no casa de
// forma fiable, pero sí podemos inspeccionar el id YA RESUELTO y redirigir por sufijo
// de ruta. Solo se enchufa con GALLERY=1, así producción no se toca.
function galleryDoublesPlugin(): Plugin {
  const bareDoubles: Record<string, string> = {
    'maplibre-gl/dist/maplibre-gl.css': resolvePath('./src/gallery/stubs/empty.css'),
    'maplibre-gl': resolvePath('./src/gallery/stubs/maplibre-gl.ts'),
    '@vis.gl/react-google-maps': resolvePath('./src/gallery/stubs/react-google-maps.tsx'),
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
    // precachea el app-shell. `autoUpdate` = el SW nuevo toma el control en
    // cuanto está listo, sin pedir nada al usuario (clientsClaim + skipWaiting).
    // No rompe nada en el navegador normal: si el SW no se registra, la app va
    // igual. `cleanupOutdatedCaches` borra precachés viejos para que un deploy
    // nuevo no quede servido desde caché obsoleta.
    //
    // injectManifest: usamos NUESTRO propio service worker (`src/sw.ts`) en vez
    // del que autogenera Workbox, porque necesitamos manejar los eventos `push` y
    // `notificationclick` de Web Push (Workbox no los cubre). El plugin inyecta en
    // ese SW el precache-manifest de Workbox (`self.__WB_MANIFEST`), así que el
    // app-shell se sigue precacheando igual; solo añadimos los handlers de push
    // encima. El build sigue 100% estático en Vercel (emite `sw.js` + manifest a
    // `dist/`); no introduce backend.
    VitePWA({
      registerType: 'autoUpdate',
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
        name: 'Tabide',
        short_name: 'Tabide',
        description:
          'Comparte tus viajes de una forma diferente: una foto, y los tuyos adivinan dónde es.',
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
