# Apps y sustitutos

> Herramientas que la gente **ya usa hoy** para compartir momentos de viaje con su círculo cercano, aunque no sean diarios de viaje dedicados. Fichas breves (no deep dive completo) — ver `README.md` de esta carpeta para el criterio de cuándo va aquí vs. en `deep-dives/`.

---

## 1. WhatsApp (grupos + estados)

**Qué es.** App de mensajería instantánea de Meta. El "grupo de viaje" de WhatsApp es, hoy, el contenedor por defecto donde una cuadrilla comparte fotos, planes y comentarios durante y después de un viaje; los "Estados" (stories efímeras de 24h) son su variante broadcast.

**Escala.** WhatsApp superó los **3.000 millones de usuarios activos mensuales globales en mayo de 2025** [[Fuente: TechCrunch — WhatsApp crosses 3 billion](https://techcrunch.com/2025/05/01/whatsapp-now-has-more-than-3-billion-users/)]. En España tiene una penetración del **91% entre los internautas**, lo que la convierte de facto en la plataforma de comunicación más usada del país, por delante de cualquier red social [[Fuente: DataReportal — Digital 2025: Spain](https://datareportal.com/reports/digital-2025-spain)]. No hay cifra oficial de Meta sobre "número de grupos de viaje" ni sobre volumen de fotos compartidas en grupos — es infraestructura de mensajería, no un producto de contenido con esas métricas públicas (pendiente de fuente).

**Qué resuelve hoy.** Es donde el grupo *ya está* — no hay fricción de adopción porque todo el mundo lo tiene abierto todo el día. Compartir una foto de viaje al grupo es gratis, instantáneo y no requiere descargar nada nuevo. Es, literalmente, el origen del caso de uso de Momentu: un grupo de viaje real en WhatsApp ya "juega a esto a ojo" — alguien manda una foto o ubicación y los demás adivinan dónde está, de forma completamente informal, sin ningún soporte de producto (hipótesis de origen del proyecto, a validar con user research — no hay fuente pública que documente este comportamiento como patrón extendido).

**Qué le falta frente a Momentu.**
- **Sin mapa.** Las fotos se comparten como mensajes sueltos; no hay una vista geográfica del viaje.
- **Sin timeline de viaje.** El chat mezcla fotos de viaje con todo lo demás que el grupo habla; no hay un contenedor "este es el viaje X con sus momentos en orden".
- **Sin permanencia estructurada.** El contenido existe, pero se pierde en el scroll del chat; recuperarlo semanas después significa buscar a mano.
- **Sin mecánica de juego formalizada.** El "adivina dónde estoy" ocurre a ojo, sin puntuación, sin ranking, sin cierre — depende de que alguien del grupo lo inicie manualmente cada vez.
- **Los Estados son efímeros (24h)** y no dejan rastro navegable del viaje.

**Por qué un usuario lo elegiría en su lugar (o no).** Lo elegiría porque ya está ahí, sin instalar nada, y el grupo de amigos ya vive en ese chat — la barrera de cambio es real. No lo elegiría (o lo complementaría con Momentu) si valora tener el viaje "guardado" de forma navegable y no perdido en un scroll infinito, o si quiere que el reto de adivinar tenga puntuación y cierre en vez de ser una ocurrencia puntual.

---

## 2. Instagram / Close Friends (stories)

**Qué es.** Red social de Meta; las Stories son publicaciones efímeras (desaparecen a las 24h) y "Close Friends" (Mejores Amigos) es una lista restringida para compartir solo con un círculo elegido.

**Escala y uso.** Instagram Stories alcanzó **500 millones de usuarios activos diarios en enero de 2019**, cifra anunciada por Facebook en su earnings call y que Meta no ha vuelto a actualizar públicamente desde entonces [[Fuente: TechCrunch — Instagram Stories hits 500M users/day](https://techcrunch.com/2019/01/30/instagram-stories-500-million/)]. Que sea el último dato oficial disponible siete años después es en sí mismo revelador: Meta ya no destaca esta métrica como bandera de crecimiento. En España, Instagram tiene **más de 27 millones de usuarios, ~56% de la población** [[Fuente: DataReportal — Digital 2025: Spain](https://datareportal.com/reports/digital-2025-spain)].

**Close Friends: adopción no publicada.** Meta **nunca ha publicado cifras oficiales de adopción de Close Friends** (ni número de usuarios que lo usan, ni tamaño medio de lista). La búsqueda dirigida no encontró ningún dato verificable adicional a lo ya señalado en el estudio de mercado — sigue siendo **pendiente de fuente**, y todo lo que circula son estimaciones de estudios de marketing sin metodología transparente (p. ej. cifras de "efectividad" en papers de comunicación con muestras pequeñas, no representativas de uso global).

**Qué resuelve hoy.** Alcance masivo y formato ya integrado en el hábito diario de cientos de millones de personas; Close Friends baja la barrera social de "no quiero que lo vea todo el mundo", acercándose a la lógica de círculo cercano que persigue Momentu.

**Qué le falta frente a Momentu.**
- **Efímero por diseño.** A las 24h desaparece (salvo que el usuario lo archive activamente en Highlights, un paso extra que la mayoría no da) — no hay diario de viaje permanente.
- **Sin mapa ni estructura de viaje.** Una story es una foto suelta con texto/stickers encima, no un momento geolocalizado dentro de un itinerario.
- **Sin juego.** No existe ninguna mecánica de "adivina dónde estoy" nativa; en el mejor de los casos la gente lo simula con un sticker de pregunta, sin puntuación ni cierre.

**Por qué un usuario lo elegiría en su lugar (o no).** Lo elegiría para el momento suelto, espontáneo, de "esto está pasando ahora" — el formato gana cuando el objetivo es visibilidad inmediata dentro de la red social donde ya está el círculo amplio. No lo elegiría si quiere que el viaje quede guardado y navegable después, porque el formato está diseñado para desaparecer.

---

## 3. Álbumes compartidos (Google Photos / Apple Fotos compartidos)

**Qué es.** Funcionalidad dentro de las apps de fotos nativas (Google Photos desde diciembre de 2015; Apple con "Álbumes compartidos" / iCloud Shared Albums) que permite crear un álbum al que varias personas suben fotos y vídeos de un evento o viaje común [[Fuente: Google Photos Help — shared albums](https://support.google.com/photos/answer/9789702?hl=en-419)].

**Escala.** No hay cifras públicas de adopción específicas de la función "álbum compartido" (ni de Google ni de Apple) — solo se conoce que Google Photos superó **200 millones de usuarios activos mensuales en su primer año (2016)**, una cifra ya desactualizada y referida al producto completo, no a la función de compartir [[Fuente: Google Blog — Google Photos: one year, 200 million users](https://blog.google/products/photos/google-photos-one-year-200-million/)]. Adopción específica de la función: **pendiente de fuente** — ni Google ni Apple publican qué porcentaje de usuarios crea o participa en álbumes compartidos.

**Qué resuelve hoy.** Es el sitio donde varias personas de un mismo viaje agregan pasivamente todas sus fotos en un único contenedor, sin duplicar el envío por chat y sin perder calidad/resolución (a diferencia de WhatsApp, que comprime agresivamente). Útil como "cajón común" después del viaje.

**Qué le falta frente a Momentu.**
- **Es un contenedor pasivo, no una narrativa.** No hay timeline ni mapa: es una parrilla de miniaturas sin orden de "momentos del viaje".
- **Sin mecánica social activa.** Nadie "juega" con un álbum compartido ni interactúa más allá de subir fotos y, como mucho, dar un "me gusta" o comentario suelto.
- **Fricción de configuración.** Requiere que todos tengan cuenta del mismo ecosistema (Google o Apple) y que alguien cree y comparta el álbum activamente — no ocurre por defecto como sí ocurre al mandar una foto a un chat.

**Por qué un usuario lo elegiría en su lugar (o no).** Lo elegiría cuando el objetivo es puramente archivístico — "que no se pierda ninguna foto del viaje, en calidad completa" — sin ninguna pretensión de contar una historia o jugar con ella. No lo elegiría si busca revivir el viaje como relato (orden, lugares, momentos) o generar interacción activa alrededor de él, porque el álbum no ofrece ninguna de las dos cosas.

---

## 4. BeReal y Locket (círculo cercano)

**Qué son.** Dos apps de "foto directa al círculo cercano" con estrategias opuestas: BeReal notifica una vez al día para que todos publiquen una foto simultánea sin filtros; Locket manda la foto directamente al widget de pantalla de inicio de tus amigos, sin necesidad de abrir la app.

**Datos verificados (ya recogidos en el estudio de mercado, reutilizados aquí sin re-investigar):**
- **BeReal:** pico de **73,5 M usuarios activos mensuales (agosto 2022)** → declive a un rango de **~16–40 M MAU en 2025** (cifras inconsistentes entre fuentes); descargas **−60% interanual en 2024**; **adquirida por Voodoo en junio de 2024 por ~537 M USD**, monetizando con publicidad desde 2025 [[Fuente: Wikipedia — BeReal](https://en.wikipedia.org/wiki/BeReal)] [[Fuente: Business of Apps — BeReal statistics](https://www.businessofapps.com/data/bereal-statistics/)].
- **Locket:** **>80 M descargas, >9 M usuarios activos diarios, >10.000 M fotos** enviadas, rentable en 2024 con solo 12,5 M USD levantados, y "ganando fuerza con la Generación Alpha" en 2025 [[Fuente: TechCrunch — Locket (ago-2025)](https://techcrunch.com/2025/08/06/photo-sharing-app-locket-is-banking-on-a-new-celebrity-focused-feature-to-fuel-its-growth/)] [[Fuente: TechCrunch — Locket Gen Alpha (nov-2025)](https://techcrunch.com/2025/11/03/lockets-social-app-is-picking-up-steam-with-gen-alpha/)].

**Patrón:** el modelo "boom viral efímero" (BeReal) se desinfla; el modelo "utilidad recurrente de círculo cercano" (Locket) es resiliente.

**Qué resuelven hoy.** Ambas bajan al mínimo la fricción de compartir un instante con el círculo cercano — una foto, sin editar, directa a la gente que importa. Locket en particular elimina incluso el paso de "abrir la app": la foto aparece sola en el widget de un amigo.

**Qué les falta frente a Momentu.**
- **Foto única / momento suelto**, no una colección estructurada de momentos de un mismo viaje.
- **Sin estructura de "viaje"**: no hay timeline, no hay mapa, no hay forma de agrupar varias fotos bajo un mismo evento/trip.
- **Sin mecánica de juego**: ninguna de las dos ofrece nada parecido a adivinar dónde está la otra persona; son puramente "aquí estoy, esto veo ahora".

**Por qué un usuario lo elegiría en su lugar (o no).** Locket, en concreto, se elegiría por su fricción mínima absoluta (ni hay que abrir la app) para el contacto diario constante con el círculo cercano — es un sustituto fuerte del "por defecto" cuando lo que se busca es presencia, no narrativa. No se elegiría (ni Locket ni BeReal) cuando el objetivo es que un viaje concreto quede documentado como conjunto — ninguna de las dos piensa en "viaje" como unidad, solo en "momento".

---

## 5. La inercia / "no hacer nada"

**Qué es.** No es una app: es el comportamiento por defecto de no compartir activamente los momentos de un viaje, o de compartirlos solo de boca a boca sin ningún soporte digital estructurado. Tal como pide el README de esta carpeta, se trata explícitamente como el competidor más fuerte, no como un descarte.

**Por qué es la barrera de fricción más grande.** El usuario no necesita instalar nada, aprender nada ni cambiar ningún hábito para no compartir — es el estado de reposo. Dos datos ya verificados en el estudio de mercado lo sostienen:

- En España, **~36% de la población no hace ningún viaje con pernoctación al año** (tasa de participación turística del 64% en 2024) — para ese tercio de la población, el problema de "compartir momentos de viaje" ni siquiera se plantea porque no hay viaje que compartir [[Fuente: Eurostat — Participation in tourism](https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Tourism_statistics_-_participation_in_tourism)].
- Del **64% que sí viaja**, el viaje "en grupo de amigos" (el segmento nuclear de Momentu) es **minoritario (8–20%)** frente a viajar en pareja o familia [[Fuente: Hosteltur/ViajerosPiratas](https://www.hosteltur.com/comunidad/nota/022354_los-espanoles-prefieren-viajar-con-pareja-o-amigos-antes-que-con-su-familia.html)].

**Y dentro de quienes sí viajan y sí tienen con quién compartir, compartir activamente muchas veces "no ocurre".** Las fotos se quedan en el carrete del móvil sin llegar a ningún sitio — ni a un chat, ni a una story, ni a un álbum. Esto es una hipótesis a validar en user research (no hay una fuente que cuantifique "% de fotos de viaje que nunca se comparten"), pero es coherente con el patrón de estacionalidad y baja recurrencia del viaje social ya documentado: si el viaje en grupo ocurre pocas veces al año y de forma concentrada en temporada alta, el hábito de "compartir el viaje" nunca llega a automatizarse — cada vez es la primera vez, y la fricción de "¿dónde lo subo? ¿en qué chat? ¿en qué álbum?" empuja a la inacción.

**Qué le falta a Momentu para vencer la inercia (marco, no dato):** ninguna feature compite con "no hacer nada" por comparación directa — se compite bajando la fricción de la primera vez a casi cero y dando una razón para volver (el reto, el recuerdo) que ni WhatsApp ni el carrete del móvil dan.

---

## Conclusión agregada

Ninguno de los cinco sustitutos es un competidor directo — ninguno ofrece diario de viaje + mapa + juego de adivinar como paquete. Pero juntos revelan tres cosas sobre el "competidor real" de Momentu:

1. **El competidor real no es una app de viaje, es el hábito de comunicación ya instalado.** WhatsApp (91% de penetración en España, el chat de grupo donde ya vive la cuadrilla) e Instagram Stories (500 M DAU aunque la cifra lleve siete años sin actualizarse) ganan por defecto porque no piden nada nuevo — ni instalar, ni aprender, ni migrar la conversación. Momentu no compite por atención genérica; compite por sustituir un paso dentro de un flujo que ya existe (la foto que hoy va al grupo de WhatsApp).

2. **El eje "efímero vs. permanente" está mal resuelto en todo el panorama actual.** Instagram Stories y BeReal apuestan por lo efímero (24h o instante); WhatsApp y los álbumes compartidos acumulan contenido pero sin estructura navegable (se pierde en el scroll o en una parrilla sin orden). Nadie combina permanencia **con** narrativa de viaje (timeline + mapa) — ese es precisamente el espacio en blanco que ocupa el "cimiento" de Momentu (documentar).

3. **El patrón "boom viral se desinfla, utilidad recurrente de círculo cercano resiste" (BeReal vs. Locket) es la señal macro más importante para el diferenciador de Momentu.** El reto de adivinar dónde está el amigo no debe diseñarse como gancho viral de un día, sino como mecánica de utilidad recurrente dentro del círculo cercano — igual que Locket gana no por ser una moda sino por bajar la fricción del contacto diario. Y sobre todo: **la inercia (no compartir nada) es más grande que cualquier app individual**, reforzada por datos duros (36% no viaja, y de quien viaja, el grupo de amigos es minoritario y estacional) — la verdadera batalla de adopción de Momentu no es "vs. Instagram" sino "vs. no hacer nada", y se gana solo si el primer uso cuesta casi cero fricción.

---

## Fuentes consultadas

- [TechCrunch — WhatsApp crosses 3 billion users](https://techcrunch.com/2025/05/01/whatsapp-now-has-more-than-3-billion-users/)
- [DataReportal — Digital 2025: Spain](https://datareportal.com/reports/digital-2025-spain)
- [TechCrunch — Instagram Stories hits 500M users/day (2019)](https://techcrunch.com/2019/01/30/instagram-stories-500-million/)
- [Google Photos Help — shared albums](https://support.google.com/photos/answer/9789702?hl=en-419)
- [Google Blog — Google Photos: one year, 200 million users](https://blog.google/products/photos/google-photos-one-year-200-million/)
- [Wikipedia — BeReal](https://en.wikipedia.org/wiki/BeReal)
- [Business of Apps — BeReal statistics](https://www.businessofapps.com/data/bereal-statistics/)
- [TechCrunch — Locket (ago-2025)](https://techcrunch.com/2025/08/06/photo-sharing-app-locket-is-banking-on-a-new-celebrity-focused-feature-to-fuel-its-growth/)
- [TechCrunch — Locket Gen Alpha (nov-2025)](https://techcrunch.com/2025/11/03/lockets-social-app-is-picking-up-steam-with-gen-alpha/)
- [Eurostat — Participation in tourism](https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Tourism_statistics_-_participation_in_tourism)
- [Hosteltur/ViajerosPiratas — españoles prefieren viajar en pareja o amigos](https://www.hosteltur.com/comunidad/nota/022354_los-espanoles-prefieren-viajar-con-pareja-o-amigos-antes-que-con-su-familia.html)
