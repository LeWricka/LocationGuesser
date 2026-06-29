import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Paleta de marca "Atelier" (tokens de src/ui/tokens.css) para el manifest: el
// navegador la usa para la barra de estado y la pantalla de carga al instalar.
const PAPER = '#f6f7f9' // theme_color + background_color (fondo papel de marca)

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // PWA ADITIVA: hace la app instalable y genera el service worker (Workbox)
    // que precachea el app-shell. `autoUpdate` = el SW nuevo toma el control en
    // cuanto está listo, sin pedir nada al usuario (clientsClaim + skipWaiting).
    // No rompe nada en el navegador normal: si el SW no se registra, la app va
    // igual. `cleanupOutdatedCaches` borra precachés viejos para que un deploy
    // nuevo no quede servido desde caché obsoleta.
    VitePWA({
      registerType: 'autoUpdate',
      // El plugin inyecta el registro del SW en el bundle (injectRegister 'auto').
      injectRegister: 'auto',
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
      },
      // En desarrollo NO activamos el SW: evita cachés agresivas mientras se
      // programa y mantiene el dev server limpio (el SW solo en build/prod).
      devOptions: {
        enabled: false,
      },
      manifest: {
        name: 'Lugares',
        short_name: 'Lugares',
        description:
          'Comparte tus momentos de una forma diferente: enseña dónde estás y deja que tu grupo adivine el lugar. Los sitios que vives, unidos en una ruta.',
        lang: 'es',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: PAPER,
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
