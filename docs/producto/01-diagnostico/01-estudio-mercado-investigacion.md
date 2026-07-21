# Estudio de mercado — investigación con fuentes (Momentu)

> **Qué es este documento.** Base de datos de investigación con trazabilidad de fuentes para el estudio de mercado de **Momentu** (app de diario de viaje social: documentas tus viajes con fotos/momentos/mapa y los compartes con tu círculo cercano, que además participa jugando a adivinar en el mapa dónde estás — mecánica tipo GeoGuessr). Alimenta la plantilla [`01-estudio-mercado.md`](01-estudio-mercado.md).
>
> **Regla de trazabilidad.** Cada dato cuantitativo o afirmación de hecho lleva fuente inline `[[Fuente: nombre](URL)]`. Lo que no se pudo verificar se marca como *pendiente de fuente* / *no encontrado*, y los cálculos derivados se marcan como *cálculo propio* citando inputs.
>
> **Nota de fiabilidad.** Se prioriza fuente primaria (INE, Eurostat, comunicados de las propias empresas, prensa económica/tech, textos oficiales UE/AEPD). Cuando solo hay agregadores secundarios (Growjo, RocketReach, "stats blogs", consultoras de informes de pago de baja transparencia metodológica) se indica explícitamente y se trata como orden de magnitud.
>
> Investigación cerrada: **julio 2026**.

---

## Resumen ejecutivo (lo que importa)

- **La categoría exacta de Momentu no tiene tamaño de mercado propio publicado.** "Diario de viaje social con mecánica de juego" no es una categoría que ninguna consultora mida. Los proxies más cercanos: *travel planner apps* (~2.500–3.420 M USD en 2024–25) y *travel apps* en general (~11.800–16.230 M USD en 2025–26), ambos con alta dispersión metodológica. Ver §1.
- **Las dos mecánicas tienen validación de mercado por separado.** Polarsteps (diario de viaje social) pasó de 1 M (2019) a 15–18 M+ usuarios (2025–26) y es rentable; GeoGuessr (adivinar en el mapa) factura ~310 M SEK (2024, ~29–30 M USD), es rentable con margen ~44% y fue valorada en ~4.200 M SEK (~400 M USD) en 2025. Nadie ha combinado ambas. Ver §1.
- **El viento macro sopla a favor** del sharing de círculo cercano frente a la red social abierta (fatiga documentada de RRSS tradicionales; Locket/Close Friends resilientes frente al pinchazo de BeReal). Ver §3.
- **DATO CRÍTICO en tensión con la hipótesis del producto (§7).** En España solo ~64% de la población viaja al menos una vez al año con pernoctación (≈36% no viaja nada), el viaje "con amigos" es minoría (8–20% según encuesta, frente a pareja/familia), y ~40% de la actividad turística UE se concentra en jul–sep. La frecuencia de "eventos generadores de contenido en grupo de amigos" puede ser de pocas veces al año y muy estacional → **la recurrencia mensual del producto es una hipótesis frágil que hay que validar con datos primarios.**

---

## 1. Tamaño de mercado (3 mercados adyacentes)

### 1a. Apps de diario / registro de viaje (travel journal / trip planner)

**No existe un informe dedicado al segmento "diario de viaje" (travel journal) aislado del "trip planner" o del "travel app" genérico.** Las cifras disponibles son de categorías más amplias y con metodologías dispares:

- Ingresos globales de *travel apps* superaron los **1.200 M USD en 2023**, habiéndose triplicado en los 5 años previos; EE. UU. representa **>40%** del valor total [[Fuente: Statista — Worldwide revenue of travel apps](https://www.statista.com/forecasts/1309624/worldwide-revenue-of-travel-apps/)].
- Segmento *Travel Planner App* (lo más cercano a planificación/diario): **2.500 M USD (2024) → 5.800 M USD (2033), CAGR ~10,5%** [[Fuente: market.us — Travel Planner App Market](https://market.us/report/travel-planner-app-market/)]; otra consultora: **3.420 M USD (2025) → 10.000 M USD (2035), CAGR 11,3%** [[Fuente: WiseGuyReports — Travel Planner App Market](https://www.wiseguyreports.com/reports/travel-planner-app-market)].
- Categoría amplia *Travel Application* (todo tipo de apps de viaje): cifras muy dispares — **11.800 M USD (2025) → 62.400 M USD (2034), CAGR 19,7%** [[Fuente: Business Research Insights — Travel Application Market](https://www.businessresearchinsights.com/market-reports/travel-application-market-116262)]; **16.230 M USD (2026) → 63.870 M USD (2035)** [[Fuente: Dataintelo — Global Travel Application Market](https://dataintelo.com/report/global-travel-application-market)]. *Alta dispersión entre informes de pago de baja transparencia; usar como orden de magnitud.*
- Proxy de la funcionalidad "diario" pura (journaling genérico, no viaje): mercado de *journal apps* **94.000 M USD (2024) → 154.000 M USD (2032), CAGR 6,4%** [[Fuente: Verified Market Research — Journal App Market](https://www.verifiedmarketresearch.com/product/journal-app-market/)]. Solo como límite inferior de crecimiento de la mecánica "documentar momentos".
- **Europa / España:** no encontrado un desglose fiable de tamaño de mercado de travel journal apps. Contexto de adopción en España: el **19,6%** de usuarios españoles de smartphone usan apps de viajes, con +40% interanual de uso; Booking lidera (13,3 M usuarios, 39,7% cuota) y Airbnb 2ª (13,7%) [[Fuente: Hosteltur — Ranking de apps de viajes más usadas en España (Smartme Analytics)](https://www.hosteltur.com/131315_ranking-de-apps-de-viajes-mas-usadas-en-espana-quien-sube-y-quien-baja.html)]. Es sobre el conjunto "apps de viaje" (booking incluido), no señal directa de diario.

> **Conclusión 1a.** El segmento específico "travel journal app" no tiene tamaño propio publicado. Solo existe como sub-segmento difuso dentro de *travel planner app* (2,5–3,4 mil M USD) o *travel app* (11,8–16,2 mil M USD). Cualquier cifra en el informe final debe llevar el matiz de incertidumbre metodológica.

### 1b. Polarsteps — competidor directo más cercano

**Usuarios (hitos, fuente oficial Polarsteps o prensa tech):**

| Fecha | Usuarios | Fuente |
|---|---|---|
| Ene 2019 | 1.000.000 | [[Polarsteps News](https://news.polarsteps.com/news/polarsteps-hits-1-million-users-and-raises-3-million-in-funding)] |
| Jun 2022 | 4.000.000 | [[Silicon Canals](https://siliconcanals.com/polarsteps-reached-4m-users/)] |
| Dic 2022 | 5.000.000 | [[Polarsteps News](https://news.polarsteps.com/news/huge-surge-in-travel-to-southeast-asia-and-australia-helps-polarsteps-reach-5-million-user-milestone)] |
| Jun 2024 | ~10.000.000 | [[Startuprad.io](https://www.startuprad.io/post/polarsteps-growth-privacy-first-travel-app-at-18m-users-startuprad-io)] |
| Jul 2025 | 15.000.000 | [[Polarsteps News](https://news.polarsteps.com/news/polarsteps-hits-15-million-users-as-travelers-embrace-authentic-storytelling)] |
| ~Abr 2026 | 18.000.000+ | [[Startuprad.io](https://www.startuprad.io/post/polarsteps-growth-privacy-first-travel-app-at-18m-users-startuprad-io)] |

- Objetivo declarado de la CEO Clare Jones: primer hito de **100 M de usuarios activos mensuales** (aspiración a futuro, no cifra actual) [[Fuente: Substack — entrevista Clare Jones](https://infounderswords.substack.com/p/the-viral-growth-playbook-how-to)].
- Penetración: casi **1/3 de la población de Países Bajos (5,5 M personas)** tiene cuenta; Francia fue el mercado de mayor crecimiento con **+290% interanual** y llegó a app de viaje #1 [[Fuente: Startuprad.io](https://www.startuprad.io/post/polarsteps-growth-privacy-first-travel-app-at-18m-users-startuprad-io)].
- **Descargas:** Google Play **11 M descargas totales**, ~9.100/día [[Fuente: AppBrain — Polarsteps](https://www.appbrain.com/app/polarsteps/com.polarsteps)]; ~200k/mes en EE. UU. (nov. 2024) [[Fuente: Sensor Tower — Polarsteps](https://app.sensortower.com/overview/com.polarsteps?country=US)].
- **Dato de oro para Momentu:** los usuarios comparten sus viajes con una media de **~5 amigos/familiares** — valida el modelo de círculo cercano [[Fuente: Substack — Clare Jones](https://infounderswords.substack.com/p/the-viral-growth-playbook-how-to)].
- **Financiación:** ~5,05–5,25 M USD acumulados (Seed 2014 €500k; Angel 2017 €900k; Series A ene-2019 liderada por INKEF Capital); **sin rondas nuevas desde 2019**, rentable y financiada por caja propia [[Fuente: EU-Startups — Series A 2019](https://www.eu-startups.com/2019/01/amsterdam-based-travel-tech-startup-polarsteps-raises-e3-million-and-reaches-one-million-users/)] [[Fuente: Tracxn — Polarsteps funding](https://tracxn.com/d/companies/polarsteps/__Q-i1_EyIFQ7H8ztDGL5LpHMOoZvC18hrwpY-xIskvKg/funding-and-investors)].
- **Modelo de negocio (confirmado por la empresa):** app gratuita sin suscripción; monetiza con (1) libros de viaje físicos impresos bajo demanda y (2) comisiones de afiliación (Booking, Airbnb, Hostelworld). Rechazan publicidad y venta de datos [[Fuente: Substack — Clare Jones](https://infounderswords.substack.com/p/the-viral-growth-playbook-how-to)] [[Fuente: Peecho — Polarsteps case study](https://www.peecho.com/case-studies/polarsteps)].
- **Ingresos:** *no publicados por la empresa.* Estimaciones de terceros muy dispares y de baja fiabilidad (1–2 M USD Similarweb, 5,9 M USD RocketReach, 24,8 M USD Growjo) [[Fuente: Growjo — Polarsteps](https://growjo.com/company/Polarsteps.com)] — **no usar como dato duro.**

### 1c. GeoGuessr — proxy del apetito por la mecánica de adivinar en el mapa

**Usuarios:**

| Momento | Cifra | Fuente |
|---|---|---|
| 2019 | 10 millones | [[The Publish Press](https://news.thepublishpress.com/p/creators-put-geoguessr-map)] |
| Jul 2022 | 40 millones de cuentas | [[Wikipedia — GeoGuessr](https://en.wikipedia.org/wiki/GeoGuessr)] |
| Abr 2025 | >85 millones registrados | [[Mainsights — Orkila Capital stake](https://www.mainsights.io/ma-news/us-private-equity-firm-orkila-capital-acquires-minority-stake-in-swedish-game-app-geoguessr)] |
| 2026 | "100 millones de jugadores" (reclamo propio) | [[geoguessr.com](https://www.geoguessr.com/)] / [[TV4](https://www.tv4.se/artikel/1DzVZwov07dSCK7er5y1Sb/svenskbolaget-bakom-globalt-fenomen-sa-manga-som-moejligt-ska-se)] |

- **Ingresos:** 2019 <500k USD → **200 M SEK** (ejercicio previo a 2024, ~19 M USD) → **310,9 M SEK (2024, ~29–30 M USD)** con beneficio antes de impuestos de 137,9 M SEK (margen ~44%) [[Fuente: Breakit — "Geoguessr omsätter 200 miljoner"](https://www.breakit.se/artikel/36529/geoguessr-omsatter-200-miljoner-och-har-fatt-in-sebastian-knutsson-som-agare-men-de-har-bara-borjat)] [[Fuente: Mainsights](https://www.mainsights.io/ma-news/us-private-equity-firm-orkila-capital-acquires-minority-stake-in-swedish-game-app-geoguessr)]. Declaración 2026: ventas acercándose a **450 M SEK (~43 M USD)** [[Fuente: TV4](https://www.tv4.se/artikel/1DzVZwov07dSCK7er5y1Sb/svenskbolaget-bakom-globalt-fenomen-sa-manga-som-moejligt-ska-se)].
- **Modelo:** la mayoría de ingresos por suscripción (Pro desde 2019); el **1-feb-2024 eliminó el nivel gratuito** (Pro-only). Precios tras subida ene-2026: Pro Unlimited **3,99 USD/mes (47,88/año)**, mensual suelto **6,99 USD/mes** [[Fuente: GeoGuessr Support — Price Changes 2026](https://www.geoguessr.support/support/solutions/articles/206000067275-price-changes-2026)] [[Fuente: The Gamer — The Fall of GeoGuessr](https://www.thegamer.com/geoguessr-fall/)].
- **Financiación/valoración:** bootstrapped 2013–2025; **abr-2025 Orkila Capital** compró un **9% minoritario** valorando la empresa en **~4.200 M SEK (~400 M USD), 13,5× EV/Ventas 2024** [[Fuente: Mainsights](https://www.mainsights.io/ma-news/us-private-equity-firm-orkila-capital-acquires-minority-stake-in-swedish-game-app-geoguessr)] [[Fuente: Breakit — "värderas till 4 miljarder"](https://www.breakit.se/artikel/42953/ny-storagare-kliver-in-i-svenska-spelsuccen-geoguessr-varderas-till-4-miljarder)].
- **Viralidad / esports:** crecimiento impulsado por creadores (Trevor Rainbolt en TikTok, GeoWizard en YouTube, Ludwig, Sidemen); *GeoGuessr World Championship* desde 2023 — edición 2025 con prize pool de **100.000 USD**, pico de **363.368 espectadores** y **1,67 M horas vistas** [[Fuente: Esports.net — World Cup 2025](https://www.esports.net/news/geoguessr-world-cup-2025-shatters-viewership-and-prize-pool-records/)] [[Fuente: Esports Charts — GeoGuessr WC 2025](https://escharts.com/tournaments/geoguessr/geoguessr-world-cup-2025)].
- **Señal de riesgo (2025):** el paso a Pro-only y la subida de precios generaron backlash de comunidad y reseñas "overwhelmingly negative" en Steam; impulsó clones gratuitos (**OpenGuessr, WorldGuessr**) [[Fuente: The Gamer](https://www.thegamer.com/geoguessr-fall/)] [[Fuente: Maponica — GeoGuessr alternatives](https://maponica.com/blog/best-geoguessr-alternatives)]. *Lectura para Momentu: hay demanda insatisfecha de una versión gratuita/social de la mecánica.*

### 1c-bis. Contexto: social photo sharing y travel tech

- Mercado global de *photo sharing* (genérico): **~5.300 M USD (2026) → 9.030 M USD (2036), CAGR 5,5%** — mercado maduro, crecimiento moderado [[Fuente: Future Market Insights — Photo Sharing Market](https://www.futuremarketinsights.com/reports/photo-sharing-market)].
- *Social networking apps* (categoría muy amplia, solo escala de referencia): **49.090 M USD (2022) → 310.370 M USD (2030)** [[Fuente: Grand View Research — Social Networking App Market](https://www.grandviewresearch.com/industry-analysis/social-networking-app-market-report)].
- Descargas/uso de travel apps (Sensor Tower, ene–sep 2024): descargas **+4,4% interanual**, ingresos **+19,5% interanual**; Europa y EE. UU. = 40% y 38% del ingreso global [[Fuente: Sensor Tower — 2024 Travel Apps Market Insights](https://sensortower.com/blog/2024-travel-apps-and-brands-market-insights-report)].
- Competidores adyacentes de travel journal/planner: **Wanderlog** >1,5 M usuarios mensuales, ~10 M viajes/año, seed 1,5 M USD (General Catalyst, Abstract Ventures) [[Fuente: PhocusWire — Wanderlog seed](https://www.phocuswire.com/Wanderlog-1-5M-seed-funding)]; **Journi** (Viena) seed €400k [[Fuente: TechCrunch — Journi](https://techcrunch.com/2016/08/23/journi/)].

---

## 2. Crecimiento y proyecciones

**No existe CAGR para "travel journal / social travel diary app" como categoría aislada.** Se recogen las categorías paraguas más cercanas.

| Fuente | Categoría | Base | Proyección | CAGR | Periodo |
|---|---|---|---|---|---|
| market.us | Travel & Tourism Apps | 8,7 mil M USD (2024) | 25,6 mil M USD (2034) | **11,5%** | 2024–2034 [[Fuente](https://market.us/report/travel-and-tourism-apps-market/)] |
| market.us | Travel Planner App | — | — | **11,9%** | ~2023–2032 [[Fuente](https://market.us/report/travel-planner-app-market/)] |
| ForInsights | Travel App Platforms | 134,4 mil M USD (2023) | 242,4 mil M USD (2030) | **9,2%** | 2024–2030 [[Fuente](https://www.forinsightsconsultancy.com/reports/travel-app-platforms-market)] |
| Verified Market Reports | Travel App | 12,5 mil M USD (2024) | 28,7 mil M USD (2033) | **10,1%** | 2026–2033 [[Fuente](https://www.verifiedmarketreports.com/product/travel-app-market/)] |
| Dataintelo | Travel Application | 16,23 mil M USD (2026) | 63,87 mil M USD (2035) | **15,6%** | 2025–2035 [[Fuente](https://dataintelo.com/report/global-travel-application-market)] |
| Statista (resumen público) | Travel Apps | — | — | **11,32%** | 2022–2027 [[Fuente](https://www.statista.com/topics/10685/mobile-travel-trends/)] |

- **Lectura:** la categoría "travel apps" (amplia) crece a **10–15,6%**; cuando se define como "online travel/OTA" (reservas) converge en **6–10%** (Grand View 9,0%, IMARC 9,75%, Mordor 6,29%, Fortune BI 7,91%) [[Fuente: Grand View Research — Online Travel Booking Service](https://www.grandviewresearch.com/press-release/global-online-travel-booking-service-market)] [[Fuente: Mordor Intelligence — OTA Market](https://www.mordorintelligence.com/industry-reports/online-travel-agency-market)]. El "app de viaje" en sentido amplio crece más rápido que las reservas puras.
- **Europa (online travel):** **103,78 mil M USD (2025) → 171,26 mil M USD (2031), CAGR 8,71%** [[Fuente: Mordor Intelligence — Online Travel Market in Europe](https://www.mordorintelligence.com/industry-reports/online-travel-market-in-europe)]; el canal móvil crece por encima de la media (CAGR 9,9%) [[Fuente: Grand View Research](https://www.grandviewresearch.com/press-release/global-online-travel-booking-service-market)].
- **España:** *no encontrado* un CAGR específico de travel apps para España (la segmentación de estos informes suele parar en "Europa"/"EMEA").

---

## 3. Tendencias macro (últimos 2–3 años)

### 3.1. Compartir viajes en redes sociales
- **72–76% de los viajeros publican fotos de vacaciones** en RRSS; **60% publica durante el viaje** [[Fuente: Statista — Social media use in travel and tourism](https://www.statista.com/topics/13406/social-media-use-in-travel-and-tourism/)]. Entre Millennials, **97%** comparte durante el propio viaje [[Fuente: Passport Photo Online — 55+ statistics](https://passport-photo.online/blog/social-media-vs-travel/)].
- **83%** usa RRSS para inspirarse en el destino; **48%** elige destino por cómo quedará en fotos ("instagrammability") [[Fuente: Passport Photo Online](https://passport-photo.online/blog/social-media-vs-travel/)].

### 3.2. Fatiga de redes sociales tradicionales
- **32% de usuarios reporta "fatiga de redes sociales"** [[Fuente: Frontiers in Psychology (2024) — Social media fatigue](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2024.1277846/full)].
- Adolescentes EE. UU.: **48% dice que las RRSS tienen efecto mayormente negativo** (vs. 32% en 2022); solo **11%** las ve positivas (vs. 24% en 2022) [[Fuente: Pew Research — 10 facts about teens and social media (2025)](https://www.pewresearch.org/short-reads/2025/07/10/10-facts-about-teens-and-social-media/)].
- La percepción de "red de apoyo emocional" vía RRSS cayó del **67% (2022) al 52% (2024)** [[Fuente: Pew Research](https://www.pewresearch.org/short-reads/2025/07/10/10-facts-about-teens-and-social-media/)].
- *Matiz:* el uso agregado sigue creciendo (Instagram 40%→50% de adultos EE. UU. 2021–2025) — coexiste más uso con más negatividad percibida [[Fuente: Pew Research — Americans' Social Media Use 2025](https://www.pewresearch.org/internet/2025/11/20/americans-social-media-use-2025/)].

### 3.3. Auge del círculo cercano / micro-social privado
- **BeReal:** pico de **73,5 M MAU (ago-2022)** → declive a ~16–40 M MAU en 2025 (cifras inconsistentes entre fuentes); descargas −60% interanual en 2024; **adquirida por Voodoo en jun-2024 por ~537 M USD** y monetizando con publicidad desde 2025 → el crecimiento viral se agotó [[Fuente: Wikipedia — BeReal](https://en.wikipedia.org/wiki/BeReal)] [[Fuente: Business of Apps — BeReal statistics](https://www.businessofapps.com/data/bereal-statistics/)].
- **Locket** (foto directa al widget de amigos): trayectoria opuesta — **>80 M descargas, >9 M usuarios activos diarios, >10.000 M fotos**, rentable en 2024 con solo 12,5 M USD levantados; "ganando fuerza con la Generación Alpha" (2025) [[Fuente: TechCrunch — Locket (ago-2025)](https://techcrunch.com/2025/08/06/photo-sharing-app-locket-is-banking-on-a-new-celebrity-focused-feature-to-fuel-its-growth/)] [[Fuente: TechCrunch — Locket Gen Alpha (nov-2025)](https://techcrunch.com/2025/11/03/lockets-social-app-is-picking-up-steam-with-gen-alpha/)].
- **Poparazzi** (caso de fracaso): 5 M+ instalaciones, 15 M USD Serie A, **cerró en may-2023** por falta de retención [[Fuente: TechCrunch — Poparazzi shutdown](https://techcrunch.com/2023/05/01/once-hot-photo-sharing-social-app-poparazzi-is-shutting-down/)].
- **"Close Friends" de Instagram:** adopción oficial *no publicada por Meta* — **pendiente de fuente**.
- *(Baja confianza)* Cifra GWI "68% de Gen Z prefiere compartir contenido auténtico vía close friends/privado" circula en blogs pero **no verificada en el informe primario** (paywall) [[Fuente primaria: GWI — 2025 Social Media Report](https://www.gwi.com/reports/social-media-trends)].

> **Patrón relevante para Momentu:** el modelo "boom viral efímero" (BeReal, Poparazzi) explota y se desinfla; el modelo "utilidad recurrente de círculo cercano" (Locket, Close Friends) es resiliente. Argumento a favor de anclar Momentu en utilidad recurrente, no en un gancho viral.

### 3.4. IA abaratando el desarrollo
- McKinsey: con IA generativa, tareas de codificación **hasta 2× más rápidas**; GitHub Copilot **~55% más rápido** [[Fuente: McKinsey — Unleashing developer productivity with generative AI](https://www.mckinsey.com/capabilities/tech-and-ai/our-insights/unleashing-developer-productivity-with-generative-ai)].
- **Contrapunto verificable:** un RCT de METR (2025) encontró que devs experimentados tardaron **19% más** con IA en tareas reales pese a percibir lo contrario [[Fuente: referencia a METR 2025 RCT — verificar en metr.org antes de citar como dato duro](https://sderosiaux.medium.com/the-90-cost-reduction-myth-in-ai-assisted-development-14d11c89f8d8)].

> No hay una cifra única y autorizada de "cuánto más barato es lanzar una app hoy con IA". Consenso direccional (20–55% más rápido en tareas de código), pero la ganancia no es automática.

---

## 4. Segmentación

### Por tipo de viajero
- *Solo travel*: 1.078 M USD en 2025 (38,5% del "traveler matching market"); Millennials+Gen Z el subsegmento mayor (43,2%), mujeres solas 54,6% [[Fuente: Grand View Research — Solo Travel Market](https://www.grandviewresearch.com/industry-analysis/solo-travel-market-report)].
- *Group travel* (paraguas familia+amigos+multigeneracional): **168.700 M USD (2024), CAGR 7,2%** [[Fuente: MarketResearchFuture vía WifiTalents](https://wifitalents.com/group-travel-industry-statistics/)]. El subsegmento "solo amigos" **no se aísla** en los informes.
- *Group travel planning apps* (coordinación colaborativa, lo más cercano en función a Momentu): mercado pequeño, **~245–250 M USD (2025), CAGR ~8–15%** [[Fuente: Market Report Analytics — Group Travel Planning Apps](https://www.marketreportanalytics.com/reports/group-travel-planning-apps-75331)].
- *Backpacker / viajero de negocios*: **no encontrado** con desglose cuantitativo propio.

### Por edad / generación
- **Gen Z ≈ 40% de los viajeros globales**; casi 60% hizo 2+ viajes en 2025; 80% usa el móvil para investigar/reservar [[Fuente: Condor Ferries — Gen Z Travel Statistics (agregador, tratar con cautela)](https://www.condorferries.co.uk/gen-z-travel-statistics)].
- Gen Z + Millennials **>50% de los viajes de ocio en EE. UU. para 2030** (vs. 1/3 en 2023) [[Fuente: Forbes — Gen Z & Millennials impact travel](https://www.forbes.com/sites/jefffromm/2025/09/09/how-gen-z-and-millennials-impact-travel-and-the-experience-economy/)].

### Por caso de uso
- Marco cualitativo (blog especializado, no informe de mercado): 4 perfiles de usuario de travel journal apps — *visual storyteller, reflective writer, social sharer, memory tracker* [[Fuente: Wandrly — Travel Journal Apps 2026](https://www.wandrly.app/blog/travel-journal-apps)]. El "social sharer" (comparte en tiempo real con familia/amigos, álbumes compartidos de grupo) es el perfil nuclear de Momentu.

### Demografía de usuarios — Polarsteps
- Grupo de edad más numeroso (tráfico web): **45–54 años**; género equilibrado **~51% H / 49% M** [[Fuente: Similarweb — polarsteps.com](https://www.similarweb.com/website/polarsteps.com/)]. *Ojo: mide tráfico web, probablemente sesgado a mayor edad que la base real de la app móvil.*
- Países de origen (tráfico): Países Bajos **35%**, Francia **17%**, Bélgica 7%, Alemania 7%, EE. UU. 5% [[Fuente: Similarweb — polarsteps.com](https://www.similarweb.com/website/polarsteps.com/)].

### Demografía de usuarios — GeoGuessr
- Grupo de edad más numeroso: **18–24 años**; sesgo masculino claro **62% H / 38% M** [[Fuente: Similarweb — geoguessr.com](https://www.similarweb.com/website/geoguessr.com/)].
- Perfil gamer/geek confirmado (escena esports, comunidad de streamers, uso educativo en aulas) [[Fuente: Wikipedia — GeoGuessr](https://en.wikipedia.org/wiki/GeoGuessr)]. Geografía (tráfico): EE. UU. 26%, Alemania 6%, Reino Unido 5%, Polonia 5%, Francia 4% [[Fuente: Similarweb — geoguessr.com](https://www.similarweb.com/website/geoguessr.com/)].

> **Nota de perfil:** Polarsteps (diario, 45–54, mixto) y GeoGuessr (juego, 18–24, masculino) tienen perfiles demográficos distintos. Momentu apuesta por combinarlos; **no hay evidencia de que ambos perfiles convivan en un mismo producto** — riesgo de tensión de segmento a validar.

---

## 5. Regulación (RGPD/GDPR + AEPD)

### 5.1. Geolocalización = dato personal
La ubicación geográfica **es dato personal** por definición legal expresa (art. 4.1 RGPD, cita "datos de localización") [[Fuente: RGPD art. 4 (gdpr-info.eu)](https://gdpr-info.eu/art-4-gdpr/)] [[Fuente: EUR-Lex — Reglamento (UE) 2016/679](https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX%3A32016R0679)]. Necesita base legal del art. 6.1; para compartir voluntariamente con el grupo, la base natural es el **consentimiento explícito, específico e informado** (art. 4.11) [[Fuente: AEPD — Infografía consentimiento menores (PDF)](https://www.aepd.es/documento/infografia-consentimiento-menores.pdf)]. El EDPB fija minimización, preferencia por tecnologías menos invasivas y carácter voluntario [[Fuente: EDPB — Guidelines 04/2020 on location data](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-042020-use-location-data-and-contact-tracing_en)].

### 5.2. Fotos con metadatos EXIF/GPS
**No hay documento oficial AEPD/EDPB específico sobre EXIF** (*pendiente de fuente oficial*). Por extensión: si el GPS incrustado identifica ubicación, es dato personal (art. 4.1). La nota técnica oficial de la AEPD sobre apps recomienda limitar permisos a lo estrictamente necesario (p. ej. acceso a la selección de imágenes, no a todo el almacenamiento) e informar la finalidad [[Fuente: AEPD — Nota técnica apps móviles (PDF, 2019)](https://www.aepd.es/sites/default/files/2019-11/nota-tecnica-apps-moviles.pdf)]. Buena práctica de industria: **stripear los EXIF de GPS al compartir** salvo consentimiento explícito [[Fuente: Proton — EXIF data privacy](https://proton.me/blog/exif-data)]. *(Nota interna: la app v0.2 de LocationGuesser ya estripa EXIF en cliente — alineado con esta recomendación.)*

### 5.3. Menores
- RGPD art. 8: edad de referencia **16 años**, con margen a bajar hasta 13 por ley nacional [[Fuente: RGPD art. 8](https://gdpr-info.eu/art-8-gdpr/)].
- **España: 14 años** (LOPDGDD art. 7.1). Por debajo de 14, el consentimiento lo presta el titular de la patria potestad, con "esfuerzos razonables" de verificación [[Fuente: AEPD — FAQ edad de consentimiento de menores](https://www.aepd.es/preguntas-frecuentes/10-menores-y-educacion/FAQ-1001-cual-es-la-edad-para-que-los-menores-puedan-prestar-consentimiento-para-tratar-sus-datos-personales)].
- **Implicación Momentu:** si la usan menores de 14 que comparten ubicación real, el consentimiento del menor **no es válido** → hace falta consentimiento parental verificado, verificación de edad y refuerzo de minimización/privacidad por defecto.

### 5.4. Guías AEPD
- No hay guía monográfica de geolocalización en apps sociales de consumo (las de la AEPD son sobre ámbito laboral). La más aplicable es la **nota técnica de apps móviles (2019)**: política de privacidad accesible en ≤2 clics, información específica por permiso, **consentimiento granular** (la app no puede condicionar su uso a un consentimiento no necesario), plazos de conservación, privacidad por diseño y defecto (art. 25) [[Fuente: AEPD — Nota técnica apps móviles](https://www.aepd.es/sites/default/files/2019-11/nota-tecnica-apps-moviles.pdf)].
- **DPIA/EIPD:** el listado oficial de la AEPD incluye la "geolocalización sistemática y exhaustiva". Si concurren ≥2 criterios (p. ej. geolocalización + menores, o + gran escala), la evaluación de impacto es **obligatoria** (art. 35 RGPD) [[Fuente: AEPD — Listas DPIA (PDF)](https://www.aepd.es/documento/listas-dpia-es-35-4.pdf)].

### 5.5. Obligaciones clave para Momentu (checklist)
1. **Base legal** = consentimiento explícito y **granular** para (a) asociar ubicación real al momento y (b) mostrarla al grupo, separado de analítica/marketing.
2. **Información en capas** clara y específica (arts. 13–14 RGPD): qué se recoge (GPS, fotos, EXIF), finalidad, conservación, con quién se comparte.
3. **Minimización**: precisión mínima necesaria, sin rastreo continuo en segundo plano; gestión/stripe de EXIF.
4. **Privacidad por diseño y por defecto** (art. 25): ubicación no expuesta más allá del grupo cerrado; permisos de fotos acotados.
5. **Derechos**: acceso, rectificación, **supresión** (art. 17, incluye ubicación histórica y fotos), portabilidad, retirar consentimiento "tan fácil como darlo" (art. 7.3).
6. **DPIA** previsiblemente obligatoria (geolocalización + posible gran escala/menores).
7. **Menores**: verificación de edad + consentimiento parental <14 años (España).
8. **Terceros/SDKs**: contrato de encargado si mapas/analítica/ads acceden a ubicación o fotos.
9. **Transferencias internacionales** si el hosting está fuera del EEE.

---

## 6. Señales de demanda digital

> **Limitación metodológica.** Google Trends bloqueó el acceso automatizado (HTTP 429) en todos los intentos; no se hallaron terceros que publiquen las curvas ni volúmenes exactos de estos términos. Lo que sigue son **proxies de demanda** (tráfico web, hitos de usuarios) con su fuente, no volúmenes de búsqueda.

- **"travel journal app" / "trip diary" / "diario de viaje app"**: **no encontrado** — ni Google Trends accesible ni terceros que publiquen volumen/tendencia. Señal indirecta: la categoría se trata como en expansión en listados comparativos anuales de 2026, sin cifra [[Fuente: TripMemo — Best Travel Journal Apps 2026](https://tripmemo.app/best-travel-journal-apps)]. El resumen de Google de búsquedas en España 2025 destaca "trip with friends", "solo travel" y "road trip with friends" en récord, pero no incluye "diario de viaje" [[Fuente: Blog Google — 2025 en búsquedas de Google España](https://blog.google/intl/es-es/productos/2025-en-busquedas-de-google-espana-busca-respuestas-entre-el-apagon-la-ia-consultas-financieras-y-muchas-mas-preguntas/)].
- **"geoguessr"** (proxy de tráfico): **23,1 M visitas/3 meses, +9% MoM** (may-2026), ranking global mejorando [[Fuente: Similarweb — geoguessr.com](https://www.similarweb.com/website/geoguessr.com/)]. Crecimiento estructural de 10 M usuarios (2019) a 65 M+ [[Fuente: Future Party — GeoGuessr](https://www.futureparty.com/p/geoguessr-google-street-view-game)]. Riesgo 2025: backlash por Pro-only/subida de precios [[Fuente: The Gamer](https://www.thegamer.com/geoguessr-fall/)].
- **"polarsteps"** (proxy de demanda muy sólido): hitos de usuarios casi cuadruplicándose en ~3 años (4 M jun-2022 → 15 M 2025); **3,7 M visitas/3 meses, +3,4% MoM** (may-2026) [[Fuente: Polarsteps News — 15 M users](https://news.polarsteps.com/news/polarsteps-hits-15-million-users-as-travelers-embrace-authentic-storytelling)] [[Fuente: Similarweb — polarsteps.com](https://www.similarweb.com/website/polarsteps.com/)].
- **Comparativa relativa:** *no publicada por terceros.* Proxy de escala de uso (no de búsqueda): GeoGuessr mueve ~6–7× más visitas web que Polarsteps [[Fuente: Similarweb — geoguessr.com](https://www.similarweb.com/website/geoguessr.com/)] [[Fuente: Similarweb — polarsteps.com](https://www.similarweb.com/website/polarsteps.com/)].
- **Estacionalidad de los términos:** *no encontrado.*

> **Recomendación:** para cerrar esta brecha, consultar Google Trends manualmente desde navegador autenticado o adquirir acceso puntual a Ahrefs/Semrush para volúmenes mensuales de los 5 términos.

---

## 7. DATO CRÍTICO — frecuencia de viaje (España y Europa)

> Valida (o pone en tensión) la hipótesis de recurrencia del producto: si se viaja poco, la recurrencia mensual es frágil.

### 7.1. Nº medio de viajes/año por persona — España
- Los residentes en España hicieron **184,4 M de viajes con pernoctación en 2024** (−0,8% vs. 2023) [[Fuente: INE — ETR/FAMILITUR T4 2024](https://www.ine.es/dyngs/Prensa/ETR4T24.htm)]. Con población de **48.619.695 hab.** [[Fuente: INE — Censo Anual de Población 2024](https://www.ine.es/dyngs/Prensa/CENSO2024.htm)] → **≈3,8 viajes con pernoctación por persona/año** (*cálculo propio* a partir de ambas cifras INE; no publicado como tal).
- Excursiones sin pernoctación 2024: **≈199,6 M** (más que los viajes con pernoctación) [[Fuente: INE — ETR/FAMILITUR 2024](https://www.ine.es/dyngs/Prensa/ETR4T24.htm)].
- *Matiz:* esos ~3,8 viajes/persona incluyen muchos viajes cortos y domésticos (visitas a familia, fines de semana), no necesariamente "viajes generadores de contenido de diario".

### 7.2. % que viaja al menos una vez / % que no viaja — España
- **Tasa de participación turística España 2024: 64%** hizo ≥1 viaje personal con pernoctación → **≈36% NO hizo ningún viaje con pernoctación** [[Fuente: Eurostat — Participation in tourism](https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Tourism_statistics_-_participation_in_tourism)].
- Indicador relacionado (privación material): **33,4% no pudo permitirse una semana de vacaciones fuera de casa** en 2024 [[Fuente: INE — ECV 2024](https://www.ine.es/dyngs/Prensa/ECV2024.htm)].

### 7.3. Comparación Europa/UE
- **UE 2024: 65%** participó en turismo; **35% no viajó** [[Fuente: Eurostat — Participation in tourism](https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Tourism_statistics_-_participation_in_tourism)].
- Rango: Países Bajos **84%**, Francia 81%, Alemania 80% … Bulgaria 32%, Rumanía 28%. España (64%) queda **por debajo de la media UE** [[Fuente: Eurostat](https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Tourism_statistics_-_participation_in_tourism)].
- Volumen UE: **≈1,2 mil M de viajes** con pernoctación de residentes (2024, +4%); **71% domésticos**, **56% cortos de 1–3 noches** [[Fuente: Eurostat — Tourism trips key figures](https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Tourism_trips_-_introduction_and_key_figures)].

### 7.4. Global (UNWTO)
- UNWTO no publica un "viajes por persona/año" mundial sencillo; su indicador es **llegadas internacionales** (una persona con 10 viajes cuenta 10 veces): **≈1,4 mil M en 2024**, estimación 1,52 mil M en 2025 [[Fuente: UN Tourism — World Tourism Barometer](https://www.untourism.int/un-tourism-world-tourism-barometer-data)]. Proxy ≈**0,17 llegadas internacionales/persona/año** (*cálculo propio* sobre ~8.100 M hab.; excluye turismo doméstico).

### 7.5. Viaje en grupo de amigos (no familia/pareja)
- **No hay estadística oficial** que aísle "viajar con amigos". Encuestas privadas:
  - CIS (jul-2024): **86,2% viaja siempre acompañado** (agregado, sin desglose); 4% prefiere ir solo; 77,4% tomará vacaciones en 2024 [[Fuente: Hosteltur citando CIS](https://www.hosteltur.com/165447_infografia-como-viajan-los-turistas-espanoles-segun-el-cis.html)].
  - ViajerosPiratas (2018): pareja 64%, **amigos 20%**, familia 12%, solo 4% [[Fuente: Hosteltur/ViajerosPiratas](https://www.hosteltur.com/comunidad/nota/022354_los-espanoles-prefieren-viajar-con-pareja-o-amigos-antes-que-con-su-familia.html)].
  - Barceló (encuesta propia): familia 54%, pareja 36%, **amigos 8%** [[Fuente: Barceló Pin & Travel — verificar, el fetch dio 403](https://www.barcelo.com/pinandtravel/es/tipos-de-turismo-datos-viajes/)].
- **Lectura:** el viaje "con amigos" (segmento nuclear de Momentu) es minoría, **8–20%**, muy por debajo de pareja/familia.

### 7.6. Estacionalidad
- **UE 2024: jul+ago = 31% de las pernoctaciones anuales; jul–sep >40%** [[Fuente: Eurostat — Over a third of tourism nights in July & August](https://ec.europa.eu/eurostat/web/products-eurostat-news/w/ddn-20230523-1)]. Campings: 65% de sus pernoctaciones en Q3 [[Fuente: Eurostat — Seasonality in tourist accommodation](https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Seasonality_in_the_tourist_accommodation_sector)].
- España: *no encontrado* desglose trimestral oficial 2024 completo (habría que unir las 4 notas de prensa trimestrales del INE).

> **Lectura para el diagnóstico de Momentu.** Combinando §7.2 + §7.5 + §7.6: ~36% de los españoles no viaja nada con pernoctación; dentro de quienes viajan, el viaje con amigos es 8–20%; y ~40% de la actividad turística se concentra en jul–sep. La frecuencia de "eventos generadores de contenido para un grupo de amigos concreto" puede ser de **pocas veces al año y muy estacional**. **Esto pone en tensión la hipótesis de recurrencia mensual del producto** y debería validarse con datos primarios (encuesta al usuario objetivo) antes de asumir un patrón de uso regular. Contrapeso: Polarsteps demuestra que un diario de viaje puede crecer a 15 M+ usuarios pese a esta estacionalidad — su modelo no depende de uso mensual sino de capturar bien los viajes que sí ocurren y monetizarlos (libros, afiliación).

---

## Lagunas (lo que NO se pudo verificar con fuente fiable)

**Tamaño de mercado / crecimiento**
- Tamaño y CAGR del segmento "travel journal app" o "social travel diary" **como categoría aislada** — no existe; solo proxies difusos (travel planner / travel app).
- CAGR de travel apps **específico de España** — no encontrado.
- Cifras completas de Statista (detrás de paywall; solo resúmenes públicos).

**Polarsteps**
- Ingresos reales confirmados por la empresa (solo estimaciones de terceros 1–24,8 M USD, dispares).
- Valoración actual y cualquier ronda posterior a 2019.
- DAU/MAU (solo usuarios registrados acumulados).
- Presencia/penetración específica en España.

**GeoGuessr**
- DAU/MAU oficiales, duración de sesión y retención declaradas.
- Fuente primaria de la cifra "80 M usuarios (2024)" (repetida en agregadores sin atribución clara).

**Tendencias**
- Adopción oficial de "Close Friends" de Instagram (Meta no publica).
- Cifra GWI "68% Gen Z sharing privado" (no verificada en primaria).
- Coste medio de MVP con vs. sin IA (comparación directa) — no encontrado.

**Señales de demanda digital**
- Curvas y volúmenes reales de Google Trends para los 5 términos (bloqueo HTTP 429; sin terceros que los publiquen).
- Estacionalidad de los términos de búsqueda.

**Regulación**
- Guía monográfica oficial AEPD/EDPB sobre EXIF/GPS en fotos y sobre apps sociales de geolocalización de consumo (la conclusión se apoya en principios generales del RGPD por extensión).

**Frecuencia de viaje**
- Estadística oficial que aísle "viaje con amigos" (solo encuestas privadas 8–20%).
- Desglose trimestral oficial de estacionalidad de FAMILITUR España 2024.
- Cifra mundial precisa y citable de "viajes por persona/año" (UNWTO mide llegadas, no viajeros únicos; turismo doméstico global mal medido).

**Segmentación**
- "Backpacker" / "viajero de negocios" con desglose cuantitativo propio en travel apps.
- Demografía de la base activa de la app móvil de Polarsteps (los datos Similarweb son de tráfico web, sesgados a mayor edad).
