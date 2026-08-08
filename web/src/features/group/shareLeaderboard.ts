// Caption del mensaje al compartir: MÍNIMO. La clasificación, el podio y los
// premios viajan ya dibujados en la IMAGEN, así que el texto solo aporta el
// enlace clicable (la imagen no lo es) y una línea de gancho. Repetir la tabla
// en texto sería ruido y desincentivaría abrir la imagen. Función pura.
export function buildShareText(groupName: string, link: string): string {
  return `🏆 Así va la liga de «${groupName}» 👉 ${link}` // design-lint-allow: caption de WhatsApp, no UI de la app
}

// Dominio "bonito" para el pie de la tarjeta: el host del enlace sin "www.".
// La imagen no lleva enlace clicable, así que el pie solo invita; el enlace real
// viaja en el caption (`text`) al compartir. Función pura (testeable).
export function shareDomain(link: string): string {
  try {
    return new URL(link).host.replace(/^www\./, '')
  } catch {
    // Enlaces relativos o raros: devolvemos algo legible en vez de romper.
    return link
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
  }
}

// Rasteriza un nodo del DOM a PNG con html-to-image. pixelRatio 2 = nitidez en
// pantallas retina y al ampliar en el chat. Devuelve un Blob listo para
// compartir/descargar.
//
// TRES pasadas quedándonos con la ÚLTIMA (issue #992, tarjeta NEGRA en iOS):
// WebKit/Safari tiene un bug conocido con html-to-image (upstream #361): en la
// primera serialización a SVG/foreignObject las imágenes (background data-URL,
// SVG anidado) aún no están en la caché interna y el PNG sale SIN ellas — solo
// el texto sobre el fondo (nuestra tarjeta se veía negra en iPhone; en Android
// salía bien). Repetir la rasterización sobre el mismo nodo deja los recursos
// cacheados y la última pasada sale completa. Es barato: el nodo está
// off-viewport y son ~decenas de ms por pasada. Se hace SIEMPRE (no solo en
// Safari): detectar el motor es frágil y en Chromium las pasadas extra son
// inocuas. `cacheBust` se QUITA: rompía justo la caché de la que depende este
// workaround, y no aporta nada (las imágenes de las tarjetas ya viajan como
// data URLs únicos por render, no hay caché HTTP que invalidar).
export async function nodeToPngBlob(node: HTMLElement): Promise<Blob> {
  // import dinámico: html-to-image (~30 KB) solo se carga cuando el usuario va a
  // compartir, no en el bundle inicial. Sale a su propio chunk en el build.
  const { toPng } = await import('html-to-image')
  let dataUrl = ''
  for (let i = 0; i < 3; i++) {
    dataUrl = await toPng(node, { pixelRatio: 2 })
  }
  const res = await fetch(dataUrl)
  return res.blob()
}

// Resultado de un intento de compartir: cómo acabó, para que la UI dé el feedback
// adecuado (toast) sin volver a inspeccionar el entorno.
export type ShareImageResult = 'shared' | 'downloaded' | 'cancelled'

// Comparte un PNG de la clasificación con el caption de texto. Camino feliz: Web
// Share API nivel 2 (compartir el File a WhatsApp/etc.). Si el navegador no puede
// compartir ficheros, descarga el PNG y copia el caption al portapapeles. Maneja
// la cancelación del usuario sin tratarla como error.
export async function shareLeaderboardImage(
  blob: Blob,
  text: string,
  title: string,
): Promise<ShareImageResult> {
  const file = new File([blob], 'clasificacion.png', { type: 'image/png' })

  // canShare con files: el gesto de compartir-imagen solo existe en móvil moderno.
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    navigator.canShare?.({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file], text, title })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
      // Otros errores de share: caemos al fallback de descarga en vez de romper.
    }
  }

  downloadBlob(blob, 'clasificacion.png')
  // El enlace no va en la imagen; lo dejamos en el portapapeles para pegarlo junto.
  try {
    await navigator.clipboard?.writeText(text)
  } catch {
    // Sin permiso de portapapeles: la descarga ya ha ocurrido, no bloqueamos.
  }
  return 'downloaded'
}

// Descarga un Blob como fichero usando un <a download> temporal (sin dependencias).
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revocar tras un tick para que el navegador arranque la descarga primero.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
