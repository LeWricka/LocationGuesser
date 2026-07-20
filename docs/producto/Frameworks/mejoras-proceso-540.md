# Mejoras al proceso 540 — bitácora viva

> Registro continuo de mejoras al método de creación de producto 540 (Kernel de Rumelt + Opportunity Solution Tree de Teresa Torres), detectadas *haciendo* producto. Iniciada el 13 jul 2026 durante la definición de **Momentu**. **Se va anotando todo aquí.** Cuando una mejora esté madura y validada, se considera plegarla al skill `/init-producto`.

---

## El objetivo del proceso (movido desde `00-vision.md` el 15 jul 2026)

Este proyecto tiene **dos productos**: Momentu (la app) y **el proceso 540** (la capacidad de definir producto guiado por métricas, experimentos y acciones que las mueven — reutilizable en otros proyectos, empezando por este caso greenfield acotado). El objetivo de aprendizaje de Lewis —"mirar atrás y ver que existe una buena metodología de hacer producto basada en impacto, y dominar el proceso de principio a fin"— era el hito nº 1 del "éxito en 12 meses" en la visión de Momentu; **se saca de ahí** porque el éxito de la app no puede medirse por la calidad del proceso (decisión de Lewis, 15 jul 2026). Cada producto lleva su cadena: la de Momentu vive en `docs/producto/`; la del proceso vive aquí, y su métrica es la **M11: tiempo-hasta-veredicto con evidencia** — el proceso funciona si lleva un producto de cero a un veredicto de encaje (validado/refutado) con evidencia trazable, completando ciclos.

---

## Índice de mejoras

| # | Mejora | Origen | Estado |
|---|--------|--------|--------|
| M1 | Visión = borrador con revisión obligatoria post-diagnóstico | Sesión Momentu | Propuesta |
| M2 | Guardarraíl anti "meta disfrazada de política" | Sesión Momentu | Propuesta |
| M3 | El norte/pitch lo dice el usuario, no lo sintetiza la IA | Sesión Momentu | ✅ Validada en uso (20 jul) |
| M4 | Lente anti-coste-hundido en la fase de acciones | Lewis | Propuesta |
| M5 | Métrica y acción nacen juntas | Lewis | Propuesta |
| M6 | Guardarraíl anti-salto-a-solución | Sesión Momentu | ✅ Validada en uso (20 jul) |
| M7 | Modo "auditar lo construido vs estrategia" (producto no-greenfield) | Lewis | Propuesta |
| M8 | Columna vertebral explícita del proceso, con la visión en el centro | Lewis | En discusión |
| M9 | Criterio de salida y timebox por fase ("definition of done") | Revisión 13 jul | Propuesta |
| M10 | Evidencia primaria de usuarios obligatoria antes del OST | Revisión 13 jul | Propuesta |
| M11 | El proceso tiene su propia North Star: tiempo-hasta-veredicto con evidencia | Revisión 13 jul | Propuesta |
| M9 | Criterio de salida y timebox por fase ("definition of done") | Revisión 13 jul | ✅ Validada en uso (20 jul) |
| M12 | Toda métrica debe definir su lectura a mínima escala | Revisión 15 jul | ✅ Validada en uso (20 jul) |
| M13 | Canal de oportunidades emergentes (el diagnóstico no se congela en producto vivo) | Sesión Momentu 15 jul | ✅ Validada en uso (20 jul) |
| M14 | El método necesita un modo re-paso / auditoría del kernel (no solo tubería hacia delante) | Sesión Momentu 20 jul | Propuesta |
| M15 | Gate de integridad de visión: separar objetivos del producto de objetivos personales/de aprendizaje | Sesión Momentu 20 jul | Propuesta |
| M16 | Visión (el estado) y outcome (el cambio medible) son documentos con filo separado | Sesión Momentu 20 jul | Propuesta |

> **Nota (20 jul 2026):** M9 tenía un `#` duplicado en el índice de arriba (aparecía solo como fila suelta); su estado se actualiza aquí. Las filas M9/M12/M13 de este bloque son las canónicas.

---

## Hallazgo transversal (sesión 20 jul 2026): el primer ciclo del método auditándose a sí mismo

Esta sesión NO avanzó el pipeline: **re-entró en la fase Visión ya "cerrada" y la auditó** con las mejoras como gates. Es el primer ciclo real del *otro* producto (validar el 540). Tres cosas que solo se ven habiendo hecho el re-paso:

1. **Los gates dejaron de ser teoría → M3, M6, M9, M12, M13 pasan a "Validada en uso".** Se ejecutaron en vivo y cazaron defectos reales: M3 frenó que la IA sintetizara el norte (lo dijo Lewis: "la app que te llevas en cada viaje, como un seguro de viaje"); M9 (DoD) cazó los TODOs mudos de la North Star; M12 forzó la lectura binaria por viaje a escala piloto; M13 evitó implementar dos ideas "porque sí". Evidencia de que el modelo "mejoras-como-gates" funciona.
2. **El método dejó pasar un error de categoría durante ~2 semanas** (el objetivo de metodología vivió como hito #1 de la visión *del producto* desde el 4 jul y el 540 nunca lo señaló) → origen de **M15**.
3. **Confusión visión/outcome observada 3 veces** (a "¿cuál es la visión?" Lewis respondió arreglando métricas) → origen de **M16**.

## Decisión de ejecución (15 jul 2026) — cómo se validan estas mejoras

Se re-pasa el proceso completo de Momentu con el **540 canónico como estructura** (mismas fases, artefactos y comandos) y las **mejoras M1–M12 como gates de fase**: al cerrar/abrir cada fase se aplica la mejora correspondiente como test de salida/entrada y se anota aquí el resultado (pasó / falló / aprendizaje). Así el re-paso produce dos veredictos a la vez: si el 540 funciona, y qué mejoras demuestran valor (→ Validada → plegar al skill) o no (→ Descartada). Se descartó re-pasar con la columna vertebral de M8 como esqueleto nuevo (habría validado un blanco móvil y dejado el 540 original sin veredicto).

Asignación de gates por fase: **Visión** → M1 (revisión post-diagnóstico), M3 (el norte lo dice el usuario), M9 (DoD declarado al entrar) · **Política** → M2 (¿palanca o meta reformulada?) · **OST** → M6 y M10 al entrar, M4 y M5 durante · **Roadmap/Futuro** → M9, M11 · **Transversal** → M7 (auditar lo construido vs estrategia), M12 (lectura a mínima escala de cada métrica).

---

## M1 — La visión es un borrador con revisión obligatoria post-diagnóstico
- **Qué pasó:** hicimos la visión al principio; el diagnóstico la maduró; la incoherencia estalló al escribir la política. El método solo re-chequea coherencia al final ("foto del estado futuro").
- **Mejora:** checkpoint explícito **"revisar visión" entre diagnóstico y política**. Adelantar la verificación de coherencia del kernel.
- **Por qué:** evita construir la política sobre una visión rancia. La visión-primero es una *hipótesis-norte*, no una verdad tallada.

## M2 — Guardarraíl anti "meta disfrazada de política"
- **Qué pasó:** se mezcló visión (el éxito) con política (el cómo). "Que el producto triunfe" se coló como si fuera política.
- **Mejora:** test-gate antes de escribir la política: *"¿esto es un enfoque con palanca apoyado en el diagnóstico, o es la meta reformulada?"*. Si es lo segundo, no es política (aviso clásico de Rumelt sobre "fluff"/goals-as-strategy).

## M3 — El norte/pitch lo dice el usuario, no lo sintetiza la IA
- **Qué pasó:** la IA redactó el elevator pitch como síntesis → salió blando, y esa blandura fue la semilla de la incoherencia posterior.
- **Mejora:** la frase-estado-de-éxito se **elicita del usuario en sus palabras y se tensa**; la IA reta, no rellena el norte.

## M4 — Lente anti-coste-hundido en la fase de acciones *(Lewis)*
- **Qué pasó:** la IA repetía "ya está construido → es barato/soporte", sesgando hacia conservar lo hecho.
- **Mejora:** en el OST, construir el árbol **greenfield (como si no hubiera nada)** y solo después **superponer lo construido** y clasificar: mantener / sobra / hueco. No justificar lo hecho por cariño.

## M5 — Métrica y acción nacen juntas *(Lewis)*
- **Qué pasó:** la métrica (dashboard) se propuso como paso separado de las soluciones.
- **Mejora:** en el OST, **cada solución candidata lleva pegada la métrica que la probaría** (assumption test), en la misma línea. Nunca métrica-después.

## M6 — Guardarraíl anti-salto-a-solución
- **Qué pasó:** se saltó de la política directo a "la solución es un dashboard", comiéndose el OST.
- **Mejora:** regla dura: **de la política NO se pasa a una solución concreta sin abrir antes el abanico del OST.** La primera idea no se ejecuta sin alternativas al lado.

## M7 — Modo "auditar lo construido vs estrategia" (producto no-greenfield) *(Lewis)*
- **Qué pasó:** los templates 540 asumen greenfield; Momentu ya tiene una v0.2 construida.
- **Mejora:** modo explícito para producto existente: derivar lo ideal desde la estrategia → superponer el build actual → clasificar (mantener / sobra / hueco). Mezcla de M4 + "asumir que no hay nada para ver si lo que hay tiene sentido".

## M8 — Columna vertebral explícita del proceso, con la visión en el centro *(Lewis)* — EN DISCUSIÓN
- **Qué pasó:** en todo el proceso apenas hablamos de la visión; quedó de lado en vez de ser el eje del que cuelga todo.
- **Propuesta de Lewis (cadena):**

  ```
  VISIÓN
    → OBJETIVOS (cómo aseguramos que llegamos a la visión) — CON métrica (North Star / outcomes)
      → ESTRATEGIA (el enfoque con palanca = política guía)
        → MÉTRICAS de esa estrategia (indicadores de que el enfoque funciona)
          → ACCIONES que mueven esas métricas (soluciones + experimentos)
  ```

- **Refinamiento (a validar):**
  - La cadena es una fusión sana de **Rumelt** (visión/diagnóstico → política → acciones) + **Teresa Torres** (outcome → oportunidades → soluciones) + cascada tipo OKR.
  - **Sí, en "Objetivos" son necesarias métricas** — es donde vive el North Star / los outcomes medibles. Un objetivo sin métrica es un deseo.
  - **Jerarquía de métricas (para no proliferar):**
    - *Nivel Objetivos:* **1 North Star** + pocos outcomes (¿nos acercamos a la visión?).
    - *Nivel Estrategia:* pocos **indicadores adelantados** (¿el enfoque elegido está funcionando?).
    - *Nivel Acciones:* **assumption tests** (¿este experimento movió su métrica?).
  - **El diagnóstico** no es un eslabón de la cadena: es la **base de evidencia** que alimenta visión, objetivos y estrategia (va debajo, transversal).
- **Pendiente:** decidir si esta columna sustituye/ordena el índice actual de carpetas del método o si es una vista de lectura encima.

## M9 — Criterio de salida y timebox por fase ("definition of done")
- **Qué pasó:** las fases se cierran "por sensación", y la capa de estrategia lleva varias sesiones reabriéndose (visión → política → visión) sin criterio explícito de cierre. Riesgo real de *teatro de estrategia*: pulir documentos en vez de avanzar.
- **Mejora:** cada fase declara **artefacto de entrada, artefacto de salida y presupuesto de tiempo**. Se cierra al cumplir el criterio, no al agotarse la conversación. Reabrir una fase es legítimo (el método es iterativo) pero **cuesta una anotación explícita** del porqué — así el churn se ve y se gestiona.

## M10 — Evidencia primaria de usuarios obligatoria antes del OST
- **Qué pasó:** todo el diagnóstico de Momentu es desk research + entrevista al fundador. **Cero contacto con usuarios reales** — María, Miguel y Carmen son hipótesis del fundador, no síntesis de conversaciones. Para un método que se define "basado en impacto en los usuarios", es un agujero de método, no un descuido.
- **Mejora:** *gate* antes del OST: **3–5 conversaciones reales con el perfil primario** (o comportamiento observado). Sin evidencia primaria, el OST hereda ficción y los assumption tests validan personajes inventados.

## M11 — El proceso tiene su propia North Star: tiempo-hasta-veredicto con evidencia
- **Qué pasó:** el objetivo declarado del proyecto es doble (crear Momentu + mejorar el proceso 540). Pero el proceso no tiene definida su propia métrica de éxito — y sin ella, "mejorar el proceso" degenera en producir mejores documentos.
- **Mejora:** definir la North Star del propio método: **"llevar un producto de cero a un veredicto de encaje (validado/refutado) con evidencia trazable en X semanas"**. El output del proceso son *decisiones con evidencia*, no documentos. Un ciclo completo que termina en "esto no encaja, pivotamos" es un ÉXITO del proceso. Corolario: el proceso solo se puede evaluar (y por tanto mejorar) si **completa ciclos** — quedarse orbitando en la capa de estrategia impide aprender del propio método.

## M12 — Toda métrica debe definir su lectura a mínima escala
- **Qué pasó:** la North Star (tasa de conversión a "viaje vivo", un %) es ilegible a la escala del primer piloto (1–3 viajes): un porcentaje sobre N=1 no dice nada, y el plan de medición solo lo cubría con un "suelo de fiabilidad" pendiente.
- **Mejora:** al definir cualquier métrica, declarar también **cómo se lee a la escala más pequeña en la que se va a usar** (p. ej. el % se convierte en veredicto binario por viaje + escalón del embudo donde se cayó). Una métrica sin lectura a mínima escala pospone la validación sin que se note.
- **Por qué:** los primeros ciclos de un producto SIEMPRE ocurren a N minúsculo; si la métrica solo funciona con volumen, el proceso se queda ciego justo cuando más necesita ver.

## M13 — Canal de oportunidades emergentes (el diagnóstico no se congela en un producto vivo)
- **Qué pasó:** el 540 asume diagnóstico → cierre → ejecución. Pero Momentu se construye y se prueba en paralelo, y a Lewis le surgen ideas nuevas (compartir selectivo, "el día preparado por la app") que no quiere meter "porque sí" pero tampoco perder. En fase muy inicial es difícil darles el tratamiento completo (problema + oportunidad + medición).
- **Mejora:** el método necesita un **canal ligero de captura de oportunidades emergentes** (sección viva en `05-problemas-oportunidades.md`: idea → problema del usuario → medición borrador → estado), separado del diagnóstico cerrado. Entran al OST con assumption test cuando toque; no se implementan al vuelo. Así el descubrimiento continuo no rompe la disciplina "validar, no construir" ni contamina la foto del diagnóstico original.
- **Por qué:** en producto greenfield vivo, congelar el diagnóstico es ficción; sin un canal, o pierdes ideas buenas o las implementas sin medición (las dos malas).

## M14 — El método necesita un modo re-paso / auditoría del kernel
- **Qué pasó:** el 540, tal como está, es una **tubería hacia delante** (visión → diagnóstico → modelo → política → OST → roadmap → futuro) con un único chequeo de coherencia *al final* (la foto del futuro). Pero esta sesión no avanzó: volvió a entrar en una fase "cerrada" para auditarla, y hubo que **inventar el modelo "540 + gates" sobre la marcha** porque el método no contempla esa operación.
- **Mejora:** un **modo re-paso / auditoría del kernel** de primera clase: recorre la cadena existente y, fase a fase, aplica los gates correspondientes clasificando cada artefacto en mantener / corregir / hueco (reutiliza, no reescribe — M4/M7). No espera a la foto del futuro para verificar coherencia.
- **Distinción con M1 y M7:** M1 es un checkpoint puntual (revisar visión entre diagnóstico y política); M7 audita el *producto construido* contra la estrategia. M14 audita la **cadena de estrategia contra sí misma**, en cualquier momento, como operación repetible.
- **Por qué:** en producto vivo la estrategia se revisa muchas veces; sin un modo definido, cada re-paso se improvisa y se pierde la disciplina de gates.

## M15 — Gate de integridad de visión: objetivos del producto ≠ objetivos personales
- **Qué pasó:** el objetivo de aprendizaje de Lewis ("que exista una buena metodología") vivió como **hito nº 1 de la visión del producto** desde el 4 jul hasta el 20 jul. El método nunca preguntó si ese objetivo era de *Momentu* o de *Lewis*. Un error de categoría que contaminó la visión durante dos semanas.
- **Mejora:** gate al cerrar la visión: por cada objetivo/hito, preguntar *"¿esto es un cambio en el mundo/cliente que provoca ESTE producto, o es un objetivo tuyo (aprendizaje, capacidad, negocio personal)?"*. Los personales salen a su propia cadena (aquí, el proceso tiene la suya). El éxito de un producto no puede medirse por lo bien que se trabajó haciéndolo.
- **Por qué:** mezclar los dos hace impriorizable el roadmap (¿optimizo la app o mi aprendizaje?) y permite el autoengaño de un "producto exitoso" que en realidad solo fue un proyecto bien documentado.

## M16 — Visión (el estado) y outcome (el cambio medible) son documentos con filo separado
- **Qué pasó:** preguntado tres veces "¿cuál es la visión?", Lewis respondió tres veces **arreglando métricas** (el umbral del Nivel 0, el seguimiento de retos). No es despiste: el template mezcla "visión" y "outcome medible" en el mismo `00-vision.md`, e invita a colapsarlos.
- **Mejora:** separar con filo **la visión (el estado del mundo que queremos ver — cualitativo, la frase-norte)** de **el outcome (el cambio medible que lo evidencia)**. Trabajarlos como pasos distintos: primero el estado en palabras del usuario (M3), y solo después cómo se mide. Si al preguntar por la visión salen números, es señal de que aún no está dicha.
- **Por qué:** una visión que solo existe como métricas es frágil (se rompe al cambiar el número); una métrica sin visión detrás mide sin saber hacia qué.

---

## Cómo usar esta bitácora
- Cada nueva fricción o acierto de proceso se anota como `M<n>` con: *qué pasó · mejora · por qué*.
- Marcar estado: Propuesta → En discusión → Validada → Plegada al skill.
