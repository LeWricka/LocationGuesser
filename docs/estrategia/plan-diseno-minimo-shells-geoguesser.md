# Plan: diseño mínimo, shells de pantalla y "¿Dónde?" = GeoGuessr puro

**Fecha:** 2 jul 2026
**Contexto:** llevamos días iterando el diseño en vivo y no converge; defectos de
composición recurrentes (vacío oscuro, caption huérfano, textos duplicados) bloquean
la salida a usuarios. Diagnóstico y decisión de rumbo en esta sesión.

---

## 0. Diagnóstico (por qué no converge)

No es falta de *design system* a nivel de átomos —ya hay `tokens.css`, el `ui/` kit y
design-lint—. Falla la **capa de composición**:

1. **No hay un "shell de pantalla" compartido.** Cada pantalla resuelve *fondo + hoja +
   caption + header* a su manera → los bugs viven *entre piezas* y reaparecen en la
   siguiente pantalla. Arreglamos síntomas (un chip, un mapa), no el sistema.
2. **No hay diseño-objetivo bloqueado.** Diseñamos en código, iterando en vivo, sin una
   referencia fija → deriva.
3. **Supuesto oculto no codificado:** "siempre hay un fondo protagonista (mapa)". Cuando
   un flujo no lo cumple (reto de cifra), el shell inmersivo se rompe en silencio (vacío
   negro + caption huérfano).
4. **Punto ciego de QA visual:** el CI valida "verde" (lint/tipos/tests/build/design-lint)
   pero nadie mira la pantalla **real, logueado, en móvil alto (1080×2400) con datos
   reales** antes de mergear. El único QA visual es el dueño, al final, sobre prod.

**Política guía (Rumelt):** *utilitario por defecto; inmersivo solo donde hay contenido
protagonista que lo justifique; diseño-objetivo bloqueado antes de construir; y un listón
de "suficiente" para salir —no un redesign perfecto.*

---

## 1. Decisión de producto: "¿Dónde?" = GeoGuessr puro

El reto **"¿Dónde?"** vuelve a su esencia original: **Street View, "adivina dónde estoy",
sin fotos ni historias.** GeoGuessr 100%.

- **Crear (un solo paso, sin mapa intermedio):** se abre el **Street View de tu ubicación**
  (GPS); te mueves DENTRO del propio Street View hasta tu sitio exacto y lanzas. El punto del
  reto = la posición del panorama que eliges. **Se elimina:** el paso abstracto de mapa+pin,
  subir foto, estripar EXIF, título/historia larga, el toggle "Añadir Street View" (el SV
  pasa a ser *el* contenido). **Si no hay cobertura de Street View, no se puede crear (ni,
  por tanto, jugar) ese reto.**
- **Jugar:** el jugador ve el Street View, pasea, y clava su tiro en el mapa. Gana el más
  cercano (scoring por distancia, el de siempre).
- **Efecto de diseño:** el flujo de crear "¿Dónde?" colapsa a **UN paso** (Street View
  directo → lanzar), sin el paso abstracto de mapa+pin. Desaparece buena parte de la
  complejidad del shell inmersivo que nos daba guerra.

**Los otros dos ejes no cambian:**
- **Reto "¿Adivinas?" (cifra):** formulario → **shell utilitario** (hoja limpia, sin
  backdrop inmersivo). Es el bug de la captura de hoy.
- **Diario / momentos (fotos, estilo Polarsteps):** es el **contenido** del viaje, separado
  del reto. Sigue igual. La foto vive aquí, no en el reto "¿Dónde?".

### Riesgo clave a decidir: cobertura de Street View
GeoGuessr 100% implica que **solo se puede crear reto "¿Dónde?" donde hay cobertura de
Street View**. En sitios sin SV (rural, interiores, algunos países) no habría reto. La
foto se había añadido en su día justo para cubrir esos huecos. Hay que elegir cómo tratarlo
(ver decisión pendiente al final).

---

## 2. La capa que falta: 2–3 *shells* de pantalla

Primitivas de layout de las que hereden TODAS las pantallas de crear/jugar/ver. Cada una
con **reglas duras** (codificadas, no "de palabra"):

| Shell | Cuándo | Reglas |
|-------|--------|--------|
| **Inmersivo** | Hay protagonista visual (Street View, mapa, foto) | Backdrop a sangre + caption sobre él. El caption y el título de la hoja **nunca coexisten**. |
| **Utilitario** | Formulario sin protagonista (reto de cifra, perfil, editar) | Hoja limpia a pantalla completa. **Sin backdrop, sin vacío, sin caption flotante.** |
| **Feed / Lista** | Diario, marcador | Cabecera + lista con scroll propio. |

Guardarraíl nuevo del design-lint: **prohibido backdrop inmersivo sin protagonista**
(evita que se repita el vacío negro).

---

## 3. Diseño-objetivo: 5 pantallas del camino feliz (mockups navegables)

Antes de tocar producción, **bloqueamos el objetivo** de las pantallas críticas. Yo las
propongo como **mockups navegables en código** (ruta de galería, con fixtures; sin red),
para que las apruebes o taches **antes** de construir:

1. **Entrar** (landing/onboarding → nombre+email).
2. **Ver viaje** (diario + marcador).
3. **Crear reto "¿Dónde?"** (GeoGuessr: Street View directo de tu ubicación → mover al sitio exacto → lanzar; sin paso de mapa. Estado alterno sin cobertura).
4. **Jugar / adivinar** (ver SV, clavar tiro en mapa).
5. **Marcador / resultado** (cercanía, podio).

Salida de esta fase: un set de 5 pantallas **fijas y aprobadas** = el target contra el que
se construye. Se ejecuta con un **agente Sonnet** (es construcción, no juicio; política de
tiering de coste).

---

## 4. Cerrar el punto ciego de QA visual

Para que "no nos demos cuenta" deje de pasar:

- Circuito que capture las pantallas **reales, logueado, en viewport alto (≈1080×2400,
  ratio 2.2)**, con datos reales, y las critique contra checklist **antes** de merge.
- Ya hay medio montado (galería + `gallery:shots`). Falta: (a) viewport alto además del
  compacto, (b) caso logueado con escena oscura real, (c) correrlo en cada PR de UI.

---

## 5. Secuencia (para desbloquear salida)

| Fase | Qué | Gate |
|------|-----|------|
| **0** | Plan aprobado + decisión de cobertura SV + **mockups del camino feliz aprobados** | 🔒 bloqueante |
| **1** | Construir los 2–3 shells con reglas duras | — |
| **2** | Rehacer las 5 pantallas sobre los shells, con "¿Dónde?" = GeoGuessr | — |
| **3** | Cerrar QA visual (viewport alto + logueado en CI) | — |
| **4** | **Salir a usuarios** (camino feliz limpio y consistente) | 🎯 |

**Diferido explícito** (no bloquea salida): pulir el "wow", el resto de pantallas
secundarias, la causa raíz del crash `add=reto` (necesita stack de Sentry), y el TTL de las
URLs firmadas de Storage (portadas caducan a 1h).

**Aviso de PM:** el mínimo para lanzar es el camino feliz limpio, **no** un design system
perfecto. No abrir "rehagamos todo" o perdemos otra semana sin usuarios.

---

## Decisión tomada: cobertura de Street View → GeoGuessr estricto (A)

**Solo se puede crear reto "¿Dónde?" donde hay cobertura de Street View.** Sin foto de
respaldo. Puro y simple, coherente con "ni fotos ni historias". Implicaciones a resolver en
el mockup de crear:
- Al abrir el Street View de tu ubicación, si no hay cobertura, **avisar y no dejar lanzar**
  (mensaje claro + sugerir moverte/buscar una calle con cobertura), en vez de fallar.
- El reto "¿Dónde?" queda acotado a zonas con SV; el diario (fotos) sigue cubriendo el resto
  de momentos del viaje.

---

## Decisiones de diseño confirmadas (2 jul, validadas en artefacto)

- **Paleta = Grafito + teal (neutra/editorial):** primario/CTA `#1F2A30` (grafito casi
  negro) · acento `#0F766E` (teal profundo, SOLO en detalle/enlaces, no en rellenos grandes) ·
  tinta `#1B2127` · apagado `#6B7480` · superficie `#FFFFFF` · fondo `#F4F5F6` · línea
  `#E4E7EA`. Principio: **chrome neutro, las FOTOS ponen el color.** (Sustituye el azul
  pizarra + oro. Se descartó Teal viajero por leer "infantil": dos colores saturados
  compitiendo con las fotos.)
- **Iconos = Custom de marca:** set propio con carácter (pin, globo, diana, trofeo, foto…),
  detalle en ámbar donde aporta. Nada de iconos de librería por defecto ni emoji en UI.
- **Foto-first:** el Diario es de **imágenes grandes** (tarjeta con foto a ancho completo,
  estilo Polarsteps). Los retos de ubicación (sin foto) muestran miniatura de SV/mapa + chip
  "Reto". La app debe verse muy visual pero operativa.
- **"A sangre" solo en la home (Ver viaje):** el patrón backdrop decorativo + hoja grande es
  exclusivo de la home. Crear/Jugar = Street View como herramienta operativa con chrome
  mínimo. Formularios/resultado = utilitario.
- **Jugar = GeoGuessr fiel:** SV a pantalla completa + mini-mapa de esquina expandible +
  cuenta atrás; **sin** popup "¿Dónde es esto?".
- **5 pantallas** en el camino feliz: Entrar · Ver viaje · Crear ¿Dónde? · Jugar · Resultado
  (se elimina la pantalla dedicada de "sin cobertura SV").
