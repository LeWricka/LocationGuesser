#!/usr/bin/env node
// design-lint — guardarrailes deterministas contra recaidas visuales tipicas.
//
// Por que existe: ESLint/Prettier no ven estas clases de bug (colores fuera de
// los tokens, `100vh` que colapsa con el teclado movil, emoji en vez de iconos
// lucide, el patron de paneles solapados). Este script las caza con grep
// dirigido y SOLO falla con violaciones NUEVAS, no con la deuda ya existente.
//
// Como funciona el gate sin bloquear `main`:
//  - Cada violacion produce una "huella" estable (regla + fichero + contenido
//    normalizado de la linea, SIN numero de linea para que mover codigo no la
//    invalide).
//  - `design-lint-baseline.json` es la foto de la deuda existente. Una huella
//    que esta en el baseline NO falla (pero se cuenta). Una huella nueva SI
//    falla. Asi main queda en verde y toda recaida futura se bloquea.
//  - `--update-baseline` regenera la foto (usalo solo al arreglar deuda a
//    proposito, nunca para tapar una recaida).
//
// Como silenciar una violacion legitima de forma permanente:
//  - Anade un comentario  /* design-lint-allow: motivo */  (o `// …` en TS/TSX)
//    en la MISMA linea de la violacion O en la linea inmediatamente anterior.
//    (Las dos posiciones valen porque Prettier puede partir una declaracion
//    `calc(…)` con comentario en varias lineas.) El motivo es obligatorio.
//
// Reglas:
//  1 color   — #hex / rgb() / rgba() / hsl() / hsla() en CSS y estilos inline
//              de TS/TSX. EXCEPTO src/ui/tokens.css (alli se DEFINEN). Usa var(--…).
//  2 vh      — `100vh` en CSS → usa 100dvh / 100svh (el vh infla con la barra
//              del navegador y colapsa con el teclado en movil).
//  3 emoji   — emoji pictografico en literales de TS/TSX → usa lucide via <Icon>.
//  4 overlap — `width: 200%` (el patron de "pistas" de tabs que causaba el
//              solapamiento de paneles; se resolvio renderizando solo el tab
//              activo). Avisa si reaparece.
//  5 radius  — border-radius con px crudos en vez de var(--radius-*). El sistema
//              tiene una escala de radios (xs/sm/md/lg/xl/full); un px suelto
//              rompe la coherencia de esquina del producto. Alta senal: detectar
//              es trivial y el remedio es claro (incl. 999px → var(--radius-full)).
//  6 zindex  — z-index numerico en vez de var(--z-*). El z-index suelto fue causa
//              raiz de bugs de solapamiento (paneles del mapa tapando hojas); la
//              escala de pisos con nombre existe justo para eso. Numeros sueltos
//              son fragiles al mergear y reintroducen el problema.
//  7 fontsize— font-size con px/rem crudos en vez de var(--font-size-*) o un rol
//              tipografico (.t-*). El tamano suelto es como se "escapa" la escala
//              de texto; centralizarlo mantiene la jerarquia. NOTA: las tarjetas
//              rasterizadas (ResultCard/LeaderboardCard/Medal) renderizan a tamano
//              fijo para exportar imagen y usan px a proposito → su deuda queda
//              CONGELADA en el baseline (no se exige refactor), pero recaidas en UI
//              interactiva nueva SI fallan.
//  8 motion  — dos sub-reglas sobre el MOVIMIENTO, cimiento del sistema:
//              (a) DURACION CRUDA: un tiempo literal (120ms / 0.3s) en una
//                  declaracion transition / animation / *-duration en vez de
//                  var(--motion-*). Las duraciones y curvas son tokens
//                  (`--motion-duration-*`, `--motion-ease-*`); un tiempo suelto
//                  descoordina el ritmo del producto y esquiva la calibracion en
//                  un solo sitio. NO marca cubic-bezier (no lleva unidad de
//                  tiempo) ni el `var(--…)` con token.
//              (b) BUCLE PROHIBIDO: `infinite` en una declaracion animation. La
//                  decision del dueno es que toda animacion es ENTRADA (un ciclo)
//                  o FEEDBACK (al tocar), NUNCA decoracion en bucle. Los bucles
//                  legitimos y acotados (spinner de carga, shimmer) llevan
//                  `design-lint-allow: <motivo>` y quedan justificados; la deuda de
//                  bucles ambientales existente queda CONGELADA en el baseline.
//              Ambas se evaluan solo en CSS (donde vive el motion del kit).
//
// Por que NO hay regla de spacing (margin/padding crudos): se evaluo y tiene mala
// relacion senal/ruido sin trocear por selector — las mismas tarjetas rasterizadas
// y los ajustes opticos de 1px generan demasiados falsos positivos. Queda como
// limpieza manual / posible Fase 2 con scoping por clase (.sheet/.overlay).
//
//  9 faint-contrast — issue #611. --ink-400 (alias --color-text-faint) fallaba AA
//              (4.5:1) y mordio 5 veces: el axe de CI cazaba un USO nuevo cada vez
//              y se parcheaba a mano a --color-text-muted, pero el token de base
//              nunca se arreglaba. En vez de vetar el token (perderiamos un nivel
//              real de la escala tipografica), esta regla recalcula el contraste
//              del HEX de --ink-400 en tokens.css contra --paper (#F4F3EF) y
//              blanco (#FFFFFF) en cada build. Si alguien lo vuelve a bajar de AA
//              sin querer, el build revienta AQUI — no cinco pantallas mas tarde
//              vía un axe que solo ve usos, nunca el valor del propio token. No
//              participa del sistema de huellas/baseline (no es un patron que
//              grandfathering: o el token es AA o no lo es).

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const webRoot = join(here, '..')
const srcRoot = join(webRoot, 'src')
const baselinePath = join(here, 'design-lint-baseline.json')

const TOKENS_FILE = 'src/ui/tokens.css'
const ALLOW = /design-lint-allow:/

// --- recoleccion de ficheros -------------------------------------------------

function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue
      walk(full, exts, out)
    } else if (exts.some((e) => name.endsWith(e))) {
      out.push(full)
    }
  }
  return out
}

const rel = (f) => relative(webRoot, f).split('\\').join('/')

// Tests, stories, fixtures y la galeria de desarrollo: el emoji y los colores ahi
// son datos de prueba/andamiaje dev (no entra en el build de produccion), no UI
// real. Se excluyen de TODAS las reglas.
const isTestLike = (path) =>
  /\.(test|spec|stories)\.[tj]sx?$/.test(path) ||
  path.includes('/__tests__/') ||
  path.includes('/gallery/')

// --- huellas -----------------------------------------------------------------

// La huella NO incluye el numero de linea: si el codigo se mueve, sigue siendo
// la misma huella y el baseline aguanta. Separador visible ` :: `.
function fingerprint(ruleId, path, line) {
  const norm = line.trim().replace(/\s+/g, ' ')
  return [ruleId, path, norm].join(' :: ')
}

// --- vaciado de comentarios (para no marcar emoji/colores en comentarios) ----
//
// Procesa un fichero entero como flujo y devuelve, por linea, SOLO el codigo:
// reemplaza por espacios el contenido de comentarios de bloque (incluso multi-
// linea, p.ej. el comentario que advierte «nunca 100vh») y de linea (// …). No
// es un parser completo (no distingue // dentro de un string), pero para CSS y
// el TS/TSX de este repo basta y no produce falsos positivos en comentarios.
function blankComments(source, lang) {
  const result = []
  let inBlock = false
  for (const raw of source.split('\n')) {
    let s = ''
    let i = 0
    while (i < raw.length) {
      if (inBlock) {
        if (raw[i] === '*' && raw[i + 1] === '/') {
          inBlock = false
          s += '  '
          i += 2
        } else {
          s += ' '
          i += 1
        }
      } else if (raw[i] === '/' && raw[i + 1] === '*') {
        inBlock = true
        s += '  '
        i += 2
      } else if (lang === 'ts' && raw[i] === '/' && raw[i + 1] === '/') {
        s += ' '.repeat(raw.length - i) // resto de linea es comentario
        break
      } else {
        s += raw[i]
        i += 1
      }
    }
    result.push(s)
  }
  return result
}

// --- reglas ------------------------------------------------------------------

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/

// En TS/TSX solo nos interesan colores en CONTEXTO de estilo (props style,
// fill/stroke/stopColor de SVG, o strings de color), no hashes de rutas.
const TS_STYLE_HINT =
  /(color|colour|background|border|fill|stroke|shadow|stopColor|gradient|tint|rgba?\(|hsla?\(|#[0-9a-fA-F]{3,8}\b)/i

// Emoji pictografico (no flechas tipograficas ←→, que se usan en copy).
// Cubre Misc Symbols & Pictographs, Emoticons, Transport, Supplemental, Symbols
// & Pictographs Extended, Dingbats (parcial), banderas y el selector VS16.
const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{2B00}-\u{2BFF}]|[\u{1F1E6}-\u{1F1FF}]|\u{FE0F}/u

const VH_RE = /\b100vh\b/
const OVERLAP_RE = /width:\s*200%/i

// border-radius con una longitud en px (cruda). Captura `border-radius: 12px`,
// shorthands (`18px 18px 0 0`) y `999px`. NO marca: `0` puro, `%`, `var(--…)`,
// `calc(…)` ni `inherit`. Mira solo declaraciones de border-radius (incl. las
// long-hand border-*-radius) para no pisar otras props.
const RADIUS_PROP_RE = /\bborder(-[a-z]+)*-radius\s*:/i
const PX_LEN_RE = /\b\d*\.?\d+px\b/

// z-index numerico literal (positivo o negativo). NO marca var(--z-*) ni `auto`.
const ZINDEX_RE = /\bz-index\s*:\s*-?\d+\b/i

// font-size con px o rem crudos. NO marca var(--…), %, em, ch, ni keywords
// (inherit/smaller/larger). Se evalua sobre la declaracion font-size.
const FONTSIZE_PROP_RE = /\bfont-size\s*:/i
const FONTSIZE_RAW_RE = /\bfont-size\s*:\s*[^;]*\b\d*\.?\d+(px|rem)\b/i

// Motion. (a) Duracion cruda: la linea declara transition/animation/*-duration
// Y contiene un tiempo literal (ms o s). Marcamos por linea (los shorthands
// multivalor de transition/animation viven en una sola linea en este repo tras
// Prettier). Un tiempo dentro de `var(--motion-…)` no aparece literal → no marca.
const MOTION_PROP_RE = /\b(transition|animation)(-duration)?\s*:/i
const TIME_LITERAL_RE = /\b\d*\.?\d+m?s\b/i
// (b) Bucle: `infinite` en una animation (shorthand o animation-iteration-count).
const MOTION_INFINITE_RE = /\banimation(-iteration-count)?\s*:[^;]*\binfinite\b/i

function lintCssCode(path, code) {
  const out = []
  const isTokens = path === TOKENS_FILE
  if (!isTokens && COLOR_RE.test(code)) {
    out.push({ ruleId: 'color', msg: 'color hardcodeado; usa var(--…)' })
  }
  if (VH_RE.test(code)) {
    out.push({ ruleId: 'vh', msg: '100vh colapsa con el teclado movil; usa 100dvh/100svh' })
  }
  if (OVERLAP_RE.test(code)) {
    out.push({
      ruleId: 'overlap',
      msg: 'width:200% (patron de paneles solapados); renderiza solo el tab activo',
    })
  }
  // El archivo de tokens DEFINE la escala de radios/tamaños/pisos → exento de
  // radius/fontsize/zindex igual que de color.
  if (!isTokens) {
    if (RADIUS_PROP_RE.test(code) && PX_LEN_RE.test(code)) {
      out.push({ ruleId: 'radius', msg: 'border-radius en px; usa var(--radius-*)' })
    }
    if (ZINDEX_RE.test(code)) {
      out.push({ ruleId: 'zindex', msg: 'z-index numerico; usa var(--z-*) (pisos con nombre)' })
    }
    if (FONTSIZE_PROP_RE.test(code) && FONTSIZE_RAW_RE.test(code)) {
      out.push({
        ruleId: 'fontsize',
        msg: 'font-size en px/rem; usa var(--font-size-*) o un rol .t-*',
      })
    }
    if (MOTION_PROP_RE.test(code) && TIME_LITERAL_RE.test(code)) {
      out.push({
        ruleId: 'motion',
        msg: 'duracion cruda en transition/animation; usa var(--motion-duration-*)',
      })
    }
    if (MOTION_INFINITE_RE.test(code)) {
      out.push({
        ruleId: 'motion',
        msg: 'animation infinite (bucle prohibido); entrada/feedback, no decoracion',
      })
    }
  }
  return out
}

function lintTsCode(code) {
  const out = []
  if (EMOJI_RE.test(code)) {
    out.push({ ruleId: 'emoji', msg: 'emoji en UI; usa lucide via <Icon>' })
  }
  if (TS_STYLE_HINT.test(code) && COLOR_RE.test(code)) {
    out.push({ ruleId: 'color', msg: 'color hardcodeado en estilo inline; usa var(--…)' })
  }
  return out
}

// --- centinela de contraste del token "faint" (regla 9, issue #611) ---------
//
// Formula WCAG 2.1 de luminancia relativa / ratio de contraste (la misma que usa
// axe-core), reimplementada aqui en ~15 lineas para no anadir una dependencia
// solo por esto.
function srgbChannelToLinear(c8bit) {
  const c = c8bit / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
function relativeLuminance([r, g, b]) {
  const [R, G, B] = [r, g, b].map(srgbChannelToLinear)
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}
function hexToRgb(hex) {
  const clean = hex.replace('#', '')
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function contrastRatio(hexA, hexB) {
  const lA = relativeLuminance(hexToRgb(hexA))
  const lB = relativeLuminance(hexToRgb(hexB))
  const [hi, lo] = lA > lB ? [lA, lB] : [lB, lA]
  return (hi + 0.05) / (lo + 0.05)
}

const AA_NORMAL_TEXT_RATIO = 4.5
const FAINT_TOKEN_RE = /--ink-400:\s*(#[0-9a-fA-F]{3,8})\s*;/
const FAINT_BACKGROUNDS = { '--paper (#F4F3EF)': '#f4f3ef', 'blanco (#FFFFFF)': '#ffffff' }

function checkFaintTokenContrast() {
  const tokensPath = join(webRoot, TOKENS_FILE)
  const source = readFileSync(tokensPath, 'utf8')
  const match = source.match(FAINT_TOKEN_RE)
  if (!match) {
    return [
      `design-lint [faint-contrast]: no encuentro "--ink-400: #……;" en ${TOKENS_FILE}. ` +
        '¿Se renombro o reformateo el token? Actualiza FAINT_TOKEN_RE en scripts/design-lint.mjs.',
    ]
  }
  const hex = match[1]
  const errors = []
  for (const [label, bg] of Object.entries(FAINT_BACKGROUNDS)) {
    const ratio = contrastRatio(hex, bg)
    if (ratio < AA_NORMAL_TEXT_RATIO) {
      errors.push(
        `design-lint [faint-contrast]: --ink-400 (${hex}) da ${ratio.toFixed(2)}:1 sobre ${label} ` +
          `— por debajo de AA (${AA_NORMAL_TEXT_RATIO}:1). Este es el invariante del issue #611: ` +
          'si bajas el hex, sube el contraste a la vez (o el gotcha vuelve a morder).',
      )
    }
  }
  return errors
}

// --- ejecucion ---------------------------------------------------------------

const cssFiles = walk(srcRoot, ['.css'])
const tsFiles = walk(srcRoot, ['.tsx', '.ts'])

const violations = []
const scan = (files, lang, lint) => {
  for (const file of files) {
    const path = rel(file)
    if (isTestLike(path)) continue
    const source = readFileSync(file, 'utf8')
    const rawLines = source.split('\n')
    const codeLines = blankComments(source, lang)
    rawLines.forEach((line, i) => {
      // Un allow-comment silencia su propia linea y las adyacentes: asi sobrevive
      // a que Prettier parta una declaracion `calc(…)` con comentario en varias.
      const allowed =
        ALLOW.test(line) ||
        (i > 0 && ALLOW.test(rawLines[i - 1])) ||
        (i + 1 < rawLines.length && ALLOW.test(rawLines[i + 1]))
      if (allowed) return
      for (const v of lint(path, codeLines[i])) {
        violations.push({ ...v, path, lineNo: i + 1, line, fp: fingerprint(v.ruleId, path, line) })
      }
    })
  }
}
scan(cssFiles, 'css', (path, code) => lintCssCode(path, code))
scan(tsFiles, 'ts', (_path, code) => lintTsCode(code))

// Regla 9: no es un grep por linea, es un invariante del propio token. Siempre
// se exige (no entra en el baseline): o el hex de --ink-400 es AA o no lo es.
const faintContrastErrors = checkFaintTokenContrast()

const updating = process.argv.includes('--update-baseline')

if (updating) {
  const fps = [...new Set(violations.map((v) => v.fp))].sort()
  writeFileSync(baselinePath, JSON.stringify({ fingerprints: fps }, null, 2) + '\n')
  console.log(`design-lint: baseline actualizado con ${fps.length} huellas existentes.`)
  if (faintContrastErrors.length > 0) {
    console.error('')
    faintContrastErrors.forEach((e) => console.error(e))
    process.exit(1)
  }
  process.exit(0)
}

let baseline = { fingerprints: [] }
try {
  baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
} catch {
  console.error(
    'design-lint: falta design-lint-baseline.json. Genera con: npm run design-lint -- --update-baseline',
  )
  process.exit(1)
}
const baseSet = new Set(baseline.fingerprints)

const fresh = violations.filter((v) => !baseSet.has(v.fp))
const grandfathered = violations.length - fresh.length

if (fresh.length === 0 && faintContrastErrors.length === 0) {
  console.log(
    `design-lint: OK. 0 recaidas nuevas (${grandfathered} violaciones existentes toleradas por baseline).`,
  )
  process.exit(0)
}

if (faintContrastErrors.length > 0) {
  console.error(`design-lint: ${faintContrastErrors.length} violacion(es) de contraste:\n`)
  faintContrastErrors.forEach((e) => console.error(`  ${e}`))
  console.error('')
}

if (fresh.length > 0) {
  console.error(`design-lint: ${fresh.length} recaida(s) NUEVA(S):\n`)
  for (const v of fresh) {
    console.error(`  ${v.path}:${v.lineNo}  [${v.ruleId}] ${v.msg}`)
    console.error(`    ${v.line.trim()}`)
  }
  console.error('\nArreglalo (usa var(--…) / 100dvh / lucide / un solo tab) o, si es legitimo,')
  console.error('anade en la MISMA linea  /* design-lint-allow: motivo */  (o // … en TS/TSX).')
  console.error('NO uses --update-baseline para tapar una recaida.')
}
process.exit(1)
