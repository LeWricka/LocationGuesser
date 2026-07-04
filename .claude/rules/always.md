# Reglas de trabajo — LocationGuesser

> Playbook compartido. **Todo agente que trabaje en este repo debe leer y seguir estas reglas.**
> El hilo principal de Claude actúa como **orquestador**; el trabajo se hace en **agentes/subagentes paralelos**.

## 0. Seguridad (no negociable)

- **Único repo:** `LeWricka/LocationGuesser`. NUNCA crear issues, ramas, PRs ni pushear a otro repo (p.ej. nada de Saltoki).
- **Sin secretos en git.** La publishable key de Supabase es pública (va en el cliente) y vive en `web/.env.local` (gitignoreado) y en Vercel. La contraseña de la BD y tokens de acceso NUNCA se escriben en el repo.

## 1. Modelo de orquestación

- El **hilo principal orquesta**: descompone el trabajo, crea issues, lanza agentes y mergea.
- **Paralelizar al máximo** con agentes en **worktrees** (`isolation: "worktree"`), cada uno en un **área que no se pisa** con los demás:
  - `web/src/ui` + `App.tsx` + `web/src/features/**` + `index.css` → UI / presentacional.
  - `web/src/lib/**` → datos y lógica (no presentacional).
  - `supabase/**` → esquema y Edge Functions.
  - `.github/**` → CI.
  - `docs/**`, `.claude/**` → documentación y configuración.
- Un agente = un área = una issue = una rama = un PR. No tocar ficheros fuera de tu área.

## 2. Flujo por issue

1. Coger/crear la issue en el **Project #14** y ponerla **In progress**.
2. Rama desde `main`: `feat/<n>-<slug>` o `chore/<n>-<slug>`.
3. Implementar + **verificar** (sección 4).
4. Commit (sección 3), `git push -u origin <rama>`, abrir PR a `main` con `Closes #<n>`.
5. PR → **In review**. Al mergear (squash) → **Done**.

## 3. Commits y PRs

- **Conventional Commits en español:** `type(scope): descripción` — imperativo, minúscula, ≤72 car.
  Types: `feat | fix | refactor | perf | test | docs | style | build | ci | chore | revert`.
- Cuerpo opcional tras línea en blanco para cambios complejos.
- Terminar el mensaje de commit con:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Terminar el body del PR con:
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`

## 4. Verificación obligatoria (antes de abrir PR)

Desde `web/` (en un worktree hace falta `npm install` primero, no hay node_modules):

```
npm run format && npm run lint && npm run type-check && npm run test && npm run build
```

Todo en verde. El CI repite estos checks en cada PR.

**Smoke E2E (el orquestador lo corre ANTES de pasar nada al usuario):**

```
cd web && npx playwright install chromium   # una vez
npm run e2e        # local (levanta el dev server)
npm run e2e:prod   # producción (https://www.momentu.art)
```

Playwright dirige un navegador real y caza lo que los unit tests no ven:
errores de consola, peticiones fallidas, flujos rotos y regresiones de
interacción/z-index (un click sobre un elemento tapado falla). El usuario solo
hace la validación final; el orquestador valida primero.

## 5. Estilo de código (estilo Sunner, ligero)

- **Prettier:** sin punto y coma, comillas simples, `trailingComma: all`, `printWidth: 100`.
- **TypeScript:** evitar `any` (usar `unknown` o tipos concretos). PascalCase para tipos/interfaces/componentes; camelCase para funciones/vars; **snake_case en BD/API** (`created_at`, `image_path`).
- **React:** un componente por fichero; interfaz de props llamada `Props`. UI con el **UI kit** (`web/src/ui`) y los **tokens**; no hardcodear colores/espaciados.
- **Sin i18n** hoy: la app es solo en español.
- Comentarios: explican el **porqué**, no el qué.

## 6. Acceso a Supabase

- Proyecto ref: `ykquigyjvgxisgdxryxr`. URL: `https://ykquigyjvgxisgdxryxr.supabase.co`.
- Env del front: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (en `web/.env.local`; plantilla en `web/.env.example`).
- Cliente tipado: `web/src/lib/supabase.ts` + `web/src/lib/database.types.ts`.
- **Migraciones** versionadas en `supabase/migrations/`. Aplicar: pegar el SQL en el SQL Editor del dashboard, o `npx supabase db push` (requiere login + link).
- **Verificar esquema/datos** sin credenciales sensibles: REST con la publishable key, p.ej.
  `curl "$URL/rest/v1/<tabla>?select=*&limit=1" -H "apikey: <publishable>" -H "Authorization: Bearer <publishable>"`.
- **Edge Functions** en `supabase/functions/`; desplegar con `npx supabase functions deploy <nombre>`.

## 7. Despliegue (Vercel)

- Front estático en Vercel, **Root Directory = `web`**, con las dos env `VITE_*`.
- Cada merge a `main` redespliega. Prod: `https://www.momentu.art`.

## 8. Project board (#14)

- `PROJECT_ID = PVT_kwHOABkrCM4BbIkS` (usuario `LeWricka`).
- Campo **Status** `PVTSSF_lAHOABkrCM4BbIkSzhV7ReQ`: Backlog `f75ad846` · Ready `61e4505c` · In progress `47fc9ee4` · In review `df73e18b` · Done `98236657`.
- **Priority** `PVTSSF_lAHOABkrCM4BbIkSzhV7RhY`: P0 `79628723` · P1 `0a877460` · P2 `da944a9c`.
- **Size** `PVTSSF_lAHOABkrCM4BbIkSzhV7Rhc`: XS `6c6483d2` · S `f784b110` · M `7515a9f1` · L `817d0097` · XL `db339eb2`.
- Crear issues + fijar campos: ver skill `create-use-cases`.

## 9. Modelos y coste (tiering)

> Objetivo: gastar Opus donde paga el razonamiento; el resto, en modelos baratos.

- **El hilo principal (orquestador) va en Opus.** Descomponer, decidir causa-raíz difícil,
  juicio de diseño, mergear: eso justifica Opus.
- **Los agentes ejecutores van en Sonnet por defecto** (`model: 'sonnet'` en la llamada al
  Agent tool / Workflow). Implementar un fix acotado, restyle, tests, refactor mecánico,
  documentación: Sonnet sobra y cuesta una fracción.
- **Sube un agente a Opus solo cuando el agente TIENE que pensar** (hunt de causa-raíz sin
  repro, diseño abierto, algoritmo delicado). Es la excepción, no la norma.
- **Tareas triviales (buscar ficheros, formatear) → Haiku** o hazlas inline en el hilo
  principal en vez de levantar un worktree.
- **No delegar lo pequeño.** Un fix de 1–2 ficheros cuesta menos inline que un worktree
  (que implica `npm install` completo + contexto nuevo + verificación entera). El patrón de
  agentes-en-paralelo es para trabajo **grande y disjunto**; lo pequeño, en el hilo principal.
- **Punteros precisos** a los agentes (fichero + función + línea) → exploran menos → gastan menos.
- **Apoyarse en CI para verificar.** No re-correr `format+lint+type-check+test+build+design-lint`
  local Y en CI Y otra vez en el orquestador: correr local lo mínimo antes del push; CI es la red.
