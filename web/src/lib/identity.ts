// Identidad mínima (v0.3 la endurece: PIN, nombre único por grupo, fila players).
// De momento: client_id estable + nombre, en localStorage global del navegador.

const CLIENT_KEY = 'lg.clientId'
const NAME_KEY = 'lg.name'

export function getClientId(): string {
  let id = localStorage.getItem(CLIENT_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(CLIENT_KEY, id)
  }
  return id
}

export function getName(): string | null {
  return localStorage.getItem(NAME_KEY)
}

export function setName(name: string): void {
  localStorage.setItem(NAME_KEY, name)
}
