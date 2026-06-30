// Determinismo de la galería: mismas capturas en cada corrida. (1) Congela el reloj
// a GALLERY_NOW para que la cuenta atrás y los "hace N días" no cambien. (2) Inyecta
// CSS que apaga animaciones/transiciones para que las capturas sean estables (sin
// fotogramas a medias). Se llama UNA vez al arrancar el entry de la galería.

import { GALLERY_NOW } from './fixtures'

// Congela Date: `new Date()` y `Date.now()` devuelven SIEMPRE GALLERY_NOW. Las
// llamadas con argumentos (new Date(iso)) siguen funcionando normal — solo el
// "ahora" queda fijo. Así isLive(), las cuentas atrás y las duraciones relativas
// son deterministas sin tocar la lógica de las pantallas.
export function freezeTime(): void {
  const fixed = GALLERY_NOW.getTime()
  const RealDate = Date

  // Proxy sobre el constructor real: `new Date()` (sin args) devuelve el instante
  // fijo; con args, delega en el Date real. `Date.now()` también queda fijo. No
  // subclaseamos (los campos/parámetros de clase chocan con erasableSyntaxOnly).
  const FrozenDate = new Proxy(RealDate, {
    construct(target, args) {
      if (args.length === 0) return new target(fixed)
      return new target(...(args as ConstructorParameters<typeof Date>))
    },
    get(target, prop, receiver) {
      if (prop === 'now') return () => fixed
      return Reflect.get(target, prop, receiver)
    },
  })

  globalThis.Date = FrozenDate
}

// Apaga animaciones y transiciones (incluido scroll-behavior) para capturas
// estables. Más fuerte que prefers-reduced-motion: cubre también las que no lo
// respetan. Se inyecta como <style> al cargar.
export function disableAnimations(): void {
  const style = document.createElement('style')
  style.textContent = `
    *, *::before, *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
      scroll-behavior: auto !important;
      caret-color: transparent !important;
    }
  `
  document.head.appendChild(style)
}
