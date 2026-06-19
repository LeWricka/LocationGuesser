// Enrutado por hash. El grupo ("el viaje") y el reto activo viajan en el
// fragmento de la URL (`#g=<code>&c=<uuid>`) para poder compartirse por chat
// sin backend. El parser es tolerante: acepta claves en cualquier orden y
// hashes parciales (solo grupo, solo reto, o vacíos).

export interface Route {
  group?: string
  challenge?: string
}

/**
 * Parsea el hash de la URL a `{ group?, challenge? }`.
 * Acepta el hash con o sin `#` inicial. Por defecto usa `location.hash`.
 */
export function parseHash(hash: string = window.location.hash): Route {
  // Quitamos el `#` inicial si viene; usamos URLSearchParams para no reinventar
  // el parseo de pares clave=valor (decodifica %xx y respeta el orden libre).
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  const params = new URLSearchParams(raw)
  const route: Route = {}

  const group = params.get('g')?.trim()
  if (group) route.group = group

  const challenge = params.get('c')?.trim()
  if (challenge) route.challenge = challenge

  return route
}
