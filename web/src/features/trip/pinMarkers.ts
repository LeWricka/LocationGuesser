// Markup SVG de los pines de mapa, alineado con el set de iconos lucide del kit
// (mismo grosor/forma que `Icon`). Los mapas (MapLibre/Leaflet) pintan HTML en el
// divIcon/marker, no componentes React, así que aquí servimos el glifo como string.
// `currentColor` deja que el color salga del token aplicado al contenedor del pin.

/** Pin de ubicación (lucide `MapPin`), para el pin-foto sin imagen y rutas. */
export const PIN_MARKER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>'

/** Pin "a adivinar" (lucide `HelpCircle`): reto cuya respuesta está oculta. */
export const HELP_MARKER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>'
