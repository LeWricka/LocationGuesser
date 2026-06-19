// Código de grupo ("el viaje") que viaja en el enlace (#g=). Alfabeto sin
// caracteres ambiguos (sin l/1/0/o) para que sea fácil de leer/dictar.
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'

export function newGroupCode(length = 6): string {
  const bytes = new Uint32Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length]
  }
  return out
}
