# LocationGuesser — Propuestas de mejora (investigacion + lluvia de ideas + priorizacion)

**Fecha:** 23 junio 2026 · **Estado:** documento estrategico (ideacion, no implementacion) · **Issue:** [#141](https://github.com/LeWricka/LocationGuesser/issues/141)
**Frameworks:** Kernel de Rumelt (diagnostico → politica guia → acciones) · OST (Outcome → Oportunidad → Solucion) · DHM de Gibson Biddle (Delight, Hard-to-copy, Margin) · priorizacion Impacto × Apetito (Shape Up).

> **Que es el producto:** "GeoGuessr con las fotos (y los sitios) de tus amigos". Alguien sube un reto con su ubicacion real (foto y/o panorama de Street View), los demas adivinan en el mapa, gana quien mas se acerca; con cuenta atras, clasificacion y premios. Grupos asincronos. Origen: grupo de viaje de WhatsApp.
> **Objetivo de negocio:** que el grupo juegue ≥1 reto y **REPITA** (retencion y bucle social).

---

## 0. Que existe HOY (inventario factual, base de la priorizacion)

Verificado en el codigo (`web/src/**`) y el esquema (`supabase/migrations/0001`–`0008`). Esto es lo construido y en vivo, no el diseño:

**Funciona y esta en vivo:**
- **Cuentas reales** (Supabase Auth, magic link), perfil global (`display_name` + avatar inicial), home/dashboard, membresia (`group_members`), propiedad (`groups.created_by`), RLS solo-auth [[0004_cuentas_membresia.sql](../../supabase/migrations/0004_cuentas_membresia.sql)].
- **Crear grupo**, **unirse por codigo** (auto-join idempotente), **pagina del grupo** (clasificacion general por suma de puntos, "en vivo" con marcador Realtime, "anteriores" reconstruibles).
- **Crear reto**: punto por busqueda/GPS/clic/URL de Maps, vista previa de Street View, titulo, duracion (5m–48h), tiempo por jugada, **foto opcional** (pista visible o sorpresa al revelar — `photo_is_hint`) [[challenges.ts](../../web/src/lib/challenges.ts)].
- **Jugar**: panorama interactivo de Street View o foto, mapa para el pin, cuenta atras, **voto de timeout** (jugaste sin marcar → 0 pts, quedas marcado) [[0007_voto_timeout.sql](../../supabase/migrations/0007_voto_timeout.sql)], revelado con distancia + puntos (`5000·e^(−km/2000)`).
- **Premios por posicion** (1º/2º/3º/ultimo, jsonb, editables solo por el dueño) [[0008_prizes_por_posicion.sql](../../supabase/migrations/0008_prizes_por_posicion.sql)].
- **Compartir la clasificacion como imagen PNG** (Web Share + fallback) [[shareLeaderboard.ts](../../web/src/features/group/shareLeaderboard.ts)].
- **Onboarding** (slideshow contextual) y **Mixpanel** con 14 eventos en catalogo [[analytics.ts](../../web/src/lib/analytics.ts)].

**Lo que NO existe (gaps que estructuran este documento):**
- **CRUD**: no se puede **editar** un reto, **editar el nombre** de un grupo, **borrar** un grupo (la RLS lo permite, no hay UI ni funcion), **gestionar miembros** (expulsar / transferir propiedad / salir de un grupo), ni **borrar tu voto**. Si existe borrar reto (dueño) y editar perfil/premios.
- **Bucle/viral**: **sin notificacion push** ("te toca jugar"), **sin resultado individual compartible** (solo la clasificacion del grupo), **sin invitacion con preview**.
- **Profundidad**: sin reto diario, sin rachas, sin temporadas/logros, sin recuerdos/mapa del viaje, sin reacciones/comentarios.
- **Analitica**: 4 eventos del catalogo **declarados pero NO disparados** (`signup_completed`, `login`, `group_joined`, `leaderboard_shared`), sin funnels ni North Star definidos.

---

## 1. Diagnostico (Kernel de Rumelt)

El producto **ya superó la primera pregunta** ("¿se juega?"): el bucle de crear → jugar → revelar funciona y hay cuentas reales que sostienen identidad y propiedad. El **desafio critico ahora es la RETENCION y el RE-ENGANCHE**, y se descompone en tres tensiones observables en el codigo y el genero:

1. **El bucle no se cierra solo.** El juego es asincrono y vive en un chat de WhatsApp, pero **no hay forma de devolver al jugador** cuando hay un reto pendiente. En los juegos asincronos que funcionan, el latido es la notificacion "es tu turno" [[Words With Friends](https://en.wikipedia.org/wiki/Words_with_Friends)]. Hoy LocationGuesser depende de que alguien reenvie el enlace a mano: fragil.
2. **Falta el motor viral de adquisicion intra-grupo y entre-grupos.** Wordle crecio de 90 a millones de jugadores en semanas **por el share string de cuadritos sin spoiler** [[Wordle](https://en.wikipedia.org/wiki/Wordle)]. LocationGuesser comparte la clasificacion (bien) pero **no el resultado individual** ("a 4,2 km — 4.832 pts, ¿me superas?"), que es exactamente el gancho que pica al resto del grupo a jugar.
3. **Falta profundidad mas alla de la novedad.** BeReal llego a ~73M MAU y se desplomó porque "una foto al dia" se agotaba: faltaba que hacer [[BeReal](https://en.wikipedia.org/wiki/BeReal)]. LocationGuesser tiene una ventaja (contenido variado generado por amigos + competicion), pero **sin progresion** (temporadas, rachas, recuerdos del viaje) la retencion dependera solo del subidon inicial del viaje.

A esto se suma una **deuda de producto basica**: la ausencia de CRUD elemental (editar reto, gestionar grupo/miembros, salir de un grupo) genera fricción y errores irreversibles (un reto mal creado solo se puede borrar, no corregir; nadie puede salir de un grupo ni cederlo), lo que erosiona la confianza justo cuando queremos que la gente vuelva.

---

## 2. Politica guia (Rumelt)

> **Cerrar el bucle asincrono y darle profundidad, sin romper la fricción-cero social.** Priorizamos, en este orden: **(1) traer de vuelta** al jugador cuando le toca (notificacion), **(2) hacer viral el momento de orgullo** (resultado compartible sin spoiler), **(3) tapar los agujeros de CRUD** que rompen la confianza, y **(4) añadir profundidad de retencion** (hábito, progresion, recuerdos) — todo manteniendo el bucle principal **siempre gratis** y el contenido generado por los amigos como diferenciador.

**Que descarta explicitamente esta politica (de momento):**
- **Multijugador competitivo en vivo** (Duels / Battle Royale): rompe el modelo asincrono que es el corazon del caso real [[GeoGuessr](https://en.wikipedia.org/wiki/GeoGuessr)].
- **Urgencia extrema tipo BeReal** (2 min para responder): el viaje es relajado, no de presion.
- **Pago-para-ganar**: rompería la competicion entre amigos (sagrado).
- **Rachas individuales agresivas sin tolerancia**: riesgo documentado de ansiedad y churn por ruptura ("what-the-hell effect") [[Duolingo streaks](https://blog.duolingo.com/how-duolingo-streak-builds-habit/)].

---

## 3. OST — del Outcome a las iniciativas

**North Star (propuesto):** **retos jugados por grupo activo y semana** (mide el bucle social vivo; ver §10).

```
OUTCOME: el grupo juega y REPITE (retencion + bucle social)
│
├─ OP1 · Traer de vuelta cuando me toca (cerrar el bucle asincrono)
│     ├─ I1  Avisos "te toca jugar" (WhatsApp-first hoy; PWA + Web Push despues)
│     └─ I2  Recordatorios de cierre ("quedan 3h para que cierre el reto de Ana")
│
├─ OP2 · Hacer viral el momento de orgullo (adquisicion intra/entre grupos)
│     ├─ I3  Resultado individual compartible SIN spoiler (estilo Wordle)
│     └─ I4  Invitacion con preview del grupo/reto + deep-link robusto
│
├─ OP3 · No perder la confianza (CRUD basico que falta)
│     ├─ I5  Editar reto (titulo, foto, duracion, tiempo/jugada)
│     ├─ I6  Gestion de grupo (renombrar, borrar, transferir propiedad)
│     ├─ I7  Gestion de miembros (salir de un grupo, expulsar)
│     └─ I8  Rehacer mi jugada / borrar mi voto (con reglas)
│
├─ OP4 · Profundidad de retencion (mas alla de la novedad)
│     ├─ I9   Reto diario / "del dia" del grupo (habito)
│     ├─ I10  Rachas de GRUPO con tolerancia (no individuales ansiosas)
│     ├─ I11  Temporadas/ligas ligeras + logros (progresion)
│     ├─ I12  Recuerdos: mapa de sitios del viaje (lo que a BeReal le faltó)
│     ├─ I13  Reacciones/comentarios en el revelado (capa social ligera)
│     └─ I14  Modos de juego (dificultad, pistas, solo-foto vs SV)
│
├─ OP5 · Pulido visual y de experiencia (delight + claridad del bucle)
│     ├─ I15  Sistema de tokens de diseño unificado (hoy disperso en CSS modules)
│     ├─ I16  Microinteracciones del revelado (cuenta de puntos, linea animada, mapa que encuadra)
│     ├─ I17  Estados vacios y de carga cuidados (skeletons, "aun nadie ha jugado")
│     └─ I18  Tarjeta de compartir con mas delight (mapa-miniatura, podio, marca)
│
└─ OP6 · Analitica que guie decisiones
      ├─ I19  Disparar los 4 eventos declarados-no-emitidos + propiedades clave
      └─ I20  Funnels (activacion, primer reto, re-enganche) + North Star
```

---

## 4. Dimension 1 — Inventario y gaps de CRUD basico

Esta es la **deuda de producto mas barata de pagar y la que mas confianza recupera**. La RLS ya soporta casi todo (editar/borrar = dueño, salir = uno mismo); en muchos casos **falta solo la UI y una funcion en `lib/`**.

| Operacion | ¿Existe hoy? | Que falta | Coste aprox. | Riesgos |
|---|---|---|---|---|
| **Crear reto** | ✅ | — | — | — |
| **Editar reto** (titulo, foto, duracion, tiempo/jugada) | ❌ | UI + `updateChallenge()`. **Regla clave:** no permitir cambiar `lat/lng` si ya hay votos (cambiaria la respuesta y las distancias ya calculadas). Editar solo metadatos seguros si hay votos; todo si no hay votos. | S | Integridad: si cambias la ubicacion con votos existentes, las `distance_km`/`points` guardados quedan invalidos. Mitigar bloqueando el campo ubicacion tras el primer voto. |
| **Borrar reto** | ✅ (dueño) [[challenges.ts:82](../../web/src/lib/challenges.ts)] | Confirmacion + aviso de que borra votos (cascade) | — | Votos huerfanos: el FK es `on delete cascade`, OK. UX: avisar "se borraran N jugadas". |
| **Editar nombre del grupo** | ❌ | UI + `updateGroupName()`. Hoy `name` solo se fija al crear [[CreateGroup.tsx:37](../../web/src/features/create/CreateGroup.tsx)]; no hay `update({ name })` en ningun sitio. | XS | RLS ya restringe a dueño (`groups_update_owner`). Bajo riesgo. |
| **Borrar grupo** | ❌ (RLS lo permite, no hay UI) | UI + `deleteGroup()` con confirmacion fuerte. | XS | Cascade borra retos/votos/miembros. Confirmacion doble; solo dueño. |
| **Transferir propiedad** | ❌ | UI + cambiar `groups.created_by` y `role`. Necesario porque **hoy el dueño no puede irse** ni ceder el grupo. | S | Si el dueño borra su cuenta, `created_by` queda `null` (FK `on delete set null`) → grupo huerfano sin dueño. Transferir lo previene. |
| **Expulsar miembro** | ❌ (RLS lo permite) | UI en la lista de miembros (que tampoco existe como pantalla). | S | RLS `group_members_delete` ya cubre dueño. Falta UI + mostrar la lista de miembros. |
| **Salir de un grupo** | ❌ | UI + delete de la propia fila `group_members`. **Hoy no se puede salir de un grupo** (gap notable). | XS | Trivial; RLS lo permite (self-delete). Si el que sale es el dueño → forzar transferir antes. |
| **Renombrar mi display** | ✅ [[profile.ts](../../web/src/lib/profile.ts)] | — | — | — |
| **Editar avatar** | ⚠️ parcial (inicial generada, no subida de imagen) | Subida de avatar real (opcional, baja prioridad) | S | EXIF/peso de imagen; reutilizar el pipeline de compresion de fotos. |
| **Borrar / rehacer mi voto** | ⚠️ (upsert permite re-votar; RLS permite delete) | UI explicita. Hoy `saveVote` es upsert (re-marca sobreescribe) [[votes.ts](../../web/src/lib/votes.ts)], pero **no hay UI para rehacer** y conviene decidir la regla. | S | **Anti-trampa:** permitir rehacer el voto DESPUES de revelar romperia la integridad competitiva. Regla: rehacer solo **antes** de revelar / mientras el reto este abierto y no hayas visto la respuesta. |
| **Lista de miembros del grupo** | ❌ | Pantalla/seccion que liste `group_members` con rol. Prerequisito de expulsar/transferir. | S | RLS ya permite leer la lista a miembros. |

**Conclusion de OP3:** un solo agente puede cerrar I5–I8 en ~1–1.5 semanas. Es **alto impacto / bajo apetito** porque la RLS ya esta hecha: es sobre todo UI + funciones finas en `lib/`. Empezar por lo trivial y de alto alivio: **salir de un grupo**, **renombrar grupo**, **borrar grupo** (XS), luego **editar reto** y **gestion de miembros/transferencia** (S).

---

## 5. Dimension 2 — Mejoras visuales / de diseño

| # | Propuesta | Detalle |
|---|---|---|
| I15 | **Sistema de tokens unificado** | Hoy los colores/espacios viven dispersos en ~41 CSS modules; existe `tokens.css` pero conviene consolidar una escala unica (color, espaciado, radios, tipografia fluida, sombras) y prohibir hardcodear (ya es regla del playbook). Habilita identidad coherente y temas futuros (cosmeticos, §8). **Hard-to-copy bajo, pero base de todo lo visual.** |
| I16 | **Microinteracciones del revelado** | El momento de revelar es el clímax emocional. Pulir: conteo animado de puntos (ya hay `CountUp`/`ScoreRing`), **linea animada** del pin a la respuesta, **mapa que encuadra ambos puntos** (ya se arreglo el encuadre, commit e0dc72d), confeti sutil en aciertos cercanos, haptics en movil. Alto **Delight**. |
| I17 | **Estados vacios y de carga** | Skeletons (ya existen) en carga de grupo/home; estados vacios con copy + 1 accion (ya en home). Faltan: "aun nadie ha jugado este reto", "este grupo no tiene retos todavia → crea el primero", carga del panorama SV. Reduce sensacion de roto. [[empty state UX — Eleken](https://www.eleken.co/blog-posts/empty-state-ux)] |
| I18 | **Tarjeta de compartir con mas delight** | La PNG actual es funcional; subir el listón con **mapa-miniatura de la ubicacion** (tras cerrar), **podio visual**, marca/identidad reconocible (como Strava/Wrapped) [[Strava](https://blog.strava.com/)] [[Spotify Wrapped](https://newsroom.spotify.com/)]. Formato cuadrado para WhatsApp y vertical para stories. |
| — | **Render del reto (jugando)** | El panorama SV a pantalla con hoja inferior funciona; pulir la transicion foto↔mapa, el FAB de confirmar, y el mini-mapa estilo GeoGuessr (expandible). |

---

## 6. Dimension 3 — Mejoras de experiencia / flujo

- **Fricción de onboarding:** el login magic link es de una sola vez, pero medir la caida en el registro al llegar por link (es la metrica nº1 del hito de cuentas) [[cuentas-y-home.md §7](cuentas-y-home.md)]. Asegurar que **el deep-link devuelve directo al reto** tras el email (ya diseñado) y que el slideshow de onboarding no se interpone en el flujo critico A (visitante con link).
- **Claridad del bucle:** la home ya responde "¿que hago ahora?" con "te toca jugar". Reforzar la **cuenta atras visible** en cada tarjeta y el estado del grupo (🟡 te toca / 🔴 en vivo / ⚪ al dia).
- **Feedback de resultado:** ademas del revelado (puntos/distancia), mostrar **tu posicion en el ranking del reto** ("3º de 6, a 200 m del 2º") para picar a mejorar.
- **Notificaciones / avisos de turno (I1, I2):** ver §7 — el mayor multiplicador.
- **Deep-links robustos:** mantener `#g=…&c=…` y `lg.next` para preservar destino (ya diseñado); añadir un enlace **directo al reto** que abra "Empezar" sin pasos intermedios.

---

## 7. Dimension 4 — Bucle social / viral

Esta es **OP1 + OP2**, donde esta el mayor retorno segun la investigacion del genero.

- **I1 · Aviso "te toca jugar" (el latido del bucle asincrono).** En juegos por turnos, la notificacion "es tu turno" es lo que reactiva al usuario [[Words With Friends](https://en.wikipedia.org/wiki/Words_with_Friends)] [[Draw Something](https://en.wikipedia.org/wiki/Draw_Something)].
  - **Hoy (barato):** al crear un reto, generar un **mensaje compartible para WhatsApp** con preview ("Ana te reta en *Interrail '26* — adivina donde esta 👉 enlace"). El propio grupo de WhatsApp es el canal de notificacion natural y de coste cero.
  - **Despues (push real):** PWA + Web Push + VAPID (requiere service worker; en iOS necesita PWA instalada) para "te toca jugar" / "Ana ha creado un reto" / "quedan 3h". Es el paso que de verdad cierra el bucle sin depender del chat.
- **I2 · Recordatorio de cierre.** "Quedan 3h para que cierre el reto de Ana" reactiva a los rezagados. In-app hoy (Realtime), push despues.
- **I3 · Resultado individual compartible SIN spoiler (el "Wordle moment").** Hoy solo se comparte la clasificacion del grupo. Falta la pieza viral clave: una **tarjeta/string del resultado individual** que muestre lo bien que lo hiciste **sin revelar la ubicacion** — "🌍 a 4,2 km · 4.832 pts · ¿me superas? 👉 enlace". Esto es exactamente lo que disparó Wordle (presumir sin spoilear, picando al resto a jugar) [[Wordle](https://en.wikipedia.org/wiki/Wordle)]. **Es la apuesta viral nº1.**
- **I4 · Invitacion con preview.** Al invitar a un grupo, mostrar nombre del grupo + "te han retado" + miniatura, en vez de un enlace pelado. Reduce fricción de unirse (flujo A del onboarding).
- **Reciprocidad (ya la tenemos):** no ves pines/ubicacion hasta votar. BeReal valida que esta mecanica fuerza participacion [[BeReal](https://en.wikipedia.org/wiki/BeReal)]. Es un acierto que ya esta — mantenerlo.

---

## 8. Dimension 5 — Funcionalidad avanzada que no tenemos

| # | Propuesta | Razonamiento y encaje |
|---|---|---|
| I9 | **Reto diario / "del dia" del grupo** | GeoGuessr usa un Daily Challenge jugable **una vez al dia** para crear habito [[GeoGuessr Daily](https://help.geoguessr.com/hc/en-us/articles/4409045625746-Daily-Challenge)]. Adaptado: un reto del dia por grupo (o un "reto sorpresa" del banco de sitios ya jugados) que de una razon de volver cada dia incluso sin viaje activo. |
| I10 | **Rachas de GRUPO con tolerancia** | Las rachas disparan retencion por aversion a la perdida (Duolingo) pero causan churn si se rompen ("what-the-hell") [[Duolingo](https://blog.duolingo.com/how-duolingo-streak-builds-habit/)]. **Encaje seguro:** racha **del grupo** ("lleváis 7 dias con ≥1 reto") — presion social positiva, no ansiedad individual — **con freeze/tolerancia** de 1 dia. NO rachas individuales agresivas. |
| I11 | **Temporadas / ligas ligeras + logros** | Progresion a largo plazo (GeoGuessr tiene divisiones/medallas) [[GeoGuessr](https://en.wikipedia.org/wiki/GeoGuessr)]. Adaptado: una **temporada = un viaje** que cierra con un podio y premios (ya hay premios por posicion). Logros ("primer reto", "tiro perfecto <100m", "5 retos seguidos"). Da significado al historico. |
| I12 | **Recuerdos: mapa de sitios del viaje** | La oportunidad O6 del aterrizaje original [[aterrizaje-producto.md §3](aterrizaje-producto.md)]. **Es la profundidad que a BeReal le faltó** [[BeReal](https://en.wikipedia.org/wiki/BeReal)]: un **mapa del viaje con todos los sitios jugados**, fotos y quien gano cada uno — recuerdo compartible que sobrevive al viaje. Alto Delight + Hard-to-copy (es vuestro contenido, irrepetible). |
| I13 | **Reacciones / comentarios en el revelado** | Capa social ligera: reaccionar (👏😂😱) al pin ridiculo de un amigo o comentar el resultado. Convierte el revelado en conversacion (que hoy ocurre en WhatsApp, fuera de la app). Sube engagement sin romper el modelo. |
| I14 | **Modos de juego (dificultad, pistas, solo-foto vs SV)** | El producto ya soporta foto Y Street View [[0002_streetview.sql](../../supabase/migrations/0002_streetview.sql)]. Exponer al creador: dificultad (radio de panorama, mover o no por la calle), **pistas** (pais/region revelable a cambio de puntos), modo "solo foto" para sitios sin cobertura SV (calas, interiores). |
| — | **Monetizacion ligera (futura, no prioritaria)** | El bucle completo SIEMPRE gratis (sagrado). Cuando la retencion este validada: **cosmeticos** (marcos de avatar, pines, temas de mapa — modelo GeoGuessr/Duolingo, no pay-to-win) [[GeoGuessr](https://en.wikipedia.org/wiki/GeoGuessr)]; **"viaje premium"** (un pago barato por grupo: album/recuerdos exportable, estadisticas avanzadas, temporadas con premios). **Nunca pago-para-ganar.** |

---

## 9. Tabla de priorizacion (Impacto × Apetito + DHM)

Apetito en escala Shape Up (XS≈días, S≈≤1 sem, M≈1–2 sem, L≈3+ sem). DHM: **D**elight, **H**ard-to-copy, **M**argin.

| # | Propuesta | Outcome que mueve | Impacto | Apetito | DHM | Dependencias / Riesgos |
|---|---|---|---|---|---|---|
| I3 | **Resultado individual compartible sin spoiler** | OP2 (viral) | **Alto** | S | **D** alto, **H** medio | Reusa `html-to-image`/share. Riesgo: no filtrar la ubicacion en la tarjeta. **Apuesta diferenciadora.** |
| I1 | **Aviso "te toca jugar" (WhatsApp-first)** | OP1 (re-enganche) | **Alto** | S | D medio, M alto | Version WhatsApp es barata. Push real depende de PWA+VAPID (L). |
| I5–I8 | **CRUD basico** (editar reto, gestion grupo/miembros, salir, rehacer voto) | OP3 (confianza) | **Alto** | S–M | M (table-stakes) | RLS ya hecha; falta UI+lib. Riesgo: integridad (no editar `lat/lng` con votos; no rehacer voto tras revelar). |
| I12 | **Recuerdos: mapa del viaje** | OP4 (profundidad) | **Alto** | M | **D** alto, **H** alto | Reusa retos cerrados + Leaflet. **Apuesta diferenciadora** (Hard-to-copy: es vuestro contenido). |
| I19–I20 | **Analitica: disparar eventos + funnels + North Star** | OP6 (decidir bien) | **Alto** | XS–S | M alto | Trivial (eventos ya declarados). Sin esto, priorizamos a ciegas. |
| I11 | **Temporadas/ligas + logros** | OP4 (progresion) | Medio | M | D medio, H medio | Apoya en premios/historico ya existentes. |
| I9 | **Reto diario del grupo** | OP4 (habito) | Medio | S | D medio, M medio | Necesita banco de sitios o generador. Riesgo: forzar habito en grupo inactivo cansa. |
| I10 | **Rachas de grupo con tolerancia** | OP4 (habito) | Medio | S | D medio | **Riesgo churn** si no hay tolerancia. Solo racha de grupo, no individual. |
| I16 | **Microinteracciones del revelado** | OP5 (delight) | Medio | S | **D** alto | Reusa `ScoreRing`/`CountUp`. Bajo riesgo. |
| I4 | **Invitacion con preview** | OP2 (viral) | Medio | XS | D medio | Reusa deep-link. Bajo riesgo. |
| I13 | **Reacciones/comentarios** | OP4 (social) | Medio | M | D medio | Tabla nueva + Realtime + RLS. Riesgo: scope creep. |
| I18 | **Tarjeta de compartir con mas delight** | OP2/OP5 | Medio | S | D alto, M medio | Reusa pipeline PNG. |
| I14 | **Modos de juego (dificultad/pistas)** | OP4 (variedad) | Medio | M | H medio | Sobre el motor SV/foto existente. |
| I2 | **Recordatorio de cierre** | OP1 | Medio | S | M alto | Mejor con push (depende de PWA). |
| I15 | **Tokens de diseño unificados** | OP5 (base) | Bajo-Medio | M | — | Habilita cosmeticos/temas. Refactor amplio (toca todo `web/src/ui`). |
| I17 | **Estados vacios/carga** | OP5 | Bajo-Medio | S | D medio | Bajo riesgo. |
| I6/I7 | **Transferir propiedad / expulsar / lista miembros** | OP3 | Medio | S | M | **Necesario**: hoy el dueño no puede irse ni ceder; nadie puede salir. |

---

## 10. Dimension 6 — Analitica: que vigilar y que falta

**Hoy:** Mixpanel con 14 eventos en catalogo, pero **4 declarados y no disparados**: `signup_completed`, `login`, `group_joined`, `leaderboard_shared` [[analytics.ts](../../web/src/lib/analytics.ts)]. Sin funnels ni North Star definidos.

**North Star propuesto:** **retos jugados por grupo activo y semana**. Captura el bucle social vivo (no vanity como "usuarios totales"): si un grupo juega varios retos por semana, el producto cumple su promesa (jugar y repetir).

**Metricas de soporte (segun el hito de cuentas y el genero):**
- **Activacion:** % que completa el registro al llegar por link (la nº1 — mide si la fricción del login mata el bucle) [[cuentas-y-home.md §7](cuentas-y-home.md)]; tiempo link→primer voto.
- **Bucle:** retos creados por grupo/semana; **% de miembros que juegan cada reto** (participacion); tiempo reto-creado → primer voto.
- **Re-enganche:** % de sesiones que entran por la **home sin hash** (vuelven solos, no por el chat); jugadores con ≥2 grupos.
- **Viral:** tasa de compartir resultado/clasificacion; **k-factor** (invitados que se registran por share).
- **Retencion:** D1/D7/D30 por grupo; grupos que siguen jugando tras el viaje.

**Funnels a montar:**
1. **Activacion:** `signup_completed` → `home_viewed` → (`create_group_cta`|`join_group_cta`) → `group_created`|`group_joined` → `challenge_created`|`challenge_played`.
2. **Primer reto jugado:** abrir link → `challenge_played` → `result_revealed` (mide la fricción del flujo de jugar).
3. **Re-enganche:** `result_revealed` → vuelve (`home_viewed` sin hash) en 7 dias.

**Eventos que faltan (proponer añadir al catalogo):**
- **Disparar ya** los 4 declarados (`signup_completed`, `login`, `group_joined`, `leaderboard_shared`).
- `challenge_shared` / `result_shared` (con `surface`: whatsapp/copy/download) — clave para medir I3.
- `member_left`, `member_kicked`, `group_deleted`, `challenge_edited`, `challenge_deleted`, `vote_redone` (instrumentar el CRUD nuevo de OP3).
- `notification_sent` / `notification_opened` (cuando exista I1).
- **Propiedades transversales** utiles: en `challenge_created` añadir `has_streetview`, `photo_is_hint`, `duration_hours`; en `result_revealed` ya hay `points`/`distance_km`/`timed_out` (bien) — añadir `rank_in_challenge`.

---

## 11. Recomendacion priorizada — 3 olas

### Ola 1 — AHORA: cerrar el bucle y dejar de perder confianza
*Por que:* la retencion no arranca si (a) nadie vuelve cuando le toca, (b) no hay gancho viral, y (c) la app pierde la confianza por no poder editar/gestionar nada. Todo aqui es **alto impacto / bajo-medio apetito** y reusa lo existente.
1. **I3 — Resultado individual compartible sin spoiler** (el "Wordle moment"; apuesta viral nº1).
2. **I1 — Aviso "te toca jugar" via WhatsApp** (latido del bucle, barato; push real va en la ola 3).
3. **I5–I8 — CRUD basico** (editar reto, renombrar/borrar grupo, salir de grupo, gestion de miembros/transferencia, rehacer voto con reglas). RLS ya hecha → casi solo UI.
4. **I19–I20 — Analitica** (disparar los 4 eventos huerfanos, montar funnels y fijar el North Star). XS y habilita decidir el resto con datos.

### Ola 2 — SIGUIENTE: profundidad y delight
*Por que:* con el bucle cerrado y medido, añadimos las razones de **volver mas alla del viaje** y subimos el listón emocional.
5. **I12 — Recuerdos: mapa del viaje** (apuesta de Delight/Hard-to-copy nº2).
6. **I11 — Temporadas/ligas + logros** (progresion sobre premios/historico ya existentes).
7. **I16 + I18 — Microinteracciones del revelado + tarjeta de compartir con mas delight.**
8. **I4 — Invitacion con preview** + **I9/I10 — reto diario y racha de grupo con tolerancia** (habito, con cautela anti-churn).

### Ola 3 — DESPUES: plataforma, social y monetizacion
*Por que:* requieren mas infraestructura o solo tienen sentido con retencion validada.
9. **PWA + Web Push (I1 push real, I2 recordatorios)** — cierra el bucle sin depender del chat.
10. **I13 — Reacciones/comentarios** y **I14 — modos de juego (dificultad/pistas)**.
11. **I15 — tokens de diseño unificados** (refactor que habilita cosmeticos/temas).
12. **Monetizacion ligera** (cosmeticos, "viaje premium") — solo tras validar retencion; nunca pay-to-win.

### Las 2–3 apuestas de alto Delight / Hard-to-copy
- **I3 · Resultado individual compartible sin spoiler.** Es el motor viral probado del genero (Wordle) [[Wordle](https://en.wikipedia.org/wiki/Wordle)] y hoy **no existe**. Barato, altisimo retorno en adquisicion intra/entre grupos.
- **I12 · Mapa de recuerdos del viaje.** Maximo **Hard-to-copy**: el valor es el contenido irrepetible que genera vuestro grupo (los sitios reales del viaje). Es la profundidad que a BeReal le faltó [[BeReal](https://en.wikipedia.org/wiki/BeReal)] y el recuerdo que sobrevive al viaje (re-enganche post-viaje).
- **I11 · Temporadas como "el viaje" + logros.** Convierte el historico en progresion con significado; **Delight + Margin** (habilita el "viaje premium" futuro sin romper el bucle gratis).

---

### Fuentes

- **GeoGuessr (daily, streaks, ligas, cosmeticos):** [GeoGuessr — Wikipedia](https://en.wikipedia.org/wiki/GeoGuessr) · [GeoGuessr Daily Challenge — Help](https://help.geoguessr.com/hc/en-us/articles/4409045625746-Daily-Challenge) · [GeoGuessr](https://www.geoguessr.com/)
- **Wordle (share string sin spoiler, viralidad):** [Wordle — Wikipedia](https://en.wikipedia.org/wiki/Wordle)
- **Streaks (retencion y riesgo de churn):** [Duolingo — How the streak builds habit](https://blog.duolingo.com/how-duolingo-streak-builds-habit/)
- **BeReal (asincrono, ventana de tiempo, declive):** [BeReal — Wikipedia](https://en.wikipedia.org/wiki/BeReal)
- **Notificaciones "tu turno" (asincrono):** [Words With Friends — Wikipedia](https://en.wikipedia.org/wiki/Words_with_Friends) · [Draw Something — Wikipedia](https://en.wikipedia.org/wiki/Draw_Something)
- **Compartir como imagen (tarjetas sociales):** [Strava blog](https://blog.strava.com/) · [Spotify Newsroom (Wrapped)](https://newsroom.spotify.com/)
- **Estados vacios / onboarding:** [Eleken — Empty state UX](https://www.eleken.co/blog-posts/empty-state-ux)
- **City Guesser (fricción cero, video):** [City Guesser](https://virtualvacation.us/guess)
- **Internas:** [aterrizaje-producto.md](aterrizaje-producto.md) · [prueba-de-un-dia.md](prueba-de-un-dia.md) · [cuentas-y-home.md](cuentas-y-home.md) · [pivote-streetview.md](pivote-streetview.md) · [operativa.md](../operativa.md) · [analytics.ts](../../web/src/lib/analytics.ts) · [challenges.ts](../../web/src/lib/challenges.ts) · [votes.ts](../../web/src/lib/votes.ts) · [0004_cuentas_membresia.sql](../../supabase/migrations/0004_cuentas_membresia.sql) · [0008_prizes_por_posicion.sql](../../supabase/migrations/0008_prizes_por_posicion.sql)
</content>
