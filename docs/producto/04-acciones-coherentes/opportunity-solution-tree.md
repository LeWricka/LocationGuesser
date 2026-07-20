# Opportunity Solution Tree (OST)

## ¿Para qué sirve este documento?

El OST de **Teresa Torres** es la pieza central que conecta el diagnóstico (problemas y oportunidades) con las acciones concretas (roadmap). Estructura el pensamiento en cuatro niveles:

```
Outcome (el cambio que queremos en el cliente, viene de la visión)
├── Opportunities (oportunidades detectadas en personas + journeys + JTBD)
│   ├── Solutions (ideas de solución — hipótesis, no compromiso)
│   │   └── Assumption tests (qué tendría que ser cierto)
```

## Preguntas clave que debe responder

1. ¿Cuál es el **outcome** que queremos provocar en el cliente?
2. ¿Qué **oportunidades** vamos a atacar?
3. Por cada oportunidad, ¿qué **soluciones** podemos probar?
4. Por cada solución, ¿qué **assumption tests** validarían que funciona?

## Principios

- **Outcomes, no outputs.** El outcome es un cambio en el comportamiento del cliente, no una feature.
- **Oportunidades son del cliente.** Salen de personas, journeys, JTBD. No son "hacer X" sino "ayudar al cliente a Y".
- **Las soluciones son hipótesis.** No nos casamos con ellas. Si la evidencia dice que no funciona, se descarta.
- **Cada solución requiere experimentos.** Antes de construir, validar las assumptions.

---

# Outcome desired

> Viene directo de `00-vision.md`. Es el cambio medible en el cliente.

> TODO: Outcome (ej: "Reducir el tiempo que un usuario tarda en cambiar de comercializadora de 2h a 5min").

**Cómo lo medimos:**
> TODO: Métrica concreta.

**Estado actual (baseline):**
> TODO: Dónde estamos hoy.

**Objetivo:**
> TODO: Dónde queremos estar y para cuándo.

---

# Árbol de oportunidades

> Estructura visual del OST. Cada oportunidad cuelga del outcome. Cada solución cuelga de una oportunidad. Cada assumption test cuelga de una solución.

```
Outcome: [Tu outcome]
│
├── 🎯 Oportunidad 1: [Título]
│   │
│   ├── 💡 Solución 1.1: [Idea]
│   │   ├── 🧪 Assumption test: [Qué validamos]
│   │   └── 🧪 Assumption test: [Qué validamos]
│   │
│   └── 💡 Solución 1.2: [Idea]
│       └── 🧪 Assumption test: [Qué validamos]
│
├── 🎯 Oportunidad 2: [Título]
│   │
│   └── 💡 Solución 2.1: [Idea]
│       └── 🧪 Assumption test: [Qué validamos]
│
└── 🎯 Oportunidad 3: [Título]
    │
    └── 💡 Solución 3.1: [Idea]
        └── 🧪 Assumption test: [Qué validamos]
```

> TODO: Reemplazar con el árbol real del proyecto.

---

# Detalle de oportunidades

## 🎯 Oportunidad 1: [Título]

**¿Qué dolor o necesidad del cliente representa?**
> TODO

**Origen (de dónde viene esta oportunidad en el diagnóstico):**
- Persona afectada: > TODO
- Fase del journey: > TODO
- JTBD relacionado: > TODO

**Evidencia (¿es real?):**
- > TODO con fuente si aplica

**Impacto si se resuelve:**
> TODO: Alto/Medio/Bajo. ¿Por qué?

**Prioridad:** 🟢 / 🟡 / 🔴

### Soluciones candidatas

#### 💡 Solución 1.1: [Idea]

**Descripción corta:**
> TODO

**Cómo serviría a la oportunidad:**
> TODO

**Assumption tests (qué tiene que ser cierto):**

| # | Assumption | Cómo lo validamos | Coste / tiempo |
|---|------------|-------------------|----------------|
| 1 | > TODO    | > TODO            | > TODO         |
| 2 |           |                   |                |

**Riesgos si nos equivocamos:**
> TODO

#### 💡 Solución 1.2: [Idea alternativa]

> Duplicar estructura.

---

## 🎯 Oportunidad 2: [Título]

> Duplicar estructura.

---

## 🎯 Oportunidad 3: [Título]

> Duplicar estructura.

---

# Oportunidades descartadas

> Oportunidades que se consideraron pero no entraron al OST y por qué.

| Oportunidad | Por qué se descartó |
|-------------|---------------------|
| > TODO     | > TODO             |

---

# Próximos experimentos sugeridos

> A partir de los assumption tests, ¿qué experimentos lanzaríamos primero? Priorizar por aprendizaje × velocidad.

1. **[Experimento]** — Valida: [assumption]. Tiempo: [estimación]. Coste: [estimación].
2. > TODO

---

# Notas de uso

- **El OST es vivo**: se actualiza según aprendemos. No es un documento "final".
- **Soluciones != compromisos**: que esté en el OST no significa que la vayamos a hacer.
- **Una oportunidad puede tener 0 soluciones** si aún no la entendemos bien. Eso es válido.
- **Lee** [Frameworks/opportunity-solution-tree-resumen.md](../Frameworks/opportunity-solution-tree-resumen.md) si necesitas refrescar el método.
