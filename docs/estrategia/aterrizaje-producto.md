# LocationGuesser — Aterrizaje de producto

**Fecha:** 19 junio 2026 · **Estado:** v0.1 (lanzamiento exprés para jugar durante el viaje)

> GeoGuessr, pero con las fotos de tus amigos. Un colega de viaje guarda su ubicación exacta y manda una foto al grupo; los demás colocan un pin en el mapa y **gana quien más se acerca**. Con cuenta atrás.

**Caso de uso real (origen):** un grupo de viaje en WhatsApp. Los que viajan mandan fotos de los sitios; alguien dice "manda una foto y adivinamos dónde estás". Hoy se hace a ojo, sin forma de fijar la posición exacta ni de saber quién ganó.

---

## 1. Diagnóstico (Kernel de Rumelt)

**El desafío crítico NO es técnico.** La mecánica de mapa (pin → revelar → distancia) es un patrón resuelto y copiable. El reto central es de **bucle social y velocidad**:

> Ya existe el comportamiento (mandar foto al grupo y adivinar "a ojo"), pero **no hay forma de fijar la posición exacta ni respuesta objetiva de quién gana**, y crear un reto "de verdad" hoy exige apps que no encajan en el momento (Street View, montar mapas, o adivinar tu carrete viejo en solitario). El obstáculo: **convertir ese comportamiento que ya ocurre en un juego con respuesta objetiva y cero fricción, dentro del propio chat — antes de que la oleada de apps de "adivina la foto" (2025-26) ocupe el hueco.**

Tres tensiones que se derivan:
- **Fricción de creación**: si crear el reto cuesta más que mandar la foto, no ocurre.
- **Dependencia del que viaja**: sin alguien que capture, no hay contenido → el bucle muere.
- **Privacidad**: compartir ubicación exacta en tiempo real es sensible (restricción transversal).

---

## 2. Competencia (junio 2026)

| App | Qué hace | ¿Fotos/ubicaciones propias? | ¿Con amigos? |
|-----|----------|------------------------------|--------------|
| **[Whereez](https://whereez.io/)** | **El más parecido.** Subes foto de dónde estás, amigos adivinan, puntos. | Sí | Sí *(sin tracción)* |
| **[WhereWas](https://apps.apple.com/us/app/id6749086250)** | "GeoGuessr de tu carrete" (EXIF), retrospectivo | Sí (tu carrete) | No (solitario) |
| **[Throwbacks](https://apps.apple.com/qa/app/throwbacks/id6743415817)** | Galería → juego, reto async por SMS | Sí | Async |
| **[Gallery Roulette](https://apps.apple.com/us/app/-/id6752216868) / Buddies** | Party game: foto random del grupo, adivina con timer | Sí (carretes) | Sí, en vivo |
| **[GeoGuessr](https://apps.apple.com/us/app/geoguessr/id1049876497)** | El original. Street View. Mapas custom = solo zonas Street View | **No** (no subes fotos) | Sí |
| **[Geotastic](https://eraguessr.ai/guides/best-geoguessr-alternatives) / [Pin The Place](https://pinthe.place/) / [City Guesser](https://virtualvacation.us/multiplayer)** | Alternativas GeoGuessr, salas online | No (Street View/curado) | Sí |

**Hueco:** GeoGuessr y la mayoría = Street View abstracto, no fotos reales. Las de "carrete" (WhereWas, Throwbacks) son retrospectivas y casi en solitario. **Solo Whereez pisa este terreno exacto, y está sin tracción.** El diferenciador defendible no es la mecánica de mapa (copiamos la estándar), sino **tiempo real + ángulo de viaje + capa social/recuerdos**. La ventana existe pero se estrecha → **la velocidad importa**.

---

## 3. Oportunidades

| # | Oportunidad | Horizonte |
|---|-------------|-----------|
| **O1** | Crear un reto en segundos desde el sitio (GPS + título), sin montar nada | **Hoy** |
| **O2** | Respuesta objetiva: distancia y puntos → "quién gana" sin discusión | **Hoy** |
| **O3** | Jugar sin instalar nada, dentro del flujo del grupo (un enlace) | **Hoy** |
| **O4** | Ver la foto junto al mapa al adivinar | **Hoy** |
| **O5** | Ranking compartido en vivo / sala del grupo | Next |
| **O6** | Historial: el "mapa de viajes del grupo" (retención/recuerdos) | Next |
| **O7** | Control de privacidad de la ubicación (borrosidad, a quién / cuándo) | Next |

---

## 4. Política guía (Rumelt)

> **Web sin instalación y sin backend, con el reto codificado en un enlace que vive en el propio chat del grupo.** Priorizamos *velocidad de lanzamiento* y *cero fricción social* por encima de la completitud. Copiamos la UX de mapa que ya es estándar (pin → revelar → distancia) y **diferenciamos solo en lo social/viaje**.

**Qué descarta explícitamente (de momento):** app nativa, backend, cuentas/login, mapas custom, Street View, multijugador en vivo. Todo eso es "next" y solo si el bucle social funciona.

---

## 5. OST exprés

**Outcome:** que el grupo juegue ≥1 reto durante este viaje (y le apetezca repetir).

```
Outcome: el grupo juega y repite
├─ O1 crear sin fricción ──────→ I1 · Crear reto (mapa + GPS + buscar + título + timer) → enlace
├─ O2 respuesta objetiva ──────→ I2 · Jugar: pin + cuenta atrás + revelar con distancia y puntos
├─ O3 sin instalar, en el chat ─→ I3 · Compartir resultado al grupo (texto copiable con enlace)
├─ O4 foto junto al mapa ──────→ I4 · Subir/ver la foto recibida al jugar
│                                I5 · Demo con un ejemplo (onboarding 0-fricción)
├─ O5 ranking en vivo ─────────→ (next) sala + ranking compartido (KV/serverless)
├─ O6 recuerdos ───────────────→ (next) historial / mapa de viajes del grupo
└─ O7 privacidad ──────────────→ (next) borrosidad y control de revelado
```

---

## 6. v0.1 — alcance de hoy

Iniciativas **I1–I5** (todo en `app/`, web estática):
- **Crear reto**: mapa Leaflet, marcar ubicación (clic / **GPS** / buscar), título, temporizador (sin límite / 30s / 60s / 2min) → **enlace compartible** (la ubicación viaja codificada en el `#hash`).
- **Jugar**: abre el enlace → ve el título y la foto (subida desde el chat), coloca su pin con cuenta atrás, **revela** la posición real con línea, **distancia** y **puntos** (`5000·e^(−km/2000)`).
- **Compartir resultado**: texto listo para pegar en el grupo, con el enlace para que otros jueguen.

**Stack (conclusión del aterrizaje):** web estática (HTML/JS) + **Leaflet sobre OpenStreetMap** (mapa gratis, sin API key). Sin backend: el reto va en el enlace + `localStorage`. Desplegable hoy en GitHub Pages / Vercel. Coherente con la política guía.

**Cómo se juega:**
1. El que viaja abre la app → *Crear un reto* → *Mi ubicación* (GPS) → título → *Generar enlace*.
2. Pega el enlace **y la foto** en el grupo.
3. Cada amigo abre el enlace, sube la foto, coloca su pin antes de que acabe el tiempo y comparte su resultado. Gana el de menos km.

## 7. Siguiente (post-viaje, si engancha)

Ranking compartido (O5), historial / mapa del grupo (O6), privacidad (O7). Validar antes el bucle: **¿se juega?, ¿se repite?, ¿se reenvía a otros grupos?**
