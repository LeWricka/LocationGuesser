# LocationGuesser — Contexto de proyecto

**Qué es:** una forma distinta de compartir con tu grupo. Compartes dónde estás (una foto y/o un Street View con tu ubicación real) y los demás adivinan en el mapa dónde es; gana quien más se acerca. Con cuenta atrás. La mecánica de adivinar una ubicación es el *cómo* (el gancho), no el *qué somos*: la identidad es el compartir social, no el juego. (Frase ancla de producto: **"Comparte dónde estás. Tus amigos lo adivinan en el mapa."**)

**Origen:** caso real de un grupo de viaje en WhatsApp que ya juega a esto "a ojo". Objetivo: que el grupo juegue ≥1 reto durante el viaje y repita.

---

## Estado

| Pieza | Estado |
|-------|--------|
| Aterrizaje de producto | ✅ [docs/estrategia/aterrizaje-producto.md](docs/estrategia/aterrizaje-producto.md) |
| Diseño v0.2 (prueba de un día) | ✅ [docs/estrategia/prueba-de-un-dia.md](docs/estrategia/prueba-de-un-dia.md) |
| App v0.1 (web estática) | 🗄️ archivada en `legacy/v0.1/` (referencia) |
| App v0.2 (React + Supabase) | 🔨 en construcción en `web/` |
| Despliegue | ✅ en vivo — [locationguesser-sage.vercel.app](https://locationguesser-sage.vercel.app) (Vercel + Supabase) |
| Hito Cuentas + Home (login magic link, perfil, membresía, propiedad, foto opcional, duración relativa) | ✅ **en vivo** — mergeado a `main`, migración `0004` aplicada en Supabase, Auth configurado (redirect URLs + plantilla email). Diseño en [docs/estrategia/cuentas-y-home.md](docs/estrategia/cuentas-y-home.md). Pendiente: reescribir E2E (`web/e2e`) para el flujo con login. |

---

## Cómo trabajamos

- **Idioma:** español. Nombres de archivo en minúsculas-con-guiones, sin acentos.
- **Filosofía:** lo más simple posible e iterar; no bloquearse. Lanzar y validar. Antes de añadir login/cuentas de verdad, validar que el bucle social funciona (se juega y se repite).
- **Monolito:** la definición (`docs/`), el código v0.2 (`web/`) y la v0.1 archivada (`legacy/`) viven en el mismo repo.
- **Frameworks** (metodología del usuario): Kernel de **Rumelt** (diagnóstico → política guía → acciones), **OST** (outcome → oportunidad → iniciativa). Oportunidades priorizadas por **impacto** y **apetito** (Shape Up), no por estimación.

## Orquestación y reglas

- El hilo principal de Claude actúa como **orquestador**: descompone, crea issues, **lanza agentes en paralelo** (en worktrees, por áreas que no se pisan) y mergea.
- **Playbook obligatorio para todo agente:** [.claude/rules/always.md](.claude/rules/always.md) — seguridad, flujo issue→rama→PR, Conventional Commits, estilo, verificación, acceso a Supabase, Project #14 y áreas de trabajo.
- Trabajo en GitHub **Project #14**; un issue → una rama → un PR → merge (squash).
- **Operativa** (seguridad de la key de Maps, alerta de presupuesto, env vars y deploy de Edge Functions): [docs/operativa.md](docs/operativa.md).

## Arquitectura (v0.2)

- **Front:** React + Vite + **TypeScript**, estático en **Vercel**. Reemplaza la web estática de v0.1.
- **Datos:** **Supabase** — Postgres (retos, votos, jugadores, grupos), **Realtime** (histórico y marcador en vivo), **Storage** (imágenes), **Edge Functions** (des-acortador de URLs de Google Maps). **Sin backend propio.** El bucle principal **sí** depende de Supabase (cambia la regla dura de v0.1).
- **Mapa:** Leaflet + OpenStreetMap (sin API key). Geocodificación: Nominatim.
- **Grupo = código en el enlace** (`#g=…`). Asíncrono. Identidad sin login (nombre único por grupo + PIN, identidad global de navegador en `localStorage`).
- **Imágenes:** comprimir + estripar EXIF en cliente antes de subir (el EXIF lleva el GPS = la respuesta).
- Geolocalización/GPS y la cámara requieren `https` o `localhost`.

Detalle completo del diseño y el modelo de datos: [docs/estrategia/prueba-de-un-dia.md](docs/estrategia/prueba-de-un-dia.md).

### Ficheros
- `web/` — app v0.2 (React + Vite + TS). Estructura por features.
- `legacy/v0.1/` — web estática original (referencia: haversine, scoring `5000·e^(−km/2000)`, parser, pines, CSS).
- `docs/` — definición de producto y estrategia.

## Ejecutar

```bash
cd web && npm install && npm run dev   # Vite dev server
```

(v0.1 archivada: `cd legacy/v0.1 && python3 -m http.server 8080`)

## Comandos

| Comando | Qué hace |
|---------|----------|
| `/guardar` | `git add` + commit. No hace push. |
| `/compartir` | `/guardar` si hay cambios, luego `pull --rebase` + `push`. |

## Convenciones de código (estilo Sunner, ligero)

- **Commits:** **Conventional Commits en español** — `type(scope): descripción`, imperativo, minúscula, ≤72 car. Types: `feat/fix/refactor/perf/test/docs/style/build/ci/chore/revert`. Body para cambios complejos.
- **TypeScript:** evitar `any` (usar `unknown` o tipos concretos). Types/Interfaces/Componentes en PascalCase; funciones/variables/constantes en camelCase; **API y DB en snake_case** (`created_at`, `image_path`).
- **React:** un componente por archivo; interfaz de props nombrada `Props`. Archivos de componente en PascalCase, utilidades en camelCase.
- **Formato:** Prettier + ESLint + tsconfig adaptados de Sunner. Comentarios explican el "porqué", no el "qué".
- **Sin i18n hoy:** app solo en español (lo simplificamos respecto a Sunner para ir rápido).
- Mantener el front **desplegable como estático** en Vercel; toda la persistencia/realtime vía Supabase.
