import { useEffect, useState } from 'react'
import { signedImageUrl } from './storage'

/**
 * Resuelve la URL firmada de una imagen del bucket privado a partir de su
 * `path`. Devuelve null mientras carga, si no hay imagen, o si el `path` cambió
 * y aún no se ha resuelto el nuevo (guardamos la pareja {path,url} y solo
 * devolvemos la url si corresponde al path actual — así no hace falta limpiar
 * el estado de forma síncrona en el efecto). Cancela en el desmontaje.
 */
export function useSignedImage(path: string | null, expiresIn = 3600): string | null {
  const [resolved, setResolved] = useState<{ path: string; url: string | null } | null>(null)
  useEffect(() => {
    if (!path) return
    let cancelled = false
    void signedImageUrl(path, expiresIn).then((url) => {
      if (!cancelled) setResolved({ path, url })
    })
    return () => {
      cancelled = true
    }
  }, [path, expiresIn])
  return path && resolved?.path === path ? resolved.url : null
}
