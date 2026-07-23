# Visión del producto

## ¿Para qué sirve este documento?

La visión es el **norte** del proyecto. Define qué problema resolvemos, para quién y qué cambio queremos ver en el mundo. Es lo primero que se decide y lo que informa todo lo demás (diagnóstico, política, roadmap).

## Preguntas clave que debe responder

1. ¿Cuál es el **problema fundamental** que resolvemos?
2. ¿Quién es el **usuario objetivo** principal?
3. ¿Qué nos hace **diferentes** de las alternativas?
4. ¿Qué **outcome** (cambio medible en el cliente) queremos provocar?
5. ¿Cómo se ve el **éxito en 12 meses**?
6. ¿Qué **restricciones** conocidas existen?
7. ¿Hay una **North Star metric**?

---

## Elevator pitch

> Una frase clara que captura el proyecto. Plantilla: "Para [usuario objetivo] que [tiene este problema], [nombre del producto] es [categoría] que [diferenciación principal]."

**Frase (síntesis, 4 jul 2026):**

> Para quien hace viajes que importan, **Momentu** es un **diario de viaje** para **documentar tus viajes** como quieres y tenerlos bien guardados, **compartirlos** con la gente que más quieres, y que además esa gente pueda **ser parte del viaje** —participando, jugando a adivinar dónde estás, no solo mirándolo.

**Orden de valor (importante — lo aclaró Lewis, 4 jul 2026):** es una **prioridad de cimiento, no de importancia**:

1. **Lo personal es la base:** documentar y guardar tus viajes. Sin esto no hay nada que compartir — es el requisito.
2. **Lo social es el diferenciador:** compartir + que la gente sea *parte* del viaje (el **reto**) es lo que distingue a Momentu del resto de diarios de viaje.

Las dos importan y no compiten: lo personal es condición necesaria; lo social es la ventaja. Un diario sin lo social es "otro Polarsteps"; lo social sin un buen diario personal no tiene sobre qué construirse.

**Frase ancla de producto** (de `CLAUDE.md`): *"Comparte tus viajes de una forma diferente."* — el gancho es compartir distinto; la mecánica de adivinar baja al subtítulo.

---

## Problema fundamental

**El dolor (lado creador):** cuando alguien hace un viaje importante y quiere compartirlo, hoy solo puede *emitir*: mandar fotos y estados por WhatsApp a familia/amigos, o montar una galería compartida — y ahí se acaba. No existe una forma de que los demás **sean partícipes** del viaje. Polarsteps cubre el hueco del diario de viaje compartible, pero es unidireccional: "te comparto un viaje y ya está", sin interacción — y además exige instalarse una app.

**El dolor (lado audiencia — hipótesis, sin evidencia aún):** seguir el viaje de otro es pasivo y no ofrece recompensa; sin algo divertido que hacer, la gente no se engancha a seguirlo.

**Acotación del creador:** no es para cualquier viaje — es para **viajes turísticos importantes**, los que de verdad quieres compartir. Hipótesis de caso ancla: la **luna de miel** — los invitados de la boda siguen el viaje de los novios al día siguiente. *(Hipótesis declarada por Lewis, pendiente de validar.)*

**Resumen del dolor:** compartir un viaje importante de forma que la audiencia se divierta y forme parte de él, sin fricción de instalación — hoy no se puede: WhatsApp es un río sin estructura y Polarsteps es un monólogo.

**Por qué importa este problema ahora** (Lewis, 4 jul 2026):

**Lado oferta (el motor real del "ahora"):** la irrupción de la **IA** para desarrollar baja tanto el coste de construir que **una sola persona puede intentarlo**. Sin IA, este proyecto exigiría una inversión que Lewis no habría puesto — "nunca lo hubiera hecho". El "ahora" es de viabilidad de construcción, no de una fecha de mercado.

⚠️ **Distinción explícita:** esto es un "por qué ahora" de **oferta** ("puedo construirlo barato hoy"), NO de **demanda** ("el mercado lo pide más hoy que ayer"). El "por qué ahora" de demanda —si el comportamiento del usuario tiene una razón de timing— sigue **sin validar** y es tarea del diagnóstico (¿ha madurado el hábito de compartir ubicación / jugar a adivinar en grupo?).

---

## Usuario objetivo

> Definir un perfil específico, no "todo el mundo". Empezar acotado es mejor que apuntar a todo.

**Perfil principal: el viajero que comparte** (quien pagaría si hubiera que pagar).

Sus motivaciones, en el orden en que las expresó Lewis:

1. **Guardar el viaje** — documentarlo para sí mismo, que quede.
2. **Que le sigan** — compartirlo y que la gente siga el viaje.
3. **Unificar el compartir** — hoy tiene que compartir el mismo viaje con mucha gente de formas distintas (grupos, chats, canales); quiere un único sitio.
4. **Que la audiencia se enganche** — dejarles participar para que sigan el viaje de verdad.

Encarnación concreta (hipótesis ancla): **pareja en un viaje importante — p.ej. luna de miel** — con una audiencia mixta de familia e invitados de la boda. *(Perfil demográfico concreto pendiente de afinar en user research.)*

**Perfiles secundarios:**

- **La audiencia** (familia, amigos, invitados): interesados secundarios. No pagan; su participación es el motor del valor que percibe el principal, pero las decisiones de producto se toman a favor del viajero cuando hay conflicto.

---

## Diferenciación

> ¿Qué hace este producto diferente de las alternativas existentes? Si no hay nada diferente, replantear la propuesta.

**Alternativas que el usuario usa hoy:**

- **WhatsApp** (grupos + estados): donde ocurre hoy el compartir; sin estructura, sin mapa, sin permanencia.
- **Polarsteps**: el diario de viaje con mapa; unidireccional (sin participación de la audiencia) y exige instalar app.
- **Instagram** (stories / close friends): alcance, pero efímero y sin diario/mapa.
- **Álbum compartido** (Google/Apple Photos): permanencia bruta, sin narrativa ni participación.
- **No hacer nada especial** (la inercia).

**Nuestra diferencia clave:**

Modelar y guardar tus viajes como quieras **y además** hacer partícipe a la audiencia de otra manera: la **jugabilidad** sobre el diario (la audiencia participa, no solo mira).

⚠️ **Debilidad reconocida explícitamente (Lewis, 3 jul 2026):** Polarsteps puede copiar la jugabilidad en cualquier momento; incluso puede interesarle. La apuesta declarada es **velocidad** ("esperemos ir lo suficientemente rápido"). No hay hoy una ventaja estructural identificada (hard-to-copy). Punto abierto que la política guía tendrá que resolver.

---

## Outcome desired

> **El cambio medible que queremos provocar en el cliente.** Esto entrará en el Opportunity Solution Tree como nodo raíz.

> Recomendación: que sea un resultado del usuario, no una métrica de negocio. Ejemplo:
> - ✅ "Reducir el tiempo dedicado a hacer la declaración de la renta de 4h a 30min"
> - ❌ "Aumentar la conversión de la landing un 10%"

**Outcome compuesto:** que el viajero pase de "emito fotos por WhatsApp que se pierden y nadie hace nada con ellas" a:

1. **su viaje queda documentado** — modelado como él quiere, con permanencia, y
2. **su gente participó en él mientras ocurría** — la audiencia entró, jugó y reaccionó durante el viaje, no después.

Un viaje donde solo pasa (1) es Polarsteps; donde solo pasa (2) es un juego sin recuerdo. Momentu funciona cuando pasan las dos.

⚠️ *Riesgo aceptado conscientemente: un outcome doble es más difícil de medir y de usar para priorizar. Mitigación: definir el umbral compuesto de "viaje vivo" (abajo) como métrica única.*

**Cómo lo mediríamos — umbral compuesto de "viaje vivo"** (Lewis, 4 jul 2026):

Hay **dos niveles**, y el éxito real es el segundo. El primero solo demuestra que el producto sirve para guardar; el segundo, que el bucle social funciona.

**Nivel 0 — "viaje documentado" (mínimo, NO es el éxito)** — redefinido el 15 jul 2026: el umbral original (≥ 1 momento cada 2 días) medía *"el creador no abandonó la app"*, no *"el viaje quedó documentado"* — un viaje de 14 días pasaba con 7 momentos, un álbum raquítico. El criterio de fondo, en palabras de Lewis: **"que cuando lo compartas se vea que hay cosas — que ha habido movimiento"**. Se cumplen las dos a la vez:

- **Cobertura: ≥ 70% de los días del viaje con ≥ 1 momento.** Mata el documentar a ráfagas: el viaje se ve entero.
- **Densidad: media de ≥ 2 momentos por día de viaje**, calculada sobre **todos** los días del viaje (no solo los activos, para que 3 días cargados y 11 vacíos no pasen el listón). Cuentan **foto, vídeo y audio por igual** — son momentos, no solo imágenes. *(Pendiente de decidir: ¿cuenta una entrada solo-texto?)*

Listón de ejemplo: un viaje de 14 días exige actividad en ≥ 10 días y ≥ 28 momentos (el umbral viejo pedía 7). ⚠️ Los números (70%, 2/día) son **hipótesis calibradas a ojo, no evidencia**: el piloto los contrasta con lo que produce un viaje que su creador considera "bien documentado".

**Nivel 1 — "viaje vivo" (el éxito real = se comparte y la audiencia participa):** se cumplen a la vez:
1. **Se crean retos, en plural y con ritmo:** **≥ 1 reto cada 3 días** de viaje (no un único reto anecdótico).
2. **La audiencia entra:** hay gente que abre el link de compartir para ver el viaje.
3. **La audiencia juega:** hay gente que interactúa con los retos (no solo mira).
4. **Seguimiento sostenido de principio a fin:** **≥ 50%** de las personas que entran al principio del viaje siguen participando **hasta el final**. Instrumentación (decidida 4 jul 2026):
   - **Suelo de participantes:** el viaje solo entra en la categoría "vivo" si tiene **≥ 3 participantes distintos** en la audiencia. *(Suelo mínimo para contar, no objetivo — ver nota abajo.)*
   - **"Siguió hasta el final" = método A (días activos), en relativo:** un participante "sigue" si estuvo activo (entró o jugó) en **≥ 50% de los días del viaje**. En relativo para que un viaje corto (finde de 2 días) no sea imposible de cumplir.
   - **Criterio compuesto:** de los que entraron en el primer día activo del viaje, ≥ 50% cumplen el umbral de días activos.

**Métrica complementaria del Nivel 1 — "seguimiento del juego"** (añadida 15 jul 2026; es **indicador del wedge, NO gate** del "viaje vivo" — convertirla en gate con este listón haría el nivel casi inalcanzable; se revisa tras el piloto):

- **Definición:** **≥ 80%** de quienes juegan su primer reto disponible siguen jugando **el último reto del viaje**.
- **Anclado por punto de entrada:** el "primer reto" de cada persona es el primero disponible **desde que ella entró** — quien llega a mitad de viaje cuenta igual, sin penalizar la métrica (resuelve el problema de los que entran tarde; decidido 15 jul 2026).
- **Endpoint = el último reto, literal** (decisión de Lewis; **riesgo aceptado:** un único reto mal colocado —mala hora, día de vuelta— puede hundir la métrica sin que la audiencia se haya caído de verdad. Si en el piloto pasa, revisar hacia "tramo final").
- **Reparto de papeles con el criterio 4:** el criterio 4 mide seguimiento **pasivo** (cualquier actividad — la Carmen que mira sin jugar); esta métrica mide seguimiento **activo del juego** (el Miguel): si el reto mantiene tirón o se agota tras la novedad. Dos métricas, dos personas — no compiten.
- ⚠️ El 80% es **hipótesis a calibrar**. A escala piloto la lectura no es el % (una cohorte de 5 → 80% = 4 personas): es **quiénes concretos dejaron de jugar, y preguntarles por qué**.

⚠️ **Puntos débiles reconocidos:**
- **Suelo bajo:** 3 participantes es el mínimo para *contar como candidato*; en el caso ancla (luna de miel + invitados de boda) la audiencia realista es de 15-30 personas, así que el suelo NO es la meta. La meta de participación se afinará en user research / roadmap.
- Los umbrales de ritmo (cobertura/densidad del Nivel 0, 1 reto/3 días) también se leen relativos a la duración del viaje (misma lógica que el criterio 4).

**Árbol de instrumentación** (material bruto de Lewis, 3 jul 2026 — alimentará el panel de métricas; son sub-métricas del outcome, no el outcome):

- **Lado creador:** usuarios que crean viajes · viajes por usuario · **momentos por viaje** · profundidad de cada momento (fotos, descripción) · momentos compartidos · **retos creados** · seguimiento de cada reto compartido.
- **Lado audiencia:** cada cuánto entran y cómo · respuesta a notificaciones · si juegan y si lo hacen durante todo el viaje (engagement sostenido).
- **Recap:** pendiente — Lewis quiere una métrica asociada al recap (¿generado? ¿visto? ¿compartido/descargado?).

---

## Éxito en 12 meses (referencia inicial)

> Si dentro de 12 meses miras atrás, ¿qué necesitas ver para considerar esto un éxito? Esto es una **referencia rápida** — la foto detallada del futuro se concreta al final del proceso, una vez tengamos diagnóstico, política y roadmap (ver `05-foto-estado-futuro.md`).

**Frase-visión a 12 meses (Lewis, 15 jul 2026 — el norte en una línea):**

> **Momentu es la aplicación que te llevas en cada viaje importante.** De la misma forma que te coges un seguro de viaje, arrancas un viaje en Momentu para ordenarlo.

Por qué esta frase condiciona: fija la **categoría** (la app del viaje que importa, no de todos) y clava el **gesto de adopción** —arrancar Momentu *al empezar* el viaje, como un ritual de salida, no decidir usarlo a mitad—. El éxito es que ese gesto se vuelva reflejo.

**Hitos** (Lewis, 4 jul 2026; revisados el 15 jul 2026 — el hito de metodología se sacó de aquí, ver nota abajo):

1. **Producto — crecimiento y posición:** ver que los viajes **aumentan** (referencia lanzada por Lewis: **~+50% mensual**, teniendo en cuenta estacionalidad) y empezar a **posicionarse como app de referencia** para este tipo de viajes.
2. **Señal cualitativa de pull (tracción orgánica):** que **gente cercana pregunte por la app** para usarla por iniciativa propia, que la gente del área de impacto **quiera seguir usándola**, e incluso que **den feedback** sin pedirlo.

⚠️ **Retos a estos hitos:**
- **El +50% mensual necesita base.** Un 50% sobre 2 viajes es ruido; sobre 50 es negocio. Sin un suelo de partida, el ratio no dice si va bien. A fijar cuando haya baseline.
- **"App de referencia" en 12 meses, siendo una persona sola, es aspiracional.** Se conserva como norte, no como compromiso medible a 12m.
- El hito 2 (pull orgánico) es probablemente **la señal más honesta de product-market fit temprano** de las dos. Vale la pena elevarlo cuando se concrete la foto del futuro.

> **Nota (decisión de Lewis, 15 jul 2026):** el hito que encabezaba esta lista —"que exista una buena metodología de hacer producto basada en impacto"— es un objetivo de **aprendizaje sobre el proceso**, no del producto. Mezclarlo aquí contaminaba la visión: el éxito de Momentu no puede ser "haber trabajado bien". Se movió a la bitácora del proceso ([Frameworks/mejoras-proceso-540.md](Frameworks/mejoras-proceso-540.md), §"El objetivo del proceso"), donde tiene su propia métrica (M11).

---

## Restricciones conocidas

> ¿Qué limitaciones existen que condicionarán las decisiones?

- **Recursos:** **una persona (Lewis)**, solo. Sin equipo. Esto es *la* restricción dura: el alcance de lo que se puede construir y mantener está limitado por una única persona. Refuerza la política de "lo más simple posible e iterar".
- **Tiempo:** **cuanto antes**, sin deadline fijo externo. No hay ventana dura (ni una luna de miel concreta que cumplir), pero la apuesta por la velocidad (ver Diferenciación) presiona a lanzar y validar rápido antes de que Polarsteps u otro copie la jugabilidad.
- **Dependencias:** las ya asumidas del producto — Supabase (Postgres/Realtime/Storage/Edge Functions) para el bucle, Google Maps (coste + API key a proteger), `https` para geolocalización/cámara. Sin dependencias nuevas conocidas.
- **Regulación:** **aparcada conscientemente por ahora.** ⚠️ Riesgo aceptado, no ignorado: el core del producto es compartir **ubicación real + fotos** (potencialmente con menores en fotos de viaje). RGPD/privacidad es un frente real que habrá que abordar antes de escalar o abrir el producto más allá del círculo de confianza. Se difiere para validar primero el bucle, no porque no exista el riesgo.

---

## North Star metric

**North Star: tasa de conversión a "viaje vivo"** (Lewis, 4 jul 2026).

- **Definición:** `% de viajes creados que alcanzan el estado "viaje vivo"` (nivel 1 del umbral compuesto, ver Outcome).
- **Por qué la tasa y no el volumen:** estamos validando que el **bucle social funciona** (que lo que se crea engancha y se repite), no escalando aún. Premiar la calidad del bucle antes que el crecimiento bruto.
- **Ventana:** medida sobre viajes **finalizados** en una ventana móvil (por defecto 90 días; a ajustar cuando haya volumen real). *(Hipótesis — pendiente de fijar con datos.)*
- **Umbral de "sano": DIFERIDO CON CONDICIÓN (no es un TODO abierto).** No se fija ahora a propósito: poner un número sin baseline sería inventar. **Condición de desbloqueo:** se fija tras el primer piloto, cuando haya ≥ N viajes finalizados con datos reales (N a acordar al montar los tableros). Hasta entonces la North Star **no se lee como %** — a escala piloto se lee como **veredicto binario por viaje** (¿llegó a Nivel 1? ¿en qué escalón del bucle se cayó?), según M12.

**Guardarraíles (para que la North Star no engañe):**
- **Suelo de fiabilidad:** la tasa solo se reporta si hay un mínimo de viajes creados en la ventana (a bajo volumen el % es ruido). Umbral pendiente de fijar.
- **Contra-métrica de volumen:** `nº de viajes creados por periodo`. Vigila que no optimicemos la conversión de una base que se encoge.

**North Star de largo plazo — recurrencia (Lewis, 4 jul 2026):** `nº de viajes que crea un usuario`. La tasa de conversión mide si *un* viaje funciona; la recurrencia mide si el *usuario vuelve*. Es la métrica de salud a largo plazo, pero **no la de ahora** (primero hay que probar que un viaje engancha).

⚠️ **Riesgo estructural marcado (a validar en diagnóstico):** el motor de recurrencia depende de que la gente viaje, y **la gente viaja poco** (varias personas no harán más de un viaje "de este estilo" al año). Si la frecuencia real de viaje del segmento es baja, la recurrencia es frágil por diseño y habrá que buscar recurrencia por otra vía (¿revisitar viajes pasados? ¿recaps? ¿usos no-viaje?). **Pregunta para el estudio de mercado: ¿cada cuánto viaja de verdad el segmento objetivo?**

---

## Tradeoffs y decisiones

> Qué se descartó en esta visión y por qué. Hacer explícitos los tradeoffs evita arrepentimientos futuros.

Síntesis de las decisiones tomadas en la visión (4 jul 2026):

1. **Velocidad sobre ventaja estructural.** No hay hoy un *hard-to-copy* (Polarsteps podría copiar la jugabilidad). Se elige apostar por **llegar rápido** en vez de esperar a tener una ventaja defendible. Riesgo: si alguien grande copia, la ventaja se evapora. *(La política guía deberá abordar esto.)*
2. **Calidad del bucle sobre crecimiento (North Star = tasa, no volumen).** Se prioriza validar que un viaje engancha antes que escalar el número de viajes. Descarta optimizar tracción bruta a corto plazo.
3. **Outcome doble (documentado + participado) sobre uno simple.** Más difícil de medir que un outcome único; se acepta a cambio de capturar la tesis completa. Mitigado con el umbral "viaje vivo".
4. **Recurrencia apostada a que la gente viaje.** El motor de repetición a largo plazo depende de la frecuencia de viaje del segmento, que puede ser baja. Riesgo estructural asumido; a validar en diagnóstico.
5. **Se decide a favor del viajero, no de la audiencia.** Cuando el interés del creador y el de la audiencia chocan, gana el creador (es quien pagaría). La audiencia es el motor del valor, pero no el cliente.
6. **RGPD/privacidad diferida.** Compartir ubicación real + fotos es sensible; se aparca para validar el bucle primero. Riesgo consciente, no ignorado.
7. **"Por qué ahora" de oferta, no de demanda.** El momento lo habilita la IA (construir barato), no una urgencia de mercado demostrada. Se asume que la demanda está por validar.
8. **Suelo de "viaje vivo" laxo (3 participantes).** Para no excluir viajes pequeños, el umbral mínimo es bajo; a cambio, la métrica es permisiva y no distingue "vivo de verdad" de "vivo mínimo". La meta real de participación se afina más adelante.
9. **El objetivo de aprendizaje (metodología) se separa del producto (Lewis, 15 jul 2026).** El éxito de Momentu se mide solo en outcomes de producto; el objetivo de "aprender a hacer producto guiado por métricas e impacto / validar el proceso 540" vive en la bitácora del proceso con su propia métrica (M11: tiempo-hasta-veredicto con evidencia). Evita confundir un proyecto bien documentado con un producto que funciona.
