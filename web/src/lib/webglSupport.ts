// Detección de soporte WebGL, compartida por los DOS mapas globo (HomeGlobe y
// TripMap/TripMapGlobe): ambos necesitan saber si el navegador puede dibujar
// MapLibre (WebGL) antes de intentar cargarlo, para caer directos al plano/globo
// evocado si no. Vivía DUPLICADA en `ui/HomeGlobe.tsx` y `features/trip/TripMap.tsx`
// (cada uno creaba su PROPIO contexto WebGL de usar y tirar); issue #713 ("el golpe
// post-carga") la centraliza aquí con dos mejoras:
//
//  1. MEMOIZADA a nivel de módulo: el soporte WebGL de un navegador no cambia
//     durante la sesión, así que basta comprobarlo UNA VEZ por carga de página, no
//     una vez por cada montaje de HomeGlobe/TripMap (cada visita a Home o a un
//     Viaje volvía a crear un contexto desde cero). Medido con CPU estrangulada
//     (6x, ~gama media): la creación del contexto de prueba costaba 13-27ms de
//     bloqueo de hilo principal en el CPU profile — parte del "golpe" que reporta
//     el dueño justo tras el revelado.
//  2. LIBERA el contexto de prueba explícitamente (`WEBGL_lose_context`) en vez de
//     dejarlo colgado para el recolector de basura: un contexto WebGL sin liberar
//     compite por el cupo de contextos del navegador justo antes de que el mapa
//     real cree el SUYO — presión que puede disparar una pérdida/restauración de
//     contexto (`_setupPainter` de MapLibre, visto en el profiling) e infla aún
//     más el golpe.
let cached: boolean | null = null

/**
 * ¿Soporta el navegador WebGL? Crea un canvas de usar y tirar y pide un contexto
 * 'webgl2'/'webgl' SOLO la primera vez; a partir de ahí devuelve el resultado
 * cacheado. Si el navegador no lo da (móvil viejo, GPU bloqueada, WebGL
 * desactivado) devuelve `false` y el llamante cae a su alternativa sin WebGL.
 */
export function hasWebGL(): boolean {
  if (cached != null) return cached
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')
    cached = gl != null
    // Suelta el contexto de prueba YA (no esperar al GC del canvas huérfano): deja
    // sitio en el cupo de contextos del navegador para el mapa real que viene justo
    // después. Sin la extensión (navegador viejo) no pasa nada, es best-effort.
    if (gl && 'getExtension' in gl) {
      ;(gl as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext()
    }
    return cached
  } catch {
    // Algunos navegadores lanzan al pedir el contexto si WebGL está bloqueado.
    cached = false
    return false
  }
}

/** Solo para tests: fuerza a repetir la detección en el siguiente `hasWebGL()`. */
export function resetWebGLSupportCache(): void {
  cached = null
}
