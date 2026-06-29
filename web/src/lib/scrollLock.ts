/**
 * Bloqueo de scroll del <body> con CONTEO DE REFERENCIAS.
 *
 * Varias capas (la hoja del momento, el visor de fotos, modales) bloquean el
 * scroll del fondo a la vez. Cuando cada una escribía `document.body.style.overflow`
 * por su cuenta y guardaba el valor "previo", al solaparse o al desmontarse en
 * orden inesperado (p.ej. navegar a "Adivina" con la hoja aún abierta, dentro de
 * una View Transition) una capa restauraba `'hidden'` en vez del valor natural y
 * la PANTALLA QUEDABA DESCONFIGURADA al volver (no se podía hacer scroll).
 *
 * Con un contador compartido el body solo recupera su estado cuando se sueltan
 * TODAS las cerraduras, y nunca se queda atrapado en `hidden`. `lock()` devuelve
 * una función para soltar idempotente (segura de llamar dos veces).
 */

let count = 0
// Valor original de `overflow` antes del PRIMER bloqueo, para restaurarlo tal cual
// al soltar el último (puede no ser '' si una hoja del entorno ya lo tocó).
let original = ''

export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => {}
  if (count === 0) {
    original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  count += 1

  let released = false
  return () => {
    if (released) return
    released = true
    count = Math.max(0, count - 1)
    if (count === 0) {
      document.body.style.overflow = original
    }
  }
}
