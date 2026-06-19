# 📍 LocationGuesser

**GeoGuessr, pero con las fotos de tus amigos.** Un colega de viaje guarda su ubicación exacta y manda una foto al grupo; los demás colocan un pin en el mapa y **gana quien más se acerca**. Con cuenta atrás.

> v0.1 — web estática, sin backend, sin instalar nada. El reto viaja codificado en un enlace.

## Jugar ahora (local)

No hace falta build. Sirve la carpeta `app/` con cualquier servidor estático:

```bash
cd app
python3 -m http.server 8080
# abre http://localhost:8080
```

> El GPS y la geolocalización solo funcionan en `https://` o en `localhost` (no abriendo el `file://` directamente).

## Cómo funciona

1. **Crear reto** → marca tu sitio (clic en el mapa / 📡 GPS / buscar) → título → temporizador → **Generar enlace**.
2. Comparte el **enlace** + la **foto** en el grupo de WhatsApp.
3. Cada amigo abre el enlace, sube la foto, coloca su pin antes de que acabe el tiempo y comparte su **distancia y puntos**. Gana el de menos km.

La ubicación de la respuesta va **codificada en el `#hash`** del enlace (base64, sin backend). No es cifrado: es un juego entre amigos, no hagáis trampa 😉.

## Estructura

```
LocationGuesser/
├── app/                 # la app (monolito front)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── docs/
│   └── estrategia/
│       └── aterrizaje-producto.md   # diagnóstico, competencia, oportunidades, política guía, OST
├── CLAUDE.md            # contexto e instrucciones para Claude Code
└── .claude/skills/      # /guardar · /compartir
```

## Stack

HTML/CSS/JS sin framework · [Leaflet](https://leafletjs.com/) sobre [OpenStreetMap](https://www.openstreetmap.org/) (mapa gratis, sin API key) · geocodificación con Nominatim.

## Desplegar (hoy)

Es estático: sube `app/` a **GitHub Pages**, **Vercel** o **Netlify**. Recomendado servir `app/` como raíz del sitio.

## Roadmap

Ver [docs/estrategia/aterrizaje-producto.md](docs/estrategia/aterrizaje-producto.md). Próximo (si engancha): ranking compartido en vivo, historial / mapa de viajes del grupo, control de privacidad de la ubicación.
