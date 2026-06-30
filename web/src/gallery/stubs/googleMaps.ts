// Stub mínimo de `google.maps` en runtime para la galería. El SDK de Google nunca
// se carga (no hay API key ni red), pero varias pantallas CONSTRUYEN objetos del
// SDK durante el render para los iconos de los marcadores (new google.maps.Size /
// Point / LatLngBounds) y leen el enum Animation. Sin el global, eso lanza
// ReferenceError y la pantalla de jugar/crear se cae. Aquí definimos solo lo que se
// construye en runtime (los demás usos son TIPOS, que no existen en runtime).
//
// Se instala UNA vez al arrancar el entry de la galería (antes de montar React).

class Size {
  width: number
  height: number
  constructor(width: number, height: number) {
    this.width = width
    this.height = height
  }
}
class Point {
  x: number
  y: number
  constructor(x: number, y: number) {
    this.x = x
    this.y = y
  }
}
class LatLngBounds {
  extend(): this {
    return this
  }
  getCenter() {
    return { lat: () => 0, lng: () => 0 }
  }
  isEmpty(): boolean {
    return false
  }
}

export function installGoogleMapsStub(): void {
  const w = window as unknown as { google?: { maps?: unknown } }
  if (w.google?.maps) return
  w.google = {
    maps: {
      Size,
      Point,
      LatLngBounds,
      // Animation es un enum que algún icono lee; valores numéricos cualesquiera.
      Animation: { DROP: 1, BOUNCE: 2 },
      // importLibrary: lo usa el loader de Street View; devolvemos vacío (sin SDK).
      importLibrary: () => Promise.resolve({}),
    },
  }
}
