import { toPng } from 'html-to-image'
import type { LeaderboardEntry } from '../../lib/leaderboard'
import type { GroupPrizes } from '../../lib/database.types'

// Cuántos jugadores entran en el resumen antes de truncar (los demás se resumen
// con "…"). 10 mantiene el mensaje legible en el chat sin perder el podio.
const MAX_ROWS = 10

// Medalla por puesto para el resumen de texto: oro/plata/bronce y luego "N.".
function rowPrefix(index: number): string {
  if (index === 0) return '🥇'
  if (index === 1) return '🥈'
  if (index === 2) return '🥉'
  return `${index + 1}.`
}

// Línea de premios "en juego": solo las posiciones con premio definido, en el
// orden 1º/2º/3º/último (lo que más motiva: ganar y no quedar el último).
function prizesLine(prizes: GroupPrizes | null): string | null {
  if (!prizes) return null
  const parts: string[] = []
  if (prizes.first?.trim()) parts.push(`🥇 ${prizes.first.trim()}`)
  if (prizes.second?.trim()) parts.push(`🥈 ${prizes.second.trim()}`)
  if (prizes.third?.trim()) parts.push(`🥉 ${prizes.third.trim()}`)
  if (prizes.last?.trim()) parts.push(`🏁 ${prizes.last.trim()}`)
  if (parts.length === 0) return null
  return `🎁 En juego: ${parts.join(' · ')}`
}

// Construye el resumen en texto de la clasificación para compartir en el chat
// del grupo. Función pura (testeable): no toca el DOM ni navigator. Si no hay
// clasificación, invita a unirse igualmente con el enlace.
export function buildShareText(
  groupName: string,
  entries: LeaderboardEntry[],
  prizes: GroupPrizes | null,
  link: string,
): string {
  const lines: string[] = [`🏆 Clasificación · ${groupName}`]

  if (entries.length === 0) {
    lines.push('Aún no hay clasificación, ¡únete y abre la tabla!')
  } else {
    const shown = entries.slice(0, MAX_ROWS)
    for (let i = 0; i < shown.length; i++) {
      const e = shown[i]
      lines.push(`${rowPrefix(i)} ${e.name} — ${e.points.toLocaleString('es-ES')}`)
    }
    if (entries.length > MAX_ROWS) lines.push('…')
  }

  const prizesText = prizesLine(prizes)
  if (prizesText) lines.push(prizesText)

  lines.push(`👉 Únete y juega: ${link}`)
  return lines.join('\n')
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
// pantallas retina y al ampliar en el chat. cacheBust evita imágenes cacheadas
// de un render anterior. Devuelve un Blob listo para compartir/descargar.
export async function nodeToPngBlob(node: HTMLElement): Promise<Blob> {
  const dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: true })
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
