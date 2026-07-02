// Barril de shells de pantalla (Fase 1 del rediseño).
//
// Los shells son la capa de composición que faltaba: cada pantalla hereda
// de uno de estos tres en vez de resolver backdrop+hoja+header a su manera.
// Eliminan la clase de bug "vacío negro + caption huérfano" al codificar
// las reglas de composición en un solo lugar.
//
// Guía de selección:
//   ShellInmersivo  → hay protagonista visual (mapa, SV, foto a sangre)
//   ShellUtilitario → formulario / pantalla limpia sin protagonista
//   ShellFeed       → lista / diario / marcador con cabecera fija

export { ShellInmersivo } from './ShellInmersivo'
export { ShellUtilitario } from './ShellUtilitario'
export { ShellFeed } from './ShellFeed'
