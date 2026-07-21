# Estudio de competencia

## ¿Para qué sirve esta carpeta?

Hacer **deep dives** por competidor para entender cómo compiten, qué hacen bien, qué hacen mal y qué podemos aprender.

## Estructura del árbol de información

```
03-estudio-competencia/
├── README.md                              ← este archivo (índice + hipótesis + estado)
├── _template-competidor.md                ← plantilla a copiar para cada deep dive
├── resumen-competitivo.md                 ← análisis cruzado (al final, sobre el conjunto)
├── deep-dives/                            ← profundidad 1: análisis individual completo
│   └── {nombre-competidor}.md
└── analisis-ligero/                       ← profundidad 2 y 3: análisis abreviados / agregados
    ├── comparadores-secundarios.md        ← varios competidores menores agrupados
    └── apps-y-sustitutos.md               ← apps móviles + sustitutos no-comparadores
```

**Cuándo va cada cosa donde:**

- `deep-dives/` → **un archivo por competidor** cuando aporta algo estratégico distinto. Análisis completo con `_template-competidor.md` íntegro.
- `analisis-ligero/` → **varios competidores agrupados en un solo archivo** cuando son "más de lo mismo" y duplicarían conclusiones. También para sustitutos no-comparadores (asociaciones de consumidores, blogs, canales directos del proveedor, hábito de "no hacer nada").
- `resumen-competitivo.md` → al final, matriz cruzada y mapa de posicionamiento sobre el conjunto. Sirve como vista ejecutiva.

## Cómo hacer un deep dive completo (profundidad 1)

Para cada competidor estratégicamente distinto:

1. **Copia** `_template-competidor.md` a `deep-dives/{nombre-competidor}.md` (kebab-case, sin acentos).
2. **WebFetch** de la web principal del competidor.
3. **WebSearch** de:
   - Reviews recientes (Trustpilot, foros, prensa)
   - Noticias de los últimos 12 meses
   - Comparativas con otros competidores
   - Quejas en redes/foros (Reddit, Trustpilot, etc.)
4. **Rellena** las secciones del template con datos y fuentes inline `[[Fuente: nombre](URL)]`.
5. Al final, escribe **3-5 lecciones** que podemos aprender de ese competidor.

## Cómo hacer análisis ligero (profundidad 2 y 3)

Para competidores que replican el mismo modelo que un deep dive ya hecho, o para apps/sustitutos no-comparadores:

1. **Una entrada por competidor** dentro de un archivo agrupado en `analisis-ligero/`.
2. **Ficha rápida** (web, propiedad, fundación, modelo) + **ángulo único** (qué aporta distinto) + **tamaño/notoriedad**.
3. Sin matriz completa — solo lo que aporta valor diferencial respecto a los deep dives ya hechos.
4. Conclusión agrupada al final del archivo: qué nos enseñan en conjunto.

## Cómo identificar competidores

No solo los competidores directos. Considera:

- **Competidores directos**: hacen lo mismo en el mismo mercado.
- **Competidores indirectos**: resuelven el mismo problema de otra forma (incluso con hábitos manuales).
- **Sustitutos**: cubren la misma necesidad de forma totalmente distinta.
- **New entrants**: jugadores recientes con financiación o tracción notable.
- **Inercia / no hacer nada**: a menudo el competidor más fuerte. Tratarlo explícitamente.

**Recomendación de escalonamiento:** 5-7 deep dives + análisis ligero del resto. Hacer deep dive completo a 20+ competidores produce conclusiones redundantes.

## Comparativa cruzada — `resumen-competitivo.md`

Después de los deep dives + análisis ligero, crear `resumen-competitivo.md` con:

- **Matriz comparativa**: features × competidores
- **Mapa de posicionamiento**: 2 ejes (ej: precio × calidad, o nicho × generalista)
- **Quién gana en qué dimensión**
- **Espacio en blanco**: dónde no juega nadie todavía
- **Validación de hipótesis** que dejaste apuntadas al inicio
- **Hipótesis emergentes** que han salido del análisis y deben validarse en user research

## Hipótesis pendientes de validar

> Apuntar aquí, al cerrar la visión, las afirmaciones que se hicieron sin evidencia y que el estudio competitivo debe validar (o refutar).

- *(Vacío — añadir según el proyecto)*
