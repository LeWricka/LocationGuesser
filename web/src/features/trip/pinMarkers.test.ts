import { describe, test, expect, afterEach, vi } from 'vitest'
import {
  buildActivePinElement,
  buildHomePinElement,
  buildPinElement,
  isUsablePinImage,
  photoPinHtml,
  PIN_MARKER_SVG,
} from './pinMarkers'

// Estos tests cazan la clase de bug del pin (globo de la home Y mapa de Viaje):
// contenido "garabateado" o recuadro oscuro dentro del pin (markup/imagen rota o
// caducada en vez de foto o inicial) y fallbacks que no caen limpio a la inicial. Son
// deterministas (DOM de jsdom) y no dependen de que nadie mire capturas.

afterEach(() => {
  vi.restoreAllMocks()
})

describe('isUsablePinImage', () => {
  test('acepta http(s) y blob', () => {
    expect(isUsablePinImage('https://cdn.example.com/foto.jpg?token=abc')).toBe(true)
    expect(isUsablePinImage('http://localhost/x.png')).toBe(true)
    expect(isUsablePinImage('blob:https://app/9e-uuid')).toBe(true)
  })

  test('acepta data-URI de imagen de ráster', () => {
    expect(isUsablePinImage('data:image/jpeg;base64,/9j/4AAQ')).toBe(true)
    expect(isUsablePinImage('data:image/png;base64,iVBORw0KGgo')).toBe(true)
    expect(isUsablePinImage('data:image/webp,xxxx')).toBe(true)
  })

  test('acepta rutas relativas / same-origin (assets empaquetados por Vite)', () => {
    // Regresión #444: `import lisboa from './assets/lisboa.webp'` → en build es una ruta
    // root-relative SIN esquema http(s); es un fichero de imagen real y debe pintarse.
    expect(isUsablePinImage('/assets/lisboa-x.webp')).toBe(true)
    expect(isUsablePinImage('./foo.jpg')).toBe(true)
    expect(isUsablePinImage('../shared/skyline.png')).toBe(true)
    expect(isUsablePinImage('assets/coliseo-abc123.webp')).toBe(true)
  })

  test('RECHAZA vacíos, nulos y espacios', () => {
    expect(isUsablePinImage(null)).toBe(false)
    expect(isUsablePinImage(undefined)).toBe(false)
    expect(isUsablePinImage('')).toBe(false)
    expect(isUsablePinImage('   ')).toBe(false)
  })

  test('RECHAZA data:image/svg+xml (el origen del pin "garabateado")', () => {
    // Un SVG con <text> metido en un disco de 42px se pinta como un rótulo minúsculo
    // ilegible: NUNCA debe entrar como miniatura del pin.
    const svg =
      'data:image/svg+xml;utf8,' +
      encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><text>Madrid</text></svg>')
    expect(isUsablePinImage(svg)).toBe(false)
  })

  test('RECHAZA esquemas raros (javascript:, texto suelto, markup)', () => {
    expect(isUsablePinImage('javascript:alert(1)')).toBe(false)
    expect(isUsablePinImage('no-soy-una-url')).toBe(false)
    expect(isUsablePinImage('<div>foo</div>')).toBe(false)
  })
})

describe('photoPinHtml', () => {
  test('con foto USABLE: incrusta la URL como background-image, sin texto', () => {
    const html = photoPinHtml({ imageUrl: 'https://cdn/x.jpg', title: 'Kioto' })
    expect(html).toContain("background-image:url('https://cdn/x.jpg')")
    expect(html).toContain('lg-trip-pin__disc')
    expect(html).not.toContain('lg-trip-pin__initial')
  })

  test('con imageUrl NO usable (svg+xml): NO lo clava, cae a la inicial', () => {
    // Regresión: `photoPinHtml` ya no confía en cualquier `imageUrl` truthy; pasa por
    // `isUsablePinImage`, así que un svg+xml con texto NUNCA entra como background-image.
    const svg = 'data:image/svg+xml;utf8,<svg><text>Kioto</text></svg>'
    const html = photoPinHtml({ imageUrl: svg, title: 'Kioto' })
    expect(html).not.toContain('background-image')
    expect(html).toContain('lg-trip-pin--empty')
    expect(html).toContain('<span class="lg-trip-pin__initial">K</span>')
  })

  test('sin foto: cae a la inicial del lugar (una letra), no un anillo vacío', () => {
    const html = photoPinHtml({ imageUrl: null, title: 'kioto' })
    expect(html).toContain('lg-trip-pin--empty')
    expect(html).toContain('<span class="lg-trip-pin__initial">K</span>')
  })

  test('sin foto y sin título usable: cae al glifo de ubicación, no a vacío', () => {
    const html = photoPinHtml({ imageUrl: null, title: '   ' })
    expect(html).toContain(PIN_MARKER_SVG)
    expect(html).not.toContain('lg-trip-pin__initial')
  })

  test('ESCAPA la inicial: un título con markup no inyecta HTML', () => {
    // La inicial se toma del primer carácter; con "<" el placeInitial lo descarta
    // (no es letra/número) y cae al glifo. Con un título que empieza por "&"
    // tampoco hay letra usable → glifo. Verificamos que NUNCA sale "<" crudo.
    const html = photoPinHtml({ imageUrl: null, title: '<script>alert(1)</script>' })
    expect(html).not.toContain('<script>')
  })

  test('featured: aro dorado (clase), sin cambiar la estructura del disco', () => {
    const html = photoPinHtml({ imageUrl: 'https://cdn/x.jpg', title: 'x', featured: true })
    expect(html).toContain('lg-trip-pin--featured')
  })
})

describe('buildHomePinElement', () => {
  test('arranca SIEMPRE en el fallback (disco de acento + inicial), no en la foto', () => {
    const el = buildHomePinElement({ title: 'Madrid', imageUrl: 'https://cdn/x.jpg' })
    // De entrada, antes de que la imagen precargue, el pin está en estado "vacío".
    expect(el.classList.contains('lg-home-pin')).toBe(true)
    expect(el.classList.contains('lg-trip-pin--empty')).toBe(true)
    const disc = el.querySelector('.lg-trip-pin__disc')
    expect(disc?.querySelector('.lg-trip-pin__initial')?.textContent).toBe('M')
    // Nada de background-image antes de la precarga.
    expect((disc as HTMLElement | null)?.style.backgroundImage ?? '').toBe('')
  })

  test('foto OK: al PRECARGAR bien, sube a la miniatura y limpia la inicial', async () => {
    // Simulamos que la imagen carga: capturamos la instancia y disparamos su onload.
    const created: FakeImage[] = []
    class FakeImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_v: string) {
        created.push(this)
      }
    }
    vi.stubGlobal('Image', FakeImage as unknown as typeof Image)

    const el = buildHomePinElement({ title: 'Kioto', imageUrl: 'https://cdn/foto.jpg' })
    expect(el.classList.contains('lg-trip-pin--empty')).toBe(true) // fallback de entrada

    created[0]?.onload?.() // la imagen precargó
    expect(el.classList.contains('lg-trip-pin--empty')).toBe(false)
    const disc = el.querySelector<HTMLElement>('.lg-trip-pin__disc')
    expect(disc?.style.backgroundImage).toContain('https://cdn/foto.jpg')
    // La inicial se ha limpiado (ya no hay texto garabateado bajo la foto).
    expect(disc?.querySelector('.lg-trip-pin__initial')).toBeNull()
  })

  test('URL de imagen ROTA que nunca carga: se queda en la inicial (no garabato)', () => {
    // Con onerror (o simplemente sin onload), el pin NO cambia: sigue en el fallback.
    class FakeImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_v: string) {
        this.onerror?.() // falla la carga
      }
    }
    vi.stubGlobal('Image', FakeImage as unknown as typeof Image)

    const el = buildHomePinElement({ title: 'Roma', imageUrl: 'https://cdn/rota.jpg' })
    expect(el.classList.contains('lg-trip-pin--empty')).toBe(true)
    const disc = el.querySelector<HTMLElement>('.lg-trip-pin__disc')
    expect(disc?.querySelector('.lg-trip-pin__initial')?.textContent).toBe('R')
    expect(disc?.style.backgroundImage ?? '').toBe('')
  })

  test('URL VACÍA: no intenta cargar imagen, se queda en la inicial', () => {
    const spy = vi.fn()
    class FakeImage {
      onload: (() => void) | null = null
      set src(v: string) {
        spy(v)
      }
    }
    vi.stubGlobal('Image', FakeImage as unknown as typeof Image)

    const el = buildHomePinElement({ title: 'Oslo', imageUrl: '' })
    expect(spy).not.toHaveBeenCalled() // nunca se intenta cargar una URL vacía
    expect(el.querySelector('.lg-trip-pin__initial')?.textContent).toBe('O')
  })

  test('data:image/svg+xml (el bug): NO entra como miniatura, se queda la inicial', () => {
    const spy = vi.fn()
    class FakeImage {
      onload: (() => void) | null = null
      set src(v: string) {
        spy(v)
      }
    }
    vi.stubGlobal('Image', FakeImage as unknown as typeof Image)

    const svg =
      'data:image/svg+xml;utf8,' +
      encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><text>Barcelona</text></svg>')
    const el = buildHomePinElement({ title: 'Barcelona', imageUrl: svg })
    // No se intenta precargar el SVG como imagen → nunca se pinta como miniatura.
    expect(spy).not.toHaveBeenCalled()
    expect(el.classList.contains('lg-trip-pin--empty')).toBe(true)
    expect(el.querySelector('.lg-trip-pin__initial')?.textContent).toBe('B')
  })

  test('pin "lead": añade la clase del aro cálido', () => {
    const el = buildHomePinElement({ title: 'Lisboa', imageUrl: null, lead: true })
    expect(el.classList.contains('lg-home-pin--lead')).toBe(true)
  })

  test('sin foto: el pin no contiene texto multilínea garabateado, solo 1 inicial', () => {
    const el = buildHomePinElement({ title: 'Finde Madrid · Plaza Mayor', imageUrl: null })
    const initials = el.querySelectorAll('.lg-trip-pin__initial')
    expect(initials).toHaveLength(1)
    expect(initials[0].textContent).toBe('F') // una sola letra, no el título entero
  })

  test('la home usa el builder compartido (variante home)', () => {
    const el = buildHomePinElement({ title: 'Oslo', imageUrl: null })
    expect(el.classList.contains('lg-home-pin')).toBe(true)
    expect(el.classList.contains('lg-trip-pin')).toBe(true)
  })
})

// GUARDARRAÍL de la RAÍZ del bug: el mapa de Viaje (Leaflet + MapLibre) construye AHORA
// sus pines por el MISMO `buildPinElement`, no por `photoPinHtml` a pelo. Estos tests
// congelan que el pin del VIAJE tiene la misma red de seguridad: nunca clava una foto
// que no ha cargado (una URL firmada de Storage caducada/404 → recuadro oscuro), sino
// que arranca y se queda en la inicial hasta que la imagen precarga de verdad.
describe('buildPinElement (mapa de Viaje + home, camino único)', () => {
  test('arranca en el fallback (disco de acento + inicial), NO clava la foto de golpe', () => {
    // Sin precarga, el pin de un momento situado con foto está en estado "vacío": si la
    // URL firmada estuviera caducada, se vería la inicial limpia, no un recuadro oscuro.
    const el = buildPinElement({ title: 'Kioto', imageUrl: 'https://cdn/foto.jpg' })
    expect(el.classList.contains('lg-trip-pin--empty')).toBe(true)
    const disc = el.querySelector<HTMLElement>('.lg-trip-pin__disc')
    expect(disc?.querySelector('.lg-trip-pin__initial')?.textContent).toBe('K')
    expect(disc?.style.backgroundImage ?? '').toBe('')
    // NO es un pin de la home: sin la clase de la variante home.
    expect(el.classList.contains('lg-home-pin')).toBe(false)
  })

  test('foto OK: al PRECARGAR bien sube a la miniatura y limpia la inicial', () => {
    const created: FakeImage[] = []
    class FakeImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_v: string) {
        created.push(this)
      }
    }
    vi.stubGlobal('Image', FakeImage as unknown as typeof Image)

    const el = buildPinElement({ title: 'Roma', imageUrl: 'https://cdn/foto.jpg' })
    expect(el.classList.contains('lg-trip-pin--empty')).toBe(true) // fallback de entrada
    created[0]?.onload?.() // la imagen precargó
    expect(el.classList.contains('lg-trip-pin--empty')).toBe(false)
    const disc = el.querySelector<HTMLElement>('.lg-trip-pin__disc')
    expect(disc?.style.backgroundImage).toContain('https://cdn/foto.jpg')
    expect(disc?.querySelector('.lg-trip-pin__initial')).toBeNull()
  })

  test('URL firmada CADUCADA/404 (onerror): se queda en la inicial, NO recuadro oscuro', () => {
    // Este es EXACTAMENTE el bug de datos reales: la portada existe pero su URL firmada
    // ha caducado/404ea. `background-image` no dispara onerror; la precarga sí, y deja
    // el pin en la inicial limpia en vez de un disco de fondo vacío (recuadro oscuro).
    class FakeImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_v: string) {
        this.onerror?.()
      }
    }
    vi.stubGlobal('Image', FakeImage as unknown as typeof Image)

    const el = buildPinElement({ title: 'Barcelona', imageUrl: 'https://cdn/caducada.jpg' })
    expect(el.classList.contains('lg-trip-pin--empty')).toBe(true)
    const disc = el.querySelector<HTMLElement>('.lg-trip-pin__disc')
    expect(disc?.querySelector('.lg-trip-pin__initial')?.textContent).toBe('B')
    expect(disc?.style.backgroundImage ?? '').toBe('')
  })

  test('featured (seleccionado en el mapa): aro dorado, sin foto de golpe', () => {
    const el = buildPinElement({ title: 'Nápoles', imageUrl: 'https://cdn/x.jpg', featured: true })
    expect(el.classList.contains('lg-trip-pin--featured')).toBe(true)
  })
})

describe('buildActivePinElement (momento en juego)', () => {
  test('disco rojo pulsante con "?", sin foto ni inicial', () => {
    const el = buildActivePinElement()
    expect(el.classList.contains('lg-trip-pin--active')).toBe(true)
    expect(el.querySelector('.lg-trip-pin__disc')?.innerHTML).toContain('<svg')
    expect(el.querySelector('.lg-trip-pin__initial')).toBeNull()
  })
})
