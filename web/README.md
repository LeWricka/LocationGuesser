# LocationGuesser — web (v0.2)

Front de LocationGuesser: React + Vite + TypeScript. Datos en Supabase (sin backend propio).

## Requisitos

- Node ≥ 20
- Un proyecto Supabase (URL + publishable key)

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # y rellena tus credenciales de Supabase
npm run dev                  # http://localhost:5173
```

## Scripts

| Script                            | Qué hace                         |
| --------------------------------- | -------------------------------- |
| `npm run dev`                     | Servidor de desarrollo (Vite)    |
| `npm run build`                   | Type-check + build de producción |
| `npm run preview`                 | Sirve el build                   |
| `npm run type-check`              | Solo type-check (`tsc -b`)       |
| `npm run lint` / `lint:fix`       | ESLint                           |
| `npm run format` / `format:check` | Prettier                         |
| `npm run test` / `test:watch`     | Vitest                           |
| `npm run design-lint`             | Guardarrailes visuales (abajo)   |

## Design-lint (guardarrailes visuales)

`npm run design-lint` (corre también en CI) caza recaídas que ESLint/Prettier no
ven y SOLO falla con violaciones **nuevas** respecto a `scripts/design-lint-baseline.json`:

1. **color** — `#hex` / `rgb()` / `rgba()` / `hsl()` en CSS y estilos inline de
   TS/TSX. Excepto `src/ui/tokens.css` (allí se definen). Usa `var(--…)`.
2. **vh** — `100vh` en CSS → usa `100dvh`/`100svh` (el `vh` colapsa con el teclado móvil).
3. **emoji** — emoji en literales de UI (TS/TSX) → usa lucide vía `<Icon>`.
4. **overlap** — `width: 200%` (el patrón de tabs solapados que ya se corrigió).

Silenciar una excepción legítima: añade en la **misma línea** un comentario
`/* design-lint-allow: motivo */` (o `// design-lint-allow: motivo` en TS/TSX).
Al arreglar deuda a propósito, regenera la foto con `npm run design-lint -- --update-baseline`
(nunca para tapar una recaída). Detalle en la cabecera de `scripts/design-lint.mjs`.

## Estructura (por features)

```
src/
├─ lib/        # utilidades transversales (geo: haversine, scoring, formato)
├─ test/       # setup de Vitest
└─ features/   # (próximamente) crear, jugar, grupo, identidad…
```

## Variables de entorno

- `VITE_SUPABASE_URL` — URL del proyecto Supabase.
- `VITE_SUPABASE_PUBLISHABLE_KEY` — publishable key (pública por diseño).

La `.env.local` no se versiona; usa `.env.example` como plantilla.

## Notas

- La app v0.1 (web estática) está archivada en `../legacy/v0.1/` como referencia.
- Diseño y modelo de datos completos: `../docs/estrategia/prueba-de-un-dia.md`.
