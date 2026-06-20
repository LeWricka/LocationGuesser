# LocationGuesser — Identidad y sesiones

**Fecha:** 20 junio 2026 · **Estado:** decisión cerrada · **Framework:** Kernel de Rumelt (diagnóstico → política guía → acciones coherentes)

> Pregunta de partida: ¿metemos usuarios/sesiones "de verdad" (login real) ahora, o seguimos con la identidad ligera y validamos primero el bucle social? **Decisión: NO aún — validar el bucle primero.**

---

## 1. Diagnóstico

El riesgo nº1 del producto **no es "no tener cuentas"**, es que **el grupo no juegue o no repita**. LocationGuesser nace de un caso real (un grupo de WhatsApp que ya juega "a ojo"); el objetivo declarado es que el grupo juegue **≥1 reto durante el viaje y repita** [[CLAUDE.md]]. Mientras eso no esté validado, todo lo que no mueva esa aguja es coste de oportunidad.

El **login real no mueve esa aguja** y, sin embargo, mete fricción y complejidad en el peor momento (antes de tener señal de que el bucle funciona):

- **Fricción para jugar:** registro/verificación antes de poder votar un reto. En un grupo de amigos que entra desde un enlace de WhatsApp, cada paso extra es una caída. Hoy se entra y se juega sin pedir nada si ya tienes `localStorage`, y como mucho nombre + PIN si el navegador está limpio [[docs/estrategia/prueba-de-un-dia.md]] §4.
- **Complejidad técnica:** Supabase Auth, migrar **RLS de "lectura/escritura pública validada en cliente"** [[docs/estrategia/prueba-de-un-dia.md]] §8 a políticas **por usuario**, recuperación de cuenta, envío de emails (magic link / OAuth). Es un cambio estructural en el modelo de datos y de seguridad, no un añadido.
- **No desbloquea nada que el grupo necesite hoy.** La identidad estable que el juego necesita —para sumar puntos en la clasificación del viaje— **ya existe** y es el **nombre**, no la cuenta [[docs/estrategia/prueba-de-un-dia.md]] §4.

El "candado de identidad blando" (PIN de 4 dígitos forzable, `pin_hash` legible) es un riesgo **conocido y asumido**: frena el robo casual entre amigos, no es seguridad real [[docs/estrategia/prueba-de-un-dia.md]] §4, §9. Para una prueba con un grupo de amigos, es suficiente.

---

## 2. Política guía

**No introducir autenticación real hasta haber validado que el bucle social funciona (se juega y se repite).** Coherente con la filosofía del proyecto: "lo más simple posible e iterar; lanzar y validar; antes de añadir login/cuentas de verdad, validar que el bucle social funciona" [[CLAUDE.md]].

Corolario operativo: la inversión en identidad se prioriza por **dolor observado en la prueba**, no por completitud técnica. Mientras nadie sufra la ausencia de cuentas, no se construye nada de cuentas.

---

## 3. Acciones coherentes / estado actual

La identidad ligera **ya implementada** (v0.2) es suficiente para la prueba. Resumen de lo que hay [[docs/estrategia/prueba-de-un-dia.md]] §4:

- **Identidad global del navegador:** `localStorage` guarda `client_id` + `name` + `pin_hash`, válido para *todos* los grupos.
- **Cero fricción si ya tienes `localStorage`:** te unes a cualquier grupo sin teclear nada; se inserta tu fila en `players`.
- **Navegador limpio → una sola vez:** nombre + **PIN de 4 dígitos**. Nombre nuevo lo creas; nombre existente lo recuperas con el PIN (recupera `name` + `client_id`).
- **La identidad estable es el NOMBRE,** no el dispositivo. Votos por `(group_id, challenge_id, player_name)`; la clasificación general suma por `name`. Si recuperas tu nombre en otro móvil con el PIN, conservas tus puntos.
- **Candado blando, no seguridad real:** suficiente para un grupo de amigos; upgrade real diferido.

Por qué basta para la prueba: el juego solo necesita poder **atribuir votos y sumar puntos a una persona estable dentro de un grupo**. El nombre + PIN ya lo da, sin registro, sin emails y sin tocar RLS. Cualquier cosa por encima de eso es resolver un problema que aún no hemos observado.

---

## 4. Opciones evaluadas

| # | Opción | Coste / apetito | Fricción para jugar | Qué desbloquea | Riesgos |
|---|--------|-----------------|---------------------|----------------|---------|
| **1** ✅ **ELEGIDA** | **Identidad ligera actual** (nombre + PIN + navegador en `localStorage`) | Cero (ya implementada) | **Mínima**: nada si hay `localStorage`; nombre + PIN una vez si el navegador está limpio | Bucle completo: jugar, atribuir votos, clasificación general del viaje | Candado blando (PIN forzable); pierdes identidad al borrar `localStorage` y no recordar nombre+PIN; un navegador = una persona |
| **2** 🔭 candidata futura | **Punto medio: "código de recuperación"** para reclamar tu nombre en otro dispositivo o tras borrar `localStorage`, **sin login ni emails** | Bajo / **apetito S** | Ninguna añadida (opcional, solo cuando lo necesitas) | Portabilidad de identidad entre dispositivos sin tocar el modelo de seguridad | Sigue siendo candado blando; un secreto más que custodiar; no resuelve seguridad real (no es su objetivo) |
| **3** 🚧 diferida | **Login real con Supabase Auth** (magic link / OAuth) + **RLS por usuario** | Alto / apetito alto | **Alta**: registro/verificación antes de jugar | Seguridad real, cuentas portables nativas, base para multi-grupo/multi-viaje robusto, push asociado a usuario | Caída por fricción de registro; reescritura de RLS de público → por-usuario; recuperación + emails; no mueve la aguja del bucle hoy |

Las opciones (2) y (3) **no son excluyentes**: (3) absorbe a (2). El sentido de (2) es comprar portabilidad barata **si** aparece el dolor antes de que toque hacer (3).

---

## 5. Disparadores de reevaluación

Señales **observables en la prueba real** que justificarían mover ficha. Mientras no se vean, no se construye.

**Hacia la opción (2) — "código de recuperación" (dolor de portabilidad, apetito bajo):**
- La gente pide jugar **desde móvil y portátil** (el mismo jugador en dos dispositivos) y se le parte la identidad.
- Quejas concretas de **perder el historial / los puntos al borrar datos** del navegador o cambiar de teléfono.
- Alguien pierde su nombre+PIN y no hay forma cómoda de reclamarlo → fricción de soporte manual.

**Hacia la opción (3) — login real (necesidad estructural, apetito alto):**
- El **bucle ya está validado** (se juega y se repite) y el límite de crecimiento pasa a ser la confianza/seguridad o la identidad portable seria.
- **Varios grupos/viajes por usuario** se vuelven la norma y la identidad por nombre-en-grupo se queda corta.
- Aparece **robo de identidad no casual** o disputas por puntuación que el candado blando no aguanta.
- Requisitos que dependen de identidad fuerte: **push real** asociado a usuario, privacidad/permisos por persona, datos sensibles.

---

## 6. Decisión y siguiente paso

- **Ahora:** opción **(1) identidad ligera actual**. Es lo implementado, no añade fricción y soporta el bucle completo. **Marcada como elegida.**
- **Futuro de bajo apetito:** opción **(2) código de recuperación**, candidata **solo si aparece el dolor** de portabilidad (ver §5). Registrada como issue en Backlog (P2, Size S), sin empezar.
- **Diferida:** opción **(3) login real con Supabase Auth + RLS por usuario**, **solo tras validar el bucle** y cuando el límite de crecimiento sea de verdad la identidad/seguridad, no la fricción.

> Nota para el orquestador: conviene enlazar este documento desde la tabla de estado de `CLAUDE.md` (área de configuración, no la edito desde aquí).
