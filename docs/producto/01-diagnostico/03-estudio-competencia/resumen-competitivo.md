# Resumen competitivo — Momentu

> Análisis cruzado sobre el conjunto de competidores estudiados. Se apoya en los deep dives ([Polarsteps](deep-dives/polarsteps.md), [GeoGuessr](deep-dives/geoguessr.md)), los análisis ligeros ([apps y sustitutos](analisis-ligero/apps-y-sustitutos.md), [comparadores secundarios](analisis-ligero/comparadores-secundarios.md)) y el [estudio de mercado](../01-estudio-mercado-investigacion.md). Toda cifra lleva su fuente en el documento de origen citado; aquí se reutilizan sin volver a enlazar salvo cuando la afirmación es nueva.
>
> **Momentu** = diario de viaje social: documentar el viaje (foto + mapa + momentos) es el cimiento; compartirlo con el círculo cercano y que ese círculo **participe jugando a adivinar en el mapa dónde estás** es el diferenciador.

---

## 1. Matriz comparativa (features × competidores)

Leyenda: ✅ lo hace bien / de raíz · 🟡 lo hace parcial, débil o como añadido · ❌ no lo hace.

| Competidor | Documentar viaje | Mapa | Compartir círculo cerrado | Juego — adivinar | Permanencia (navegable) | Sin instalar app | Monetización |
|---|---|---|---|---|---|---|---|
| **Momentu** (objetivo) | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 web, grupo por enlace | por definir ([modelo económico](../../02-modelo-economico.md)) |
| **Polarsteps** | ✅ ruta GPS auto + timeline | ✅ ruta en mapa | ✅ pero unidireccional (seguir/reaccionar) | ❌ | ✅ diario permanente + libro | 🟡 seguir sin cuenta en algunos flujos | libros impresos + afiliación (no ads) |
| **GeoGuessr** | ❌ (no es tu viaje) | ✅ Street View + guess en mapa | 🟡 "party" con amigos, pero sobre fotos de desconocidos | ✅ es su núcleo | ❌ (partidas, no memoria) | 🟡 web/Steam, pero Pro-only desde feb-2024 | suscripción Pro (margen ~44%) |
| **WhatsApp** (grupos + estados) | ❌ | ❌ | ✅ el grupo ya vive ahí | 🟡 "a ojo", informal, sin soporte | ❌ se pierde en el scroll | ✅ ya instalado (91% ES) | — (infra de Meta) |
| **Instagram / Close Friends** | ❌ | ❌ | 🟡 Close Friends acota audiencia | ❌ | ❌ efímero 24h | ✅ ya instalado (~56% ES) | publicidad |
| **Álbumes compartidos** (Google/Apple) | 🟡 archivo, sin narrativa | ❌ | 🟡 requiere mismo ecosistema | ❌ | 🟡 permanente pero sin orden/relato | 🟡 nativo del móvil | — (feature de plataforma) |
| **BeReal / Locket** | ❌ momento suelto | ❌ | ✅ círculo cercano | ❌ | ❌ instante, no viaje | ❌ app propia | ads (BeReal) / freemium (Locket) |
| **Wanderlog** | 🟡 journal secundario | ✅ pero de planificación | 🟡 co-edición itinerario | ❌ | 🟡 el plan, no el recuerdo | 🟡 web + app | freemium (Pro ~40 USD/año) |
| **Journi / FindPenguins** | ✅ diario retrospectivo + mapa | ✅ | 🟡 seguir + comentar (reactivo) | ❌ | ✅ diario + libro | ❌ app propia | libros/impresiones físicas |

**Lecturas de la matriz:**

- **Ningún competidor marca ✅ en las siete columnas.** El más completo en "documentar + mapa + permanencia" es Polarsteps (y sus clones Journi/FindPenguins), y todos ellos tienen ❌ en "juego — adivinar". El único ✅ en "juego" es GeoGuessr, que a su vez tiene ❌ en "documentar viaje" y en "permanencia".
- **La columna "juego — adivinar" es la más vacía de toda la tabla.** Solo GeoGuessr la cubre, y lo hace sobre imágenes genéricas de Street View de desconocidos, **no sobre la ubicación real de alguien de tu círculo**. Nadie combina "adivinar" con "tu gente / tu viaje real".
- **La columna "compartir círculo cerrado" está saturada** (WhatsApp, Locket, Close Friends, Polarsteps la cubren) — no es un diferenciador por sí sola. El diferenciador es cruzarla con "juego" y con "permanencia de viaje".

---

## 2. Mapa de posicionamiento

Los dos ejes que mejor separan a este conjunto —y que mejor aíslan el hueco de Momentu— **no** son "personal↔social" (casi todos son ya algo social) ni "precio↔calidad" (irrelevante aquí). Son:

- **Eje X — rol del círculo:** *pasivo (mirar / reaccionar / comentar)* ↔ *activo (participar / jugar / competir)*.
- **Eje Y — unidad de contenido:** *momento suelto / efímero* ↔ *viaje estructurado / permanente (timeline + mapa)*.

Esta pareja de ejes es la más reveladora porque cada competidor cae en un cuadrante distinto y la esquina "activo + viaje permanente" queda **literalmente vacía**.

```
              VIAJE ESTRUCTURADO / PERMANENTE (timeline + mapa)
                              ▲
                              │
   Polarsteps ●              │              ★ MOMENTU
   Journi / FindPenguins ●   │              (documentar permanente
   Álbumes compartidos ○     │               + círculo que JUEGA)
   (permanente pero          │
    sin narrativa)           │           ● GeoGuessr
                             │             (activo/competitivo,
  PASIVO ───────────────────┼───────────────────────────▶ ACTIVO
  (mirar / reaccionar)       │             pero NO es tu viaje
                             │              ni permanente)
   Instagram Stories ●       │
   Close Friends ●           │        WhatsApp "a ojo" ◐
   BeReal ●                  │        (intento informal de
   Locket ●                  │         juego, sin soporte)
                             │
                             ▼
              MOMENTO SUELTO / EFÍMERO
```

- **Cuadrante superior-izquierdo (viaje permanente, pasivo):** donde vive Polarsteps y sus clones. Producto maduro y validado, pero el círculo solo observa.
- **Cuadrante inferior-izquierdo (efímero, pasivo):** Instagram, BeReal, Locket, Close Friends. Máxima escala, mínima permanencia; el círculo consume, no juega.
- **Cuadrante inferior-derecho (efímero/no-viaje, activo):** GeoGuessr. Mecánica de juego pura, sin memoria ni vínculo con la vida real del jugador.
- **Cuadrante superior-derecho (viaje permanente + círculo activo):** **vacío. Es la posición de Momentu.** WhatsApp asoma tímidamente hacia "activo" (la gente ya juega "a ojo") pero sin permanencia ni soporte de producto — lo que confirma que la demanda del comportamiento existe antes que la herramienta.

---

## 3. Espacio en blanco

**El hueco confirmado por los cuatro análisis:** nadie ofrece **documentar el viaje (permanente, con mapa) + participación activa del círculo cercano vía una mecánica de reto sobre la ubicación real del autor.** Es la intersección de las dos mecánicas que hoy viven separadas:

- Polarsteps validó el lado "documentar + compartir con ~5 personas" pero mantiene al círculo en modo espectador (su propia colaboración, *Travel Together*, es co-escribir el mismo diario, no jugar alrededor de él).
- GeoGuessr validó el apetito por "adivinar en el mapa" (85M+ registrados) pero sobre fotos de desconocidos, sin memoria ni círculo real. Su modo "party" hace competir a amigos sobre las mismas imágenes aleatorias — **no** sobre dónde está uno de ellos de verdad.
- Los sustitutos donde el compartir ocurre hoy (WhatsApp, Stories, álbumes) no tienen ni mapa-narrativa ni juego formalizado.

**Matiz honesto — el espacio en blanco no equivale automáticamente a oportunidad grande.** El diagnóstico de mercado (§7 del [estudio de mercado](../01-estudio-mercado-investigacion.md)) advierte que en España ~36% no viaja con pernoctación, el viaje "con amigos" es minoritario (8–20%) y ~40% de la actividad turística se concentra en jul–sep. Parte de la razón por la que este cuadrante está vacío puede ser que la frecuencia del evento ("un grupo de amigos de viaje que quiere jugar") es baja y estacional, no solo que "nadie se ha dado cuenta". El hueco es real; su tamaño y recurrencia son la hipótesis frágil a validar con usuarios, no un hecho asumible.

**Sub-huecos secundarios detectados** (menores, pero anotados):
- **Demanda insatisfecha de una versión gratuita/social de "adivinar en el mapa":** el paso de GeoGuessr a Pro-only (feb-2024) + subida de precios (2026) generó backlash y clones gratuitos (OpenGuessr, WorldGuessr). Hay usuarios expulsados por el paywall que quieren la mecánica sin pagar.
- **Control de audiencia granular en el diario de viaje:** ni Polarsteps (solo 3 niveles: público/seguidores/privado) ni sus clones ofrecen algo tipo "Close Friends". Es un dolor citado en reviews.

---

## 4. La hipótesis clave: ¿puede y/o quiere Polarsteps (u otro grande) copiar el reto?

> Esta es la pregunta que decide si el diferenciador de Momentu es defendible. Respuesta honesta, separando **poder** de **querer** de **barreras reales**.

### 4.1. ¿PUEDE, técnicamente? — Sí, con facilidad. No hay foso tecnológico.

Polarsteps ya tiene todas las piezas: GPS, mapa, fotos geolocalizadas, el círculo cercano de ~5 personas por viaje y una noción de grupo (*Travel Together*). Añadir "adivina en el mapa dónde se tomó esta foto, puntúa por cercanía" es, técnicamente, una feature menor — la mecánica de scoring por distancia (Haversine + decaimiento exponencial) es pública y trivial; la propia v0.1 de este proyecto ya la implementó. **No hay patente, ni dato propietario, ni capacidad técnica escasa que proteja la mecánica.** Cualquier incumbente con mapa y fotos podría clonarla en un sprint.

### 4.2. ¿QUIERE? — Hoy no hay ninguna señal de que quiera. Evidencia:

- **Toda su inversión reciente apunta en otra dirección:** IA para planificar itinerarios, *Trip Reel* (vídeo), *Polarsteps Unpacked* (resumen anual estilo Spotify Wrapped, dic-2025). Cero menciones de retos, juego o competición en notas de producto, entrevistas a la CEO ni prensa revisada (12 meses). Su vector de innovación es **nostalgia + planificación**, no interacción activa.
- **Choca con su identidad de marca:** "hecho por viajeros, para viajeros", privacidad, sin publicidad, sin *gimmicks*. Una mecánica de juego competitivo encaja mal con ese posicionamiento serio/auténtico que es su principal activo de confianza.
- **Choca con su perfil de usuario:** su base (al menos por tráfico web) sesga a 45–54 años; un reto competitivo encaja estructuralmente mejor con el perfil 18–24 de GeoGuessr. Copiar el reto le pediría atraer a un segmento que no es el suyo.
- **Su modelo mental del círculo es "seguir y reaccionar", no "competir".** Convertir a la audiencia en jugador no es una feature: es un cambio de posicionamiento. Los incumbentes rentables y enfocados rara vez hacen ese giro por una mecánica de nicho (dilema del innovador).

### 4.3. La barrera real (y honesta): no es tecnológica, es de diseño, foco y timing.

- **Barrera de diseño genuina — revelar vs. ocultar la ubicación.** El valor central de Polarsteps es **mostrar** la ruta en el mapa en tiempo real. El reto de Momentu exige lo contrario: **ocultar** la ubicación hasta que el círculo adivina. Son flujos de producto opuestos. Polarsteps no puede simplemente "activar un modo juego" encima de su timeline: tendría que construir un flujo paralelo donde el step no revela dónde es hasta el cierre del reto — un rediseño de su primitiva central, no un botón. Es una fricción real, aunque no insalvable.
- **La barrera NO es un foso defensible a largo plazo.** Hay que ser rigurosos: si Momentu demuestra que el reto genera retención y crecimiento del círculo, Polarsteps (o Meta, con su distribución) **podría** replicarlo en meses. La mecánica es copiable. La defensa de Momentu **no puede** ser "no pueden copiarlo".
- **Dónde sí hay defensa (marco DHM — *Hard to Copy*):** lo difícil de copiar no es la mecánica, es (1) hacer del reto **el núcleo de la identidad** del producto, no un modo secundario que un incumbente añade sin convicción; (2) el **efecto de red del círculo que ya juega junto** (grupos activos con historial de retos); y (3) **llegar antes y poseer el significado** ("la app donde adivinas dónde está tu gente"). Es una ventaja de **foco + timing + comunidad**, no un foso tecnológico.

### 4.4. Veredicto

**Puede copiarlo con facilidad técnica; hoy no da ninguna señal de querer; y la única barrera real que lo frena es estratégica y de diseño (choca con su identidad, su perfil de usuario y su primitiva de "revelar la ubicación"), no un foso tecnológico.** La ventana existe y es real —Polarsteps mira hacia nostalgia y planificación, no hacia el juego— pero es una ventana de **tiempo y foco**, no una fortaleza inexpugnable. La estrategia defendible para Momentu es tratar el reto como **identidad central** (no como feature) y construir rápido el efecto de red del círculo que juega, asumiendo que la mecánica en sí es replicable por un grande si Momentu prueba que el mercado la quiere. Apostar a que "nadie puede copiar el reto" sería un error; apostar a "llegamos antes, lo somos, y lo enredamos en la comunidad" es la lectura correcta.

---

## 5. Síntesis para el diagnóstico

1. **El competidor real de Momentu no es otra app de viaje: es el hábito ya instalado (WhatsApp) + la inercia de no compartir.** WhatsApp (91% penetración ES) tiene al grupo cautivo con cero fricción; y ~36% ni siquiera viaja. La batalla de adopción es "vs. no hacer nada" y "vs. la foto que ya va al grupo", no "vs. Polarsteps".
2. **El diferenciador (reto sobre ubicación real del círculo) ocupa un cuadrante vacío y validado por partes** — pero es copiable por un grande. Su defensa es foco + timing + comunidad, no tecnología.
3. **El patrón macro (BeReal se desinfla / Locket y Polarsteps resisten) dicta el diseño del reto:** utilidad recurrente de círculo cercano, no gancho viral de un día.
4. **Aviso de monetización:** el freemium con monetización lateral de Polarsteps (libros, afiliación) es más seguro que el paywall del bucle core de GeoGuessr, que le costó backlash y clones. Si Momentu monetiza, que no rompa la experiencia social gratuita base.
5. **Tensión de segmento no resuelta:** Polarsteps (45–54, mixto) y GeoGuessr (18–24, masculino) tienen perfiles opuestos. Momentu asume que ambos conviven; no hay evidencia de ello — a validar en user research.

---

## 6. Hipótesis emergentes para validar en user research

- ¿Con qué frecuencia un grupo de amigos concreto genera un viaje "jugable"? (recurrencia real del evento, dado el 8–20% de viaje con amigos y la estacionalidad jul–sep).
- ¿El comportamiento de "adivinar a ojo en el grupo de WhatsApp" es un patrón extendido o una anécdota del grupo origen del proyecto? (hoy es hipótesis sin fuente pública).
- ¿Conviven el perfil "documentador" (diario) y el perfil "jugador" (reto) en la misma persona / mismo grupo, o hay que priorizar uno?
- ¿El reto es gancho de adquisición o retención? (¿la gente viene por el juego o se queda por él?).
- ¿Cuánto pesa el dolor "mis fotos de viaje se quedan en el carrete y no las comparte nadie" frente a la comodidad de no hacer nada?
