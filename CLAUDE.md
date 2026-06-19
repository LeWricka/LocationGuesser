# LocationGuesser — Contexto de proyecto

**Qué es:** GeoGuessr con las fotos de tus amigos. Un colega de viaje guarda su ubicación exacta + manda foto al grupo; los demás adivinan en el mapa; gana quien más se acerca. Con cuenta atrás.

**Origen:** caso real de un grupo de viaje en WhatsApp que ya juega a esto "a ojo". Objetivo: que el grupo juegue ≥1 reto durante el viaje y repita.

---

## Estado

| Pieza | Estado |
|-------|--------|
| Aterrizaje de producto | ✅ [docs/estrategia/aterrizaje-producto.md](docs/estrategia/aterrizaje-producto.md) |
| App v0.1 (crear + jugar) | ✅ `app/` |
| Despliegue | ⏳ pendiente (GitHub Pages / Vercel) |
| Ranking compartido, historial, privacidad | 🔜 next |

---

## Cómo trabajamos

- **Idioma:** español. Nombres de archivo en minúsculas-con-guiones, sin acentos.
- **Filosofía:** lo más simple posible e iterar; no bloquearse. Lanzar y validar.
- **Monolito:** la definición (`docs/`) y el código (`app/`) viven en el mismo repo.
- **Frameworks** (de la metodología del usuario): Kernel de **Rumelt** (diagnóstico → política guía → acciones), **OST** (outcome → oportunidad → iniciativa). Las oportunidades se priorizan por **impacto** y **apetito** (semanas que queremos invertir, Shape Up), no por estimación.
- *La forma de trabajo a nivel de desarrollo la definirá el usuario más adelante.*

## Arquitectura (v0.1)

- **Web estática, sin backend.** El reto se codifica en el `#hash` del enlace (base64 de `{t,la,ln,ti,im}`), que se comparte por el chat del grupo.
- **Mapa:** Leaflet + OpenStreetMap (sin API key). Geocodificación: Nominatim (solo al pulsar Enter, respetando su uso).
- **Sin dependencias de build.** Servir `app/` como estático.
- Geolocalización/GPS requiere `https` o `localhost`.

### Ficheros
- `app/index.html` — estructura y vistas (home / crear / jugar).
- `app/app.js` — router por hash, crear reto, jugar, scoring (haversine + `5000·e^(−km/2000)`), compartir.
- `app/styles.css` — estilos, móvil primero, tema oscuro.

## Ejecutar

```bash
cd app && python3 -m http.server 8080   # http://localhost:8080
```

## Comandos

| Comando | Qué hace |
|---------|----------|
| `/guardar` | `git add` + commit (mensaje con fecha). No hace push. |
| `/compartir` | `/guardar` si hay cambios, luego `pull --rebase` + `push`. |

## Convenciones de código

- Vanilla JS, sin framework. Funciones pequeñas, nombres claros en español/inglés mezclado como el dominio.
- Mantener la app **self-contained y desplegable como estático** (regla dura): nada que requiera servidor para el bucle principal.
- Antes de añadir backend/cuentas, validar que el bucle social funciona (se juega y se repite).
