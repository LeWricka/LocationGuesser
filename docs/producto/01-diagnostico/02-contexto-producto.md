# Contexto del producto y la empresa

## ¿Para qué sirve este documento?

Situar al producto y al cliente **dentro del mercado** estudiado en el documento anterior. Aquí no se hace investigación externa — son datos internos que solo conoce el cliente.

> Nota: Momentu no es una empresa; es un **proyecto personal de un solo desarrollador (Lewis)**. Muchas casillas pensadas para una empresa (facturación, empleados, política interna) no aplican y se marcan como tal.

---

## La empresa

**Nombre y descripción corta:**
Momentu — proyecto personal, no constituido como empresa. Un diario de viaje social: documentar tus viajes, compartirlos con tu círculo y que ese círculo participe jugando a adivinar dónde estás.

**Modelo de negocio:**
**Sin definir aún** — se aborda en la fase `02-modelo-economico.md`. Hoy no monetiza. Orientación previsible: B2C, probablemente freemium (a confirmar).

**Tamaño:**
Una persona (Lewis). Sin empleados, sin facturación, sin oficina.

**Posicionamiento actual en el mercado:**
Nicho / new entrant sin cuota. Producto pre-tracción; aún validando el bucle social.

---

## Producto actual

No es greenfield: **ya existe una v0.2 desplegada y en vivo.**

**Qué hace hoy** (v0.2, React + Vite + TS sobre Supabase, desplegado en Vercel):
- Crear un "viaje" (contenedor) y compartirlo por enlace.
- Publicar momentos (fotos, con compresión + estripado de EXIF en cliente para no filtrar el GPS).
- Retos de adivinar ubicación en el mapa (Leaflet + OSM), con scoring por cercanía y cuenta atrás.
- Cuentas (login magic link / entrada anónima nombre+email), perfil, membresía, propiedad, home con filtro Todos/Míos/De amigos.
- Marcador en vivo e histórico (Supabase Realtime).

**Volumen y tracción:**
Se probó **una vez, en un viaje real**, pero en una versión que era **solo retos** (solo el juego de adivinar, sin la capa de diario). Aprendizaje clave de ese test: **el juego solo no basta** — "se necesitaba algo más que juegos". Ese aprendizaje es el origen del pivote a diario de viaje (lo personal como base). **La versión actual (v0.2, con diario) NO se ha probado aún con gente real.** No hay tracción medida de la propuesta actual.

**Fortalezas reconocidas:**
- La **mecánica de reto/juego demostró enganchar** en el único test real (pero se reveló insuficiente por sí sola).
- **Hay mucho ya construido** — la v0.2 está desplegada y es funcional; a efectos de MVP, no falta producto.

**Debilidades reconocidas:**
- 🔴 **La hipótesis central está sin validar:** que diario + juego juntos funcionen no se ha probado con usuarios reales. Lo único validado es lo que NO funciona (juego solo).
- Riesgo de **haber construido de más antes de validar** — de ahí la decisión de parar de construir (ver "Momento").

**Deuda técnica/producto:**
- Rediseño de pantallas en curso (jul 2026) — sistema de componentes + flujo (lenguaje visual Atelier+Polarsteps).
- E2E pendiente de reescribir para el flujo con login.
- Sin protección de rama (merges a mano).

---

## Momento de la empresa

**Triggers internos:**
Capacidad de construir habilitada por IA (un solo desarrollador puede hacer el producto sin inversión externa). Ver `00-vision.md` → "Por qué ahora".

**Triggers externos:**
Comportamiento preexistente: un grupo de viaje en WhatsApp que ya juega "a ojo" a adivinar dónde está cada uno (origen del producto). Ventana competitiva frente a Polarsteps (que podría copiar la jugabilidad).

**Urgencia:**
"Cuanto antes", sin deadline externo fijo. Es un "hay que ir rápido" por la ventana competitiva, no un "hay que entregar en fecha X".

**Decisión de foco declarada por Lewis (4 jul 2026) — importante para el roadmap:** *"hay mucho construido pero no quiero construir más, me vale para MVP; quiero dejar claras las métricas y validar hipótesis."* → La prioridad **NO es más features**, sino **instrumentar métricas + validar hipótesis** con la v0.2 que ya existe. El siguiente movimiento del producto es de **validación, no de construcción**.

---

## Stakeholders

| Stakeholder | Rol | Interés | Influencia | Postura |
|-------------|-----|---------|------------|---------|
| Lewis | Fundador / único desarrollador / PM | Total | Total | Impulsor |
| Círculo de prueba (pareja, amigos, grupo de viaje) | Usuarios/audiencia de validación | Alto | Media (feedback) | A confirmar |

---

## Restricciones organizativas

**Equipo disponible:** una persona (Lewis). Full-stack + producto + diseño en la misma persona.

**Presupuesto:** sin presupuesto formal. Solo costes de infra (Supabase, Google Maps, Vercel) que hay que mantener bajos (ver `docs/operativa.md` del repo: alerta de presupuesto y protección de la key de Maps).

**Tiempo:** sin deadline comprometido. Disponibilidad limitada por ser una sola persona.

**Dependencias internas:** ninguna organizativa. Técnicas: Supabase, Google Maps, Vercel (ver visión).

**Política interna:** no aplica (proyecto de una persona).

---

## Posición competitiva actual

Producto pre-tracción, sin cuota de mercado, en un espacio dominado por Polarsteps (diario de viaje) e Instagram/WhatsApp (compartir). Su única carta diferencial hoy es la **jugabilidad social sobre el diario**, aún no validada con usuarios reales fuera del círculo cercano.

---

## Implicaciones

> Se completan al cerrar mercado + este contexto.

1. **La restricción dura es una sola persona:** todo el alcance y ritmo dependen de ello → refuerza "simple e iterar".
2. **El movimiento es validación, no construcción.** Hay producto de sobra para un MVP; lo que falta es probar la hipótesis central con gente real e instrumentar las métricas. El roadmap debe ser de *assumption tests*, no de features.
3. **Solo sabemos lo que NO funciona (juego solo).** El aprendizaje del único test real justifica el pivote a diario, pero la propuesta actual (diario + juego) sigue sin evidencia. El diagnóstico parte de aquí: hipótesis central abierta.
4. **Pre-tracción → North Star = tasa, no volumen** (coherente con la visión): primero probar que un viaje engancha.

---

## Tradeoffs y decisiones

- **No constituir empresa ni buscar inversión ahora:** se construye con recursos propios + IA para no depender de financiación. Coste: techo de capacidad.
- Resto pendiente.
