# Momentu

> Proyecto de producto creado el 3 julio 2026 siguiendo la metodología 540 (Kernel de Rumelt + Opportunity Solution Tree).

## Estado del proyecto

| Fase | Documento | Estado |
|------|-----------|--------|
| Visión (abstracta) | [00-vision.md](00-vision.md) | ✅ Completa (4 jul 2026) |
| Diagnóstico — Mercado | [01-diagnostico/01-estudio-mercado.md](01-diagnostico/01-estudio-mercado.md) | ✅ (4 jul 2026) + [datos con fuentes](01-diagnostico/01-estudio-mercado-investigacion.md) |
| Diagnóstico — Contexto producto | [01-diagnostico/02-contexto-producto.md](01-diagnostico/02-contexto-producto.md) | ✅ (4 jul 2026) |
| Diagnóstico — Competencia | [01-diagnostico/03-estudio-competencia/](01-diagnostico/03-estudio-competencia/) | ✅ (4 jul 2026) — 9 competidores, mapa, veredicto Polarsteps |
| Diagnóstico — User research | [01-diagnostico/04-user-research/](01-diagnostico/04-user-research/) | ✅ (4 jul 2026) — persona María + audiencia, journey, JTBD |
| Diagnóstico — Síntesis (problemas + oportunidades brutas) | [01-diagnostico/05-problemas-oportunidades.md](01-diagnostico/05-problemas-oportunidades.md) | ✅ (4 jul 2026) |
| Modelo económico | [02-modelo-economico.md](02-modelo-economico.md) | ⏸️ Aplazado hasta señales de tracción (decisión 4 jul 2026) |
| Política guía (elige qué oportunidades atacar) | [03-politica-guia.md](03-politica-guia.md) | ✅ (4 jul 2026) |
| **Plan de medición: ¿encaja? (dashboard)** | [04-acciones-coherentes/plan-medicion-encaje.md](04-acciones-coherentes/plan-medicion-encaje.md) | 🟡 Objetivo próximo #1 — pendiente montar en Mixpanel + cerrar 1 hueco de instrumentación |
| Opportunity Solution Tree (solo oportunidades elegidas) | [04-acciones-coherentes/opportunity-solution-tree.md](04-acciones-coherentes/opportunity-solution-tree.md) | ⬜ |
| Proximate objectives | [04-acciones-coherentes/proximate-objectives.md](04-acciones-coherentes/proximate-objectives.md) | ⬜ |
| Roadmap de impacto | [04-acciones-coherentes/roadmap-impacto.md](04-acciones-coherentes/roadmap-impacto.md) | ⬜ |
| Foto del estado futuro (cierre + verificación coherencia) | [05-foto-estado-futuro.md](05-foto-estado-futuro.md) | ⬜ |

> Marcar 🟡 cuando esté en progreso, ✅ cuando esté completo.

## Cómo trabajar en este proyecto

Este proyecto sigue la metodología 540, que combina:

- **Kernel de Rumelt**: Diagnóstico → Política Guía → Acciones Coherentes
- **Opportunity Solution Tree (Teresa Torres)**: Outcome → Opportunities → Solutions → Experiments
- **Mentalidad grill-me**: una decisión a la vez, con recomendación, resolviendo dependencias

### Comandos disponibles

Desde dentro de este directorio:

```
/init-producto diagnostico      # Mercado, competencia, usuarios → oportunidades brutas
/init-producto modelo           # Modelo económico del producto
/init-producto politica         # Política guía: elige qué oportunidades atacar
/init-producto oportunidades    # OST sobre las oportunidades elegidas (Teresa Torres)
/init-producto roadmap          # Proximate objectives + roadmap de impacto
/init-producto futuro           # Foto del estado futuro + verificación de coherencia
/init-producto sintesis         # Resumen ejecutivo
```

**Orden recomendado:** `diagnostico` → `modelo` → `politica` → `oportunidades` → `roadmap` → `futuro` → `sintesis`.

La IA actúa como **entrevistador estricto**: pregunta, reta vaguedades, señala puntos débiles. **No propone ideas de primeras** — solo si se lo pides explícitamente o al cerrar cada sección ofrece un "modo brainstorm" opcional.

Cada comando entrevista una sección a la vez, investiga con WebSearch/WebFetch cuando aplica, y escribe los resultados directamente en los archivos correspondientes.

## Frameworks de referencia

- [Kernel de Rumelt — resumen](Frameworks/kernel-rumelt-resumen.md)
- [Opportunity Solution Tree — resumen](Frameworks/opportunity-solution-tree-resumen.md)

## Convenciones

- **Idioma**: español
- **Archivos**: kebab-case sin acentos
- **Fuentes**: siempre con trazabilidad inline `[[Fuente: nombre](URL)]`
- **Decisiones**: documentar tradeoffs explícitamente
