# CLAUDE.md — Momentu

> Contexto del proyecto para futuras conversaciones con IA. Este archivo se actualiza según avanza el proyecto.

## Qué es este proyecto

**Momentu** — un diario de viaje para, primero, documentar y guardar tus viajes como quieres (la base); compartirlos con la gente que más quieres; y que además esa gente pueda ser parte del viaje, participando y jugando a adivinar dónde estás. Lo personal es el cimiento; lo social —el reto— es lo que lo diferencia del resto. *(Frase ancla: "Comparte tus momentos de una forma diferente.")*

## Estado actual

Creado el 3 julio 2026. Fase actual: **Visión**.

> Actualizar según avance: Visión → Diagnóstico → Oportunidades → Política → Roadmap.

## Metodología

Este proyecto sigue la **metodología 540**:

1. **Visión abstracta** (norte del proyecto: problema, usuario, diferenciación, outcome)
2. **Diagnóstico** de fuera hacia dentro: mercado → contexto → competencia → usuarios → síntesis con oportunidades brutas
3. **Modelo económico** — cómo monetiza el producto (quién paga, pricing, unit economics)
4. **Política guía** (Rumelt) — decide qué oportunidades atacar y cuáles descartar
5. **Opportunity Solution Tree** (Teresa Torres) — solo sobre las oportunidades elegidas en la política: soluciones candidatas + assumption tests
6. **Roadmap de impacto** — calendariza assumption tests, centrado en oportunidades no en features
7. **Foto del estado futuro** — al final, concreta a 6m/12m/24-36m, verifica coherencia del kernel completo

## Frameworks aplicados

- **Kernel de Rumelt**: Diagnóstico → Política Guía → Acciones Coherentes
- **Opportunity Solution Tree (Teresa Torres)**: Outcome → Opportunities → Solutions → Assumption Tests
- **DHM Gibson Biddle** (referencia para ventaja competitiva): Delight, Hard to Copy, Margin Enhancing

## Estructura del proyecto

```
momentu/
├── 00-vision.md                       # Visión abstracta
├── 01-diagnostico/                    # Mercado → producto → competencia → usuarios → oportunidades
├── 02-modelo-economico.md             # Cómo monetiza el producto
├── 03-politica-guia.md                # Qué oportunidades atacamos y cuáles descartamos
├── 04-acciones-coherentes/            # OST + Proximate Objectives + Roadmap
├── 05-foto-estado-futuro.md           # Foto concreta del futuro + verificación de coherencia
└── Frameworks/                        # Referencias metodológicas
```

## Convenciones para la IA

- **Idioma**: responder siempre en español
- **Archivos**: nombres kebab-case sin acentos
- **Fuentes**: añadir trazabilidad inline `[[Fuente: nombre](URL)]` cuando se incorpore un dato externo
- **Entrevistador estricto**: una pregunta a la vez. Retar respuestas vagas, exigir evidencia, señalar puntos débiles explícitamente
- **No proponer ideas de primeras**: primero escuchar al usuario. Solo proponer si lo pide explícitamente o al cerrar cada sección ofrecer "modo brainstorm" opcional
- **Investigación**: usar WebSearch/WebFetch proactivamente en fases que lo requieren (mercado, competencia)
- **Trazabilidad de decisiones**: documentar tradeoffs y qué se descartó

## Comandos relevantes

- `/init-producto diagnostico` — Mercado, competencia, usuarios → oportunidades brutas
- `/init-producto modelo` — Modelo económico del producto
- `/init-producto politica` — Política guía (Rumelt): qué oportunidades atacamos
- `/init-producto oportunidades` — OST sobre las oportunidades elegidas (Teresa Torres)
- `/init-producto roadmap` — Proximate objectives + roadmap de impacto
- `/init-producto futuro` — Foto del estado futuro + verificación de coherencia
- `/init-producto sintesis` — Resumen ejecutivo

**Orden recomendado:** `diagnostico` → `modelo` → `politica` → `oportunidades` → `roadmap` → `futuro` → `sintesis`.
