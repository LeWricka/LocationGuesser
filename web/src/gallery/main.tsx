// Entry de la GALERÍA (gallery.html). Herramienta de desarrollo: monta la galería
// con el mismo árbol de providers que la app real (APIProvider de mapas — stub en
// galería —, ToastProvider y AuthProvider — falso en galería), pero leyendo TODO de
// fixtures. NO entra en el build de producción: es un input de Rollup aparte que
// solo se activa con GALLERY=1 (ver vite.config.ts). El alias de Vite sustituye
// aquí dentro `lib/supabase`, `lib/session` y los paquetes de mapas por sus dobles.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { APIProvider } from '@vis.gl/react-google-maps'
import '../index.css'
import { ToastProvider } from '../ui'
import { AuthProvider } from '../lib/session'
import { Gallery } from './Gallery'
import { cases } from './cases'
import { disableAnimations, freezeTime } from './determinism'
import { installGoogleMapsStub } from './stubs/googleMaps'

// Determinismo ANTES de montar: reloj congelado + animaciones apagadas + stub de
// google.maps (varias pantallas construyen objetos del SDK al pintar los iconos).
freezeTime()
disableAnimations()
installGoogleMapsStub()

// Exponemos los ids de los casos para que Playwright los recorra sin hardcodear la
// lista (el script lee window.__galleryCases tras cargar el índice).
declare global {
  interface Window {
    __galleryCases?: { id: string; title: string; section: string }[]
  }
}
window.__galleryCases = cases.map((c) => ({ id: c.id, title: c.title, section: c.section }))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <APIProvider apiKey="gallery-no-key">
      <ToastProvider>
        <AuthProvider>
          <Gallery />
        </AuthProvider>
      </ToastProvider>
    </APIProvider>
  </StrictMode>,
)
