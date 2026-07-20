# Plan de medición: ¿encaja Momentu? (dashboard de evidencia)

> **Objetivo próximo #1** (Rumelt) y concreción de la oportunidad O7. Traduce el bucle del "viaje vivo" a un **dashboard de Mixpanel** que responda, con evidencia, si los usuarios usan el producto y si hay encaje — sin construir features nuevas, solo instrumentar y medir. Redactado el 4 jul 2026 con Lewis.
>
> Contexto técnico: analítica en `web/src/lib/analytics.ts` (Mixpanel EU, autocapture + session replay, catálogo tipado). El bucle ya está casi todo instrumentado; falta un evento (ver §4).

## Criterio de éxito de este objetivo

Poder mirar un dashboard y decir, con datos y no con intuición: **¿la gente guarda? ¿comparte? ¿la audiencia participa? ¿siguen hasta el final? ¿qué % de viajes llega a "vivo"?** — el North Star de la visión.

---

## 1. El embudo del "viaje vivo" mapeado a eventos existentes

El dashboard se ordena por el bucle de la política (se lee hacia abajo; si falla un escalón, los de abajo dan igual):

| Paso del bucle | Evento(s) Mixpanel existentes | Qué mide | ¿Instrumentado? |
|---|---|---|---|
| **0. Crear viaje** | `group_created` | Arranque | ✅ |
| **1. GUARDAR** (Nivel 0) | `moment_created` (props `has_photo/has_video/has_audio/has_place`), `challenge_created` | ¿capturan? ¿con media rica? | ✅ |
| **2. VISUALIZAR / revivir** | — | ¿abren y reviven el viaje? | 🔴 **hueco (ver §4)** |
| **3. COMPARTIR** | `invite_shared`, `group_link_copied`, `owner_invite_created` | ¿comparten el viaje? | ✅ |
| **4. AUDIENCIA ENTRA** | `share_link_opened` (props `kind`, `has_session`), `receptor_welcome_shown`, `group_joined` | ¿la gente entra por el enlace? | ✅ |
| **5. AUDIENCIA JUEGA** (Nivel 1) | `challenge_played`, `result_revealed` | ¿participan o solo miran? | ✅ |
| **6. VIRALIDAD** | `result_shared`, `leaderboard_shared` | ¿el juego genera más compartir? | ✅ |
| **7. SEGUIR / VOLVER** | recurrencia de `share_link_opened` / `challenge_played` por persona y día | ¿siguen hasta el final? (retención) | ✅ (vía cohortes) |

---

## 2. Los tableros del dashboard "¿Encaja?"

### Tablero A — North Star: tasa de conversión a "viaje vivo"
- **Métrica única:** `% de grupos creados que alcanzan Nivel 1` (≥1 reto compartido + audiencia entra + ≥1 persona distinta juega + retención). Construir como **funnel de Mixpanel** `group_created → challenge_created → share_link_opened → challenge_played`, medido por grupo.
- **Contra-métrica (guardarraíl):** nº de `group_created` por semana (que no optimicemos calidad de una base que se encoge).
- **Suelo de fiabilidad:** no leer el % con < N grupos en la ventana.

### Tablero B — Nivel 0: ¿guardan? (el cimiento)
- **Activación del creador:** % de `group_created` que llegan a ≥1 `moment_created`. (Si crean grupo y no guardan nada, el cimiento falla.)
- **Riqueza de media:** % de momentos con `has_photo`, `has_video`, `has_audio`, `has_place`. Valida si "media completa" se usa de verdad (N1).
- **Ritmo:** momentos por día de viaje (vs. umbral "≥1 cada 2 días" del viaje vivo).

### Tablero C — Nivel 1: ¿se comparte y participan? (el wedge)
- **Compartir:** % de grupos con ≥1 `invite_shared`/`group_link_copied`.
- **Embudo del receptor (hoy la clave):** `share_link_opened → receptor_welcome_shown → group_joined → challenge_played`. Dónde se cae la audiencia.
- **⭐ Split Miguel vs Carmen (validación de las dos personas con datos):**
  - **Activos (Miguel):** entran (`share_link_opened`) **y** juegan (`challenge_played`).
  - **Pasivos (Carmen):** entran pero **no** juegan → solo miran/siguen.
  - El ratio activos/pasivos valida si el reto engancha o si media audiencia solo quiere seguir (→ justifica la capa de resumen).
- **Ritmo de retos:** retos por grupo y por cada 3 días de viaje (umbral viaje vivo).

### Tablero D — Retención / seguimiento sostenido (criterio 4 del viaje vivo)
- **Retención de la audiencia:** de las personas que entran al principio del viaje, % activas (`share_link_opened`/`challenge_played`) en ≥50% de los días del viaje.
- Cohorte por grupo; mide "siguieron hasta el final".

### Tablero E — Adopción vs WhatsApp (la hipótesis H1)
- Proxy indirecto: ratio `share_link_opened` / miembros invitados; `result_shared` (el juego que sale del producto). No mide WhatsApp directamente, pero sí si el enlace + reto mueven a la gente a entrar y volver a compartir. Complementar con feedback cualitativo.

---

## 3. Hipótesis del diagnóstico → qué tablero la valida

| Hipótesis | Se valida en | Señal de "encaja" |
|---|---|---|
| H1 — ¿el reto saca de WhatsApp? | Tablero E + cualitativo | La audiencia entra y vuelve a compartir |
| H2 — ¿la audiencia juega o solo mira? | Tablero C (split Miguel/Carmen) | Ratio de activos razonable |
| H3 — ¿participan sin instalar? | Tablero C (receptor funnel) | `share_link_opened → challenge_played` sin caída brutal |
| Nivel 0 — ¿guardan con media rica? | Tablero B | Activación alta + media variada |
| Retención — ¿siguen hasta el final? | Tablero D | ≥50% activos en ≥50% de días |

---

## 4. Único hueco de instrumentación a cerrar (dev, pequeño)

El paso **VISUALIZAR** está ciego. Añadir dos eventos al catálogo (`web/src/lib/analytics.ts`) y emitirlos:

- **`trip_viewed`** — al abrir la vista del viaje (`BitacoraTab`). Props: `group_id`, `role` (`owner`|`member`|`visitor`). Mide N2 (revivir) y el consumo pasivo de Carmen.
- **`moment_viewed`** — al abrir un momento (`MomentSheet`). Props: `group_id`, `challenge_id`. Mide profundidad de consumo.

Sin datos sensibles (nada de lat/lng ni lugar), coherente con el resto del catálogo. Es instrumentación, no feature nueva → dentro de la política ("validar, no construir").

---

## 5. Siguiente paso operativo

1. Cerrar el hueco de §4 (1 PR pequeño).
2. Montar los 5 tableros en Mixpanel (A–E).
3. Dejar correr con uso real (empezando por el círculo de Lewis) y leer evidencia.
4. Revisar contra los umbrales del "viaje vivo" (`00-vision.md`) y decidir: ¿encaja, itera o pivota?
