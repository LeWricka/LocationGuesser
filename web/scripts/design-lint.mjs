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

const updating = process.argv.includes('--update-baseline')

if (updating) {
  const fps = [...new Set(violations.map((v) => v.fp))].sort()
  writeFileSync(baselinePath, JSON.stringify({ fingerprints: fps }, null, 2) + '\n')
  console.log(`design-lint: baseline actualizado con ${fps.length} huellas existentes.`)
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

if (fresh.length === 0) {
  console.log(
    `design-lint: OK. 0 recaidas nuevas (${grandfathered} violaciones existentes toleradas por baseline).`,
  )
  process.exit(0)
}

console.error(`design-lint: ${fresh.length} recaida(s) NUEVA(S):\n`)
for (const v of fresh) {
  console.error(`  ${v.path}:${v.lineNo}  [${v.ruleId}] ${v.msg}`)
  console.error(`    ${v.line.trim()}`)
}
console.error('\nArreglalo (usa var(--…) / 100dvh / lucide / un solo tab) o, si es legitimo,')
console.error('anade en la MISMA linea  /* design-lint-allow: motivo */  (o // … en TS/TSX).')
console.error('NO uses --update-baseline para tapar una recaida.')
process.exit(1)
