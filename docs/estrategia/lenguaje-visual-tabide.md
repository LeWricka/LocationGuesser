# Lenguaje visual de Tabide

> Fuente de verdad del sistema de diseño. Si una pantalla y este documento no
> coinciden, gana este documento (y se corrige la pantalla). El sistema vive en
> `web/src/ui/tokens.css` (tokens + roles tipográficos), las primitivas en
> `web/src/ui/**` y los guardarraíles en `web/scripts/design-lint.mjs`.

---

## 1. Dirección: Atelier editorial con pulido Polarsteps

Tabide es un **diario social de viaje**: el contenido real son **fotos y mapas**.
El diseño debe ceder el protagonismo a ese contenido (foto-first, mapa-héroe) y
envolverlo con una voz propia, cálida y de confianza.

La identidad de Tabide es **"Atelier / Pizarra"**: editorial estilo Kinfolk —
papel + tinta, un solo acento azul pizarra, y una **voz serif** (Cormorant
Garamond) para los titulares. Polarsteps es la **referencia de pulido** (foto a
sangre, aire generoso, mapa-héroe, tarjetas mínimas, esquinas suaves, iconos de
línea, CTAs prominentes sin ornamento), no un molde a copiar.

### Postura explícita: qué conservamos, qué adoptamos

| Eje | Polarsteps | Decisión de Tabide | Por qué |
|-----|-----------|--------------------|---------|
| Tipografía de titular | Sans moderno, jerarquía por peso | **Conservar el serif Cormorant** | Es la firma diferencial. Un diario de viaje all-sans es genérico; el serif da calidez editorial y nos distingue. El sans queda para cuerpo/UI/números. |
| Foto | A sangre, domina la pantalla | **Adoptar foto-first / edge-to-edge** | El contenido manda. La foto va sin marco; el chrome flota sobre ella. |
| Fondo | Blanco/hueso neutro | **Conservar papel** (#F6F7F9 + grano + halos quietos) | Cede el protagonismo a la imagen, igual que el hueso de Polarsteps, pero con textura cálida y QUIETA (nada anima de fondo). |
| Aire | Whitespace generoso | **Subir el aire** (gutters, estados vacíos, interlínea de titular) | Era el principal déficit frente a Polarsteps. |
| Mapa | Héroe interactivo | **Conservar mapa-héroe** (escena oscura con tokens `--scene-*`) | Ya alineado; el mapa es protagonista, no un widget. |
| Tarjetas | Mínimas, consistentes | **Conservar papel + hairline + sombra muy sutil** | La elevación la da el hairline + sombra tenue, nunca un glow. |
| Esquinas | Suaves, no exageradas | **Escala de radios contenida** (xs→full) | Coherencia de esquina en todo el producto. |
| Color | Neutro + acento | **Un solo acento** azul pizarra sólido (sin gradientes ni glows) | Sobriedad editorial; el acento se reserva a CTA / foco / dato "en juego". |
| Profundidad | Plana, sin skeuomorfismo | **Quietud**: sin glass, sin gradientes, sin halos en bucle | El movimiento queda solo en entradas y micro-feedback. |

**Resumen de una frase:** subimos Tabide al nivel de pulido de Polarsteps
(foto-first, aire, mapa-héroe, tarjetas mínimas) **sin perder la voz serif**
editorial que nos hace Tabide.

---

## 2. Color — paleta Pizarra

Color claro por defecto; las pantallas inmersivas usan el "modo escena" oscuro.
**Nunca se escribe un color literal**: todo sale de un token (lo enforça
design-lint). Definición completa en `tokens.css`.

- **Papel / superficies:** `--paper` (#F6F7F9, fondo) · `--surface` (#FFFFFF, hojas).
  El papel lleva grano SVG + dos halos radiales tenues, todo **estático**.
- **Tinta (jerarquía por niveles):** `--ink-900` (#18202B, titulares/cuerpo, AAA) ·
  `--ink-600` (secundario/meta, AA) · `--ink-400` (ayudas/placeholders/iconos).
- **Acento:** `--accent` (#34506B, azul pizarra) sólido · `--accent-deep` (hover /
  links de texto) · `--accent-tint` (fondos tenues de badge/chip/selección).
  Reservado a **CTA, foco y el dato "en juego"**.
- **Hairlines:** `--hairline` / `--hairline-soft` / `--hairline-strong`.
- **Semánticos sobrios:** `--color-success` (verde) · `--color-warning` (ocre
  tostado, NO ámbar) · `--color-danger` (rojo), cada uno con su `-soft`.
- **Modo escena (oscuro):** `--scene-bg`, `--scene-ink`, `--scene-ink-soft`,
  `--scene-veil`, `--scene-surface`, `--scene-hairline`. Es la **única** fuente para
  "tinta clara sobre escena oscura" (globo, satélite, foto a sangre): nadie escribe
  blancos/negros a mano.

---

## 3. Tipografía y escala

- **Display/titulares:** Cormorant Garamond (`--font-serif`), self-host. Pesos 500–600
  (la serif respira: el "bold" de titular es 600, **nunca** 700+).
- **Cuerpo / UI:** sans del sistema (`--font-sans`).
- **Números de dato:** sans **tabular** (`.lg-data`), para que las cifras no "bailen".

### Roles tipográficos (clases `.t-*`) — aplica un rol, no inventes `font-size`

| Rol | Familia | Tamaño | Uso |
|-----|---------|--------|-----|
| `.t-hero` | serif | `--font-size-3xl` (56) | Portada inmersiva a sangre. `text-wrap: balance`. |
| `.t-display` | serif | `--font-size-2xl` (44) | Hero / saludo de pantalla. |
| `.t-section` | serif | `--font-size-xl` (32) | Título de sección / sheet. |
| `.t-title` | serif | `--font-size-lg` (22) | Cabecera de pantalla, nombres. Interlínea `snug` (2 líneas respiran). |
| `.t-body` | sans | `--font-size-md` (17) | Lectura. ≥16px evita el zoom de iOS. |
| `.t-caption` | sans | `--font-size-sm` (14) | Metadatos y ayudas (tinta suave). |
| `.t-label` | sans | `--font-size-xs` (12) | Versalitas con tracking (eyebrows, badges). |

**Interlínea:** `--line-height-tight` (1.1, titular 1 línea) · `--line-height-snug`
(1.28, titular de 2–3 líneas) · `--line-height-normal` (1.6, cuerpo).

**Escala de tamaños** (`--font-size-*`): xs 12 · sm 14 · md 17 · lg 22 · xl 32 ·
2xl 44 · 3xl 56 · data 52. La regla `fontsize` de design-lint bloquea px/rem crudos.

---

## 4. Espaciado, radios, elevación

- **Espaciado** — escala de 4px, nombres por tamaño: `--space-0` (reset) · 1 (4) ·
  2 (8) · 3 (12) · 4 (16) · 5 (24) · 6 (32) · 7 (48) · 8 (64) · 9 (80).
  `--space-gutter` es el margen lateral de página (16 en móvil, 24 desde 480px).
  **No escribir px sueltos de margin/padding fuera de la escala.**
- **Radios** — esquinas contenidas (Kinfolk, no "burbuja"): `--radius-xs` (6,
  micro) · `--radius-sm` (10, inputs/botones) · `--radius-md` (16, tarjetas) ·
  `--radius-lg` (24, hojas/mapa) · `--radius-xl` (28, portada/sheet) ·
  `--radius-full` (999, pills). La regla `radius` bloquea px crudos.
- **Elevación** — papel: sombras **muy** sutiles, negros bajos y difusos, **sin
  glow**. `--shadow-xs/sm/md/lg/hover`. La elevación la lee el hairline + sombra
  tenue. Las hojas inferiores proyectan sombra hacia arriba (`--shadow-sheet`).

---

## 5. Principios mobile

1. **Foto-first:** la imagen va a sangre, sin marco. El chrome (cabecera, pies,
   pastillas) **flota** sobre ella con velo de legibilidad (`--scene-veil`) y tinta
   clara (`--scene-ink`), nunca con blancos/negros hardcodeados.
2. **Mapa-héroe:** el mapa es protagonista interactivo, en escena oscura.
3. **Aire:** gutters generosos, estados vacíos que respiran, titulares con
   interlínea holgada. El vacío es una pantalla, no una nota al pie.
4. **Touch targets ≥44px** (`--tap-target`); compacto = `--tap-target-sm` (36).
   Los icon-buttons son discos de 44px.
5. **Jerarquía por familia + tamaño + peso**, jamás por un fondo de color.
6. **Alturas:** `100dvh`/`100svh`, nunca `100vh` (colapsa con el teclado móvil).
7. **Quietud:** sin glass, sin gradientes de marca, sin halos en bucle. El
   movimiento es entrada (`lg-rise`/`lg-pop`) y micro-feedback; respeta
   `prefers-reduced-motion`.

---

## 6. Movimiento

**Nivel de movimiento (decisión del dueño): "micro-interacciones finas".**
Transiciones suaves, entradas coreografiadas (rise/pop + stagger), feedback al
tocar (press-state), gestos pulidos. Moderno y vivo **pero sin glows ni
gradientes de marca**: se conserva la *quietud* del sistema. La regla dura:

> **Toda animación es ENTRADA (un solo ciclo) o FEEDBACK (al tocar). Nunca
> decoración en bucle.** Nada de halos pulsando en `infinite`, nada ornamental
> permanente.

Y **siempre** se respeta `prefers-reduced-motion: reduce` (todo se desactiva o
salta a su estado final).

### Tokens de motion (`tokens.css`, namespace `--motion-*`)

Única fuente de verdad de duraciones y curvas. Nadie escribe un tiempo suelto en
un `transition`/`animation` (lo bloquea design-lint, regla `motion`).

| Token | Valor | Uso |
|-------|-------|-----|
| `--motion-duration-fast` | 120ms | micro-feedback (press, hover, color) |
| `--motion-duration-base` | 200ms | transiciones de UI, hojas, thumb |
| `--motion-duration-slow` | 320ms | entradas (`lg-rise`/`lg-pop`) |
| `--motion-duration-slower` | 480ms | entradas con muelle, stagger |
| `--motion-ease-standard` | `cubic-bezier(.4,0,.2,1)` | entradas/salidas sin overshoot |
| `--motion-ease-emphasized` | `cubic-bezier(.2,.8,.2,1)` | transición con carácter (por defecto) |
| `--motion-ease-exit` | `cubic-bezier(.4,0,1,1)` | salidas (acelera al desaparecer) |
| `--motion-ease-spring` | `cubic-bezier(.34,1.56,.64,1)` | muelle con overshoot (pops, con tino) |
| `--motion-stagger-step` | 70ms | retraso incremental por índice |
| `--motion-press-scale` | 0.98 | escala del press-state |
| `--motion-transition-fast` / `-base` | duración + curva | pares listos para `transition: <prop> var(--motion-transition-*)` |

Los nombres antiguos (`--duration-*`, `--ease-*`, `--transition-*`) siguen vivos
como **alias** que apuntan aquí; migran a `--motion-*` cuando cada pantalla se
restilice.

### Utilidades (`index.css`)

- **Entrada:** `lg-rise` (sube y aparece), `lg-pop` (escala con muelle),
  `lg-rise-pop` (sube + escala + overshoot, para héroes/CTAs).
- **Stagger:** `lg-stagger` en el padre → cada hijo directo entra con retraso
  incremental (`--motion-stagger-step`), hasta ~10 hijos. Para listas, rankings y
  secuencias de bloques.
- **Press-state:** `lg-press` → cualquier elemento pulsable "cede" al tocar
  (`transform: scale(var(--motion-press-scale))`) con la curva estándar. Es el
  mismo tacto que los botones, reutilizable en tarjetas clicables, chips o celdas.

Todas se anulan bajo `prefers-reduced-motion`.

### Primitivas con micro-interacción (propagan a toda la app)

- **`Button`** — press-state: la superficie escala hacia dentro al tocar
  (`--motion-press-scale`) y suelta su sombra; hover con lift sutil. Un gesto, sin
  bucle.
- **`SegmentedControl`** — el seleccionado ya no pinta su propio fondo: hay un
  **thumb** único en acento que **se desliza** entre segmentos (transición de
  `transform` con `--motion-transition-base`). Congelado bajo reduced-motion.
- **`Modal` / `BottomSheet` / `Toast`** — entrada con las duraciones/curvas de
  token (`--motion-duration-base` + curva estándar/emphasized); nada anima en bucle.

### Guardarraíl `motion` (design-lint)

Bloquea recaídas nuevas de forma determinista:

- **Duración cruda:** un tiempo literal (`250ms`, `0.3s`) en un
  `transition`/`animation`/`*-duration` → usa `var(--motion-duration-*)` (o un par
  `--motion-transition-*`). No marca `cubic-bezier` ni el `var(--…)` con token.
- **Bucle prohibido:** `infinite` en un `animation` → recuérdalo: entrada o
  feedback, nunca decoración. Los bucles legítimos y acotados (spinner, shimmer de
  carga) se justifican con `/* design-lint-allow: motivo */`.

La deuda existente (transiciones crudas y bucles ambientales repartidos por la
app) queda **congelada en el baseline**; solo fallan las recaídas nuevas.

### Qué queda para la oleada de aplicación (Fase 2)

- Migrar los `transition`/`animation` crudos de `features/**` al namespace
  `--motion-*` pantalla a pantalla (hoy congelados en el baseline).
- Revisar los bucles `infinite` ambientales (ken-burns, drift, pings) contra la
  regla "entrada o feedback": retirar los decorativos, justificar (o acotar) los
  que sean feedback real.
- Aplicar `lg-press` a las superficies pulsables de features (tarjetas, celdas de
  lista) para un tacto uniforme.

---

## 7. Uso de las primitivas (`web/src/ui`)

Importar desde el barril `../ui`. Props de interfaz siempre `Props`. Consumen
tokens; no hardcodean valores.

| Primitiva | Para qué | Notas de uso |
|-----------|----------|--------------|
| `Button` | Acciones | `variant` primary/secondary/ghost/danger; `size` sm/md/lg (lg = CTA pulgar). `fullWidth` en móvil. Foco con `--focus-ring-*`. |
| `Card` | Superficie de papel | `padding` none/sm/md/lg; `raised` para elevar. Hairline + sombra sutil; nunca glow. |
| `Input` / `Field` | Formularios | `Field` envuelve label + control + error/hint accesibles. Input ≥16px (no zoom iOS). |
| `Badge` / `Chip` | Estado / etiqueta | Pills (`--radius-full`). Tonos semánticos. `Badge live` = punto rojo "en vivo". |
| `Row` / `Stack` | Layout | Gap por token (1–8). No meter márgenes a mano entre hijos: usar el gap. |
| `EmptyState` | Vacío | Icono + título serif + texto, **con aire** (`--space-7` de padding). Lleva acción opcional. |
| `AppHeader` | Cabecera 3 ranuras | `plain` (sobre papel, hairline) o `floating` (sobre escena, velo + tinta clara). |
| `BottomSheet` / `Modal` | Hojas / diálogos | Suben desde abajo en móvil (`--sheet-max-height`, dvh), tarjeta centrada en desktop. Tirador con `--grab-bar-*`. |
| `Toast` | Avisos efímeros | Hoja de papel + filo de tono (`--accent-bar-width`). Vía `useToast()`. |
| `Avatar` | Identidad | Tamaños `--avatar-sm/md/lg`; variante "línea" (animal de trazo) por defecto. |
| `Banner` | Aviso de fila ancha | info/aviso/oferta. Más que un Chip, menos que un Modal. |
| `SegmentedControl` | Conmutador | Pastilla en acento sólido = seleccionado. Segmentos ≥44px. |
| `Spinner` / `Skeleton` / `SkeletonCard` | Carga | Shimmer que se congela bajo `prefers-reduced-motion`. |

---

## 8. Guardarraíles (design-lint)

`web/scripts/design-lint.mjs` enforça el sistema en CI de forma **determinista**.
Falla solo con **recaídas nuevas** (la deuda existente se congela en
`design-lint-baseline.json`). Reglas: `color` (literal fuera de tokens), `vh`
(`100vh`), `emoji` (usar lucide), `overlap` (`width:200%`), **`radius`** (px crudo
en border-radius), **`zindex`** (z-index numérico fuera de `--z-*`), **`fontsize`**
(px/rem crudo en font-size fuera de tokens/roles), **`motion`** (duración cruda
en `transition`/`animation` fuera de `--motion-*`, y `animation … infinite` = el
bucle prohibido).

Para silenciar una excepción legítima: `/* design-lint-allow: motivo */` en la
misma línea o la anterior (el motivo es obligatorio). Al arreglar deuda a
propósito: `npm run design-lint -- --update-baseline`. **Nunca** se actualiza el
baseline para tapar una recaída.

---

## 9. Fase 2 — trabajo pendiente (anotado, no hecho aquí)

Esta es la Fase 1 (cimientos del sistema). Pendiente de aplicar/limpiar:

- **Aplicar el sistema pantalla a pantalla** (donde otros agentes no estaban ya):
  - `features/play/**` — sheets con paddings sueltos (`5px 11px`, `6px 8px`), radios
    en px, colores `#fff` sobre overlay → migrar a `--scene-*` y a la escala.
  - `features/trip/MomentSheet` — 8 colores hardcodeados (rgba/hex del tirador, cierre,
    chip, velo) y 8 z-index numéricos; el cierre usa un glass demasiado oscuro.
  - `features/group/LeaderboardCard` y `features/play/ResultCard` — tarjetas
    **rasterizadas** (export a imagen): su px es legítimo, pero conviene factorizar a
    constantes propias del póster para no confundir con UI viva.
  - `features/onboarding/**`, `features/admin/**`, `features/group/GroupPage`.
- **Pantallas en vuelo de otros agentes (Fase 1, no tocadas):** `HomeGlobe`,
  `GlobeSheet`, `features/home/**`, `auth/Landing`, `features/create/**`. Revisar su
  alineación con este documento cuando aterricen.
- **Limpieza de tokens (no se hizo para no romper ramas en vuelo):**
  - Retirar los tokens del estilo viejo ya remapeados (`--ocean-*`, `--land-*`,
    `--teal-bright`, `--glass-*`, `--gradient-accent`, `--glow-*`, `--aurora-duration`,
    `--grid-drift-duration`) cuando ninguna feature los cite.
  - Unificar `--z-sticky`/`--z-overlay` (alias) hacia `--z-header`/`--z-modal`.
- **Regla de spacing en design-lint** con scoping por selector (`.sheet`/`.overlay`/
  `.modal`) para ganar señal sin el ruido de las tarjetas rasterizadas.
- **Fallbacks px redundantes** en `var(--radius-lg, 18px)` / `var(--radius-full, 999px)`
  de las pantallas de create: el token siempre existe, el fallback sobra.
