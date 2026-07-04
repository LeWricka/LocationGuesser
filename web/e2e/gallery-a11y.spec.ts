import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import AxeBuilder from '@axe-core/playwright'
import { type Route, expect, test } from '@playwright/test'

// Guardarraíl de accesibilidad + viewports extremos (issue #396). Recorre CADA caso
// de la galería (web/src/gallery/**, que ya renderiza las pantallas REALES con
// fixtures, sin login ni red) y, por caso:
//   1. axe-core a un viewport representativo (móvil 390×844): falla solo con
//      violaciones de impacto serio/crítico.
//   2. no-overflow horizontal a 320px (móvil pequeño): scrollWidth <= clientWidth.
//
// Como en design-lint, usa un BASELINE (gallery-a11y-baseline.json, con dos listas:
// `axe` y `overflow`) para no bloquear `main` por deuda previa: una huella ya conocida
// se tolera (se cuenta); una huella NUEVA hace fallar el check. Así main queda en verde
// y solo las regresiones futuras bloquean. Regenerar el baseline (solo al arreglar
// deuda a propósito, nunca para tapar una regresión):
//
//   A11Y_UPDATE_BASELINE=1 npm run a11y
//
// Determinismo: el entry de la galería congela el reloj y apaga animaciones; aquí
// bloqueamos toda la red EXTERNA (tiles/SDK/CDN) para que nada fuera de localhost
// ensucie el análisis. La lista de casos se lee de window.__galleryCases (no se
// hardcodea: añadir un caso en cases.tsx lo añade a la prueba solo).

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASELINE_PATH = path.join(__dirname, '..', 'gallery-a11y-baseline.json')

// Solo bloqueamos lo que de verdad rompe el uso: serio y crítico. Las violaciones
// 'minor'/'moderate' (deuda menor de contraste/landmarks) no frenan el merge.
const BLOCKING_IMPACTS = new Set(['serious', 'critical'])

interface GalleryCaseMeta {
  id: string
  title: string
  section: string
}

interface Baseline {
  // Violaciones de axe ya conocidas (deuda de a11y). Huella: caso :: regla :: target.
  axe: string[]
  // Casos cuya pantalla desborda a 320px de forma conocida (p.ej. la tarjeta de
  // resultado, que es una imagen de tamaño fijo para compartir, no una pantalla).
  // Huella: id del caso.
  overflow: string[]
}

// Huella estable de una violación axe: caso + regla axe + primer target (selector CSS
// del nodo). NO incluye texto libre del mensaje (que puede variar entre versiones de
// axe) para que el baseline aguante actualizaciones de la librería.
function fingerprint(caseId: string, ruleId: string, target: string): string {
  return [caseId, ruleId, target].join(' :: ')
}

// Bloquea cualquier petición a un host que NO sea localhost: el contenido es 100%
// local (fixtures + data-URIs), así que cualquier red externa sería ruido no
// determinista (y dejaría la galería offline si fallara).
const blockExternal = (route: Route) => {
  const url = route.request().url()
  if (url.startsWith('http://localhost') || url.startsWith('data:') || url.startsWith('blob:')) {
    return route.continue()
  }
  return route.abort()
}

const updating = process.env.A11Y_UPDATE_BASELINE === '1'

function loadBaseline(): Baseline {
  try {
    const raw = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as Partial<Baseline>
    return { axe: raw.axe ?? [], overflow: raw.overflow ?? [] }
  } catch {
    if (updating) return { axe: [], overflow: [] }
    throw new Error(
      `a11y: falta gallery-a11y-baseline.json. Genéralo con: A11Y_UPDATE_BASELINE=1 npm run a11y`,
    )
  }
}

test('accesibilidad (axe) + sin overflow horizontal a 320px en cada caso', async ({
  browser,
  baseURL,
}) => {
  // Viewport representativo para axe (móvil estándar) y viewport extremo para overflow.
  const A11Y_VP = { width: 390, height: 844 }
  const NARROW_VP = { width: 320, height: 568 }

  const context = await browser.newContext({ baseURL })
  await context.route('**/*', blockExternal)
  const page = await context.newPage()

  // Cargamos el índice para leer la lista de casos publicada por el entry.
  await page.goto('/gallery.html')
  const cases = await page.evaluate<GalleryCaseMeta[]>(() => window.__galleryCases ?? [])
  expect(cases.length, 'la galería debe publicar casos en window.__galleryCases').toBeGreaterThan(0)

  const baseline = loadBaseline()
  const axeBaseSet = new Set(baseline.axe)
  const overflowBaseSet = new Set(baseline.overflow)

  // Huellas de violaciones axe bloqueantes vistas en esta corrida (para el baseline /
  // el diff de regresiones nuevas).
  const seenAxe = new Set<string>()
  // Ids de casos que desbordan a 320px en esta corrida (para el baseline / el diff).
  const seenOverflow = new Set<string>()
  // Regresiones de a11y NUEVAS (no toleradas por el baseline) → mensajes legibles.
  const fresh: string[] = []
  // Casos que desbordan horizontalmente a 320px y NO están en el baseline.
  const overflows: string[] = []

  for (const c of cases) {
    // --- 1) Accesibilidad (axe) a viewport representativo --------------------
    await page.setViewportSize(A11Y_VP)
    await page.goto(`/gallery.html?case=${encodeURIComponent(c.id)}`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('#root')).not.toBeEmpty()

    // Guardarraíl #670: si el caso pinta el estado de error genérico es que el
    // fixture/stub se rompió (p.ej. un método del builder sin implementar en
    // fakeSupabase). axe pasa igual sobre un estado de error, así que se afirma aquí.
    await expect(
      page.getByText(/No hemos podido cargar/),
      `[${c.id}] pinta el estado de error genérico — fixture/stub roto`,
    ).toHaveCount(0)

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    for (const v of results.violations) {
      if (!v.impact || !BLOCKING_IMPACTS.has(v.impact)) continue
      for (const node of v.nodes) {
        const target = Array.isArray(node.target) ? String(node.target[0]) : String(node.target)
        const fp = fingerprint(c.id, v.id, target)
        seenAxe.add(fp)
        if (!axeBaseSet.has(fp) && !updating) {
          fresh.push(`  [${c.id}] ${v.id} (${v.impact}) — ${target}\n      ${v.help}`)
        }
      }
    }

    // --- 2) No-overflow horizontal a 320px -----------------------------------
    await page.setViewportSize(NARROW_VP)
    // Re-evaluar tras el cambio de viewport (layout reflow); el caso ya está montado.
    const overflow = await page.evaluate(() => {
      const el = document.documentElement
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
    })
    if (overflow.scrollWidth > overflow.clientWidth) {
      seenOverflow.add(c.id)
      if (!overflowBaseSet.has(c.id) && !updating) {
        overflows.push(
          `  [${c.id}] desborda a 320px: scrollWidth=${overflow.scrollWidth} > clientWidth=${overflow.clientWidth}`,
        )
      }
    }
  }

  await context.close()

  if (updating) {
    const next: Baseline = {
      axe: [...seenAxe].sort(),
      overflow: [...seenOverflow].sort(),
    }
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + '\n')
    console.log(
      `a11y: baseline actualizado con ${next.axe.length} violaciones serias/críticas y ${next.overflow.length} overflows a 320px.`,
    )
    return
  }

  const problems: string[] = []
  if (fresh.length > 0) {
    problems.push(
      `accesibilidad: ${fresh.length} violación(es) seria/crítica NUEVA(S):\n` + fresh.join('\n'),
    )
  }
  if (overflows.length > 0) {
    problems.push(
      `viewport 320px: ${overflows.length} caso(s) NUEVO(S) con overflow horizontal:\n` +
        overflows.join('\n'),
    )
  }

  expect(
    problems,
    problems.join('\n\n') +
      '\n\nArréglalo en la pantalla. Si es deuda legítima y conocida, regenera el baseline' +
      ' a propósito: A11Y_UPDATE_BASELINE=1 npm run a11y',
  ).toEqual([])

  console.log(
    `a11y: OK. 0 regresiones nuevas (${seenAxe.size} violaciones serias/críticas y ` +
      `${seenOverflow.size} overflows a 320px tolerados por baseline).`,
  )
})
