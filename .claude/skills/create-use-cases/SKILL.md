---
name: create-use-cases
description: Crea issues de caso de uso (type Project) en SaltokiVanOirschot/SaltokiOnline siguiendo la plantilla Shape Up del equipo de Discovery, las añade al proyecto Saltoki Projects #18 y rellena los campos (Status, Impact, Apetito) y relaciones padre/hijo y bloqueo. Usar al crear casos de uso o requisitos para Saltoki Online.
---

STARTER_CHARACTER = 📋⚡

## Target

- **Repositorio:** `SaltokiVanOirschot/SaltokiOnline`
- **Proyecto:** Saltoki Projects #18 — `PROJECT_ID = PVT_kwDOAq0XsM4AMHhT` (org `SaltokiVanOirschot`)
- **Issue type:** `Project`
- **Plantilla de cuerpo:** [plantilla-caso-de-uso.md](../../../flujo/plantilla-caso-de-uso.md) (formato Shape Up)
- **Flujo:** un caso recién creado entra en `On the bench`. Solo cruza a `Shaping-ok` cuando cumple el Definition of Ready. Ver [flujo-discovery.md](../../../flujo/flujo-discovery.md).

### IDs del proyecto #18 (verificados)

| Campo | Field ID | Tipo | Opciones / notas |
|-------|----------|------|------------------|
| Status | `PVTSSF_lADOAq0XsM4AMHhTzgHurQE` | single-select | On the bench=`bed56f10`, Shaping=`8ba0f952`, Shaping-ok=`7e8bb721`, To do=`f75ad846`, In Progress=`47fc9ee4`, Blocked=`f30bced7`, Validation=`1623e4db`, Done=`98236657` |
| Impact | `PVTF_lADOAq0XsM4AMHhTzgIycjk` | number | — |
| Apetito | `PVTF_lADOAq0XsM4AMHhTzgKEqFw` | number (semanas) | — |
| Ciclo | `PVTIF_lADOAq0XsM4AMHhTzgKFDe8` | iteration | opcional |

> Si los IDs fallaran (cambio de configuración del proyecto), redescúbrelos:
> ```bash
> gh api graphql -f query='query{organization(login:"SaltokiVanOirschot"){projectV2(number:18){id fields(first:30){nodes{... on ProjectV2FieldCommon{id name dataType} ... on ProjectV2SingleSelectField{id name options{id name}}}}}}}'
> ```

## Paso 1 — Recopilar casos de uso

Pide input al usuario. Dos modos:

**Modo lista:** el usuario da una lista de casos (títulos + descripción breve). Confirma la lista antes de continuar.

**Modo contexto:** el usuario apunta a un contexto existente (documento, conversación, página de Notion, Figma, issue). Este es el **documento padre**. Usa la skill `story-splitting` (vía subagente) para partir el contexto en casos bien dimensionados — detecta red flags lingüísticos (y, o, gestionar, incluyendo) y produce slices verticales. Presenta los casos resultantes para confirmación antes de crear nada.

**Código de Saltoki Online (preguntar, no precargar):** antes de escribir las dependencias técnicas, pregunta *"¿Quieres que mire el código de Saltoki Online para validar factibilidad / bounded contexts de estos casos?"*. Si confirma, **localiza el repo (remoto `SaltokiVanOirschot/SaltokiOnline`) y gestiona su ausencia según la regla de contexto** (`.claude/rules/trazabilidad-y-estilo.md`): no asumas la ruta, y si no puedes acceder, marca la factibilidad como `pendiente`/`REVISAR`.

**Extracción de contexto (solo modo contexto):** antes de escribir los cuerpos, analiza el documento padre y extrae por cada caso:
- **Términos de dominio:** conceptos, acrónimos, segmentos o sistemas externos del padre relevantes para ESTE caso. Defínelos brevemente.
- **Detalles de integración externa:** fuentes de datos, protocolos, APIs, frecuencias, contratos — lo que el desarrollador necesita (IBMi/AS400, Elasticsearch, Stripe/Redsys/Bizum, Ariba/cXML, sync nocturna…).
- **Bloqueantes heredados:** cualquier "Pendiente", "Duda" o dependencia sin resolver del padre que afecte a ESTE caso. Pasan a ser bloqueantes explícitos.

Por cada caso, pregunta o infiere del contexto:
- **Segmento afectado:** instalador individual | empresa de instalación | enterprise punchout | SAT | proveedor
- **Status inicial:** `On the bench` (por defecto, recién capturado) o `Shaping` (si ya se va a definir)
- **Impact:** número (escala del equipo)
- **Apetito:** número de semanas (presupuesto, no estimación)
- **Relaciones:** ¿bloquea o depende de otros? ¿es hijo de una issue existente?
- **Labels:** etiquetas de workspace que apliquen

Presenta una **tabla resumen** de todos los casos con sus campos antes de crear nada. Espera aprobación.

## Paso 2 — Escribir el cuerpo de la issue

Cada caso sigue la **plantilla Shape Up** del equipo (no inventes secciones). Escribe en español, lenguaje de negocio. Sin jerga técnica interna (nombres de servicios, clases, patrones) — pero los términos técnicos externos que son parte del requisito (protocolos, APIs, sistemas externos) sí son lenguaje de negocio legítimo.

Rellena solo lo que tengas con evidencia; lo que falte se marca como pendiente, no se inventa. Estructura:

```
# [Título del caso de uso]

## 1. Problema
- **Qué problema resuelve y para quién** (segmento concreto)
- **Estado actual:** cómo se resuelve hoy y por qué duele
- **Evidencia:** encuesta / dato analítica / ticket de soporte / sesión con stakeholder — siempre con fuente

## 2. Apetito
- **Semanas:** [N]  ·  **Equipo asumido:** [N] personas (el campo Apetito del #18 = semanas)
- **Trade-off explícito:** si se desborda, qué recortamos primero (no se añade gente ni se mueve fecha)

## 3. Hipótesis de impacto
> Creemos que [solución] provocará [resultado medible] porque [razón]
- **Métrica primaria:** [KPI] — baseline: [X] → target: [Y]
- **Métricas guardarraíl:** [qué NO debe empeorar]
> Si no admite métrica (refactor, integración contractual, deuda), marcar `N/A` y justificar en una línea.

## 4. Solución
### 4.1 Flujo funcional (breadboarding)
### 4.2 Concepto de interfaz (link a Figma)
### 4.3 Reglas de negocio / Casos de uso
### 4.4 Dependencias técnicas
- Sistemas implicados (IBMi/AS400, Auth, CMS, Elastic, Stripe, Ariba…)
- Integraciones / endpoints nuevos · Datos / sync nocturna · Bounded contexts afectados

## 5. Rabbit Holes
## 6. No-Gos (Exclusiones)
## 7. Criterios de aceptación
- [ ] Funcional: …
- [ ] Analítica instrumentada: eventos [X], [Y]
- [ ] No regresión en: …

## 8. Validaciones — Definition of Ready (para mover a `Shaping-ok`)
- [ ] Problema con evidencia · [ ] Apetito numérico · [ ] Hipótesis con métrica+baseline+target (o N/A)
- [ ] Flujo cerrado · [ ] Figma · [ ] Reglas de negocio · [ ] Firma técnica: [David, o tech designado]
- [ ] Rabbit Holes y No-Gos · [ ] Criterios de aceptación · [ ] OK Nacho (bloqueante final)
```

### Buenas y malas señales

- ✅ "El instalador no puede reutilizar la lista de materiales de un proyecto anterior y la reconstruye a mano cada vez." (problema, segmento, dolor)
- ✅ "Los datos de stock se sincronizan desde IBMi/AS400 en la sync nocturna." (detalle de integración como negocio)
- ❌ "Refactorizar el servicio de carrito para inyección de dependencias." (jerga interna)
- ❌ "Implementar un endpoint REST que devuelva…" (detalle de implementación)
- ❌ Copiar el documento padre entero en el contexto — extrae solo lo que ESTE caso necesita.

## Paso 3 — Crear las issues

Comprueba si el MCP de GitHub está disponible (`mcp__github__issue_write` en tus tools). Úsalo si está; si no, usa `gh`.

### 3.1 Crear la issue

**Con MCP:** `mcp__github__issue_write` con `method: create`, `owner: SaltokiVanOirschot`, `repo: SaltokiOnline`, `type: Project`, más `title`, `body`, `labels`.

**Con gh CLI:**
```bash
gh issue create --repo SaltokiVanOirschot/SaltokiOnline \
  --title "<título>" --body "<cuerpo>" --label "<label>" --type "Project"
```

### 3.2 Añadir al proyecto y fijar campos

```bash
PROJECT_ID="PVT_kwDOAq0XsM4AMHhT"
# Node ID de la issue
CONTENT_ID=$(gh issue view <número> --repo SaltokiVanOirschot/SaltokiOnline --json id -q .id)

# Añadir al proyecto #18 → devuelve el item id
ITEM_ID=$(gh api graphql -f query='
mutation($p:ID!,$c:ID!){ addProjectV2ItemById(input:{projectId:$p, contentId:$c}){ item{ id } } }' \
  -f p="$PROJECT_ID" -f c="$CONTENT_ID" --jq '.data.addProjectV2ItemById.item.id')

# Status (por defecto On the bench = bed56f10)
gh api graphql -f query='
mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){ updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{singleSelectOptionId:$o}}){ projectV2Item{ id } } }' \
  -f p="$PROJECT_ID" -f i="$ITEM_ID" -f f="PVTSSF_lADOAq0XsM4AMHhTzgHurQE" -f o="bed56f10"

# Impact (number)
gh api graphql -f query='
mutation($p:ID!,$i:ID!,$f:ID!,$n:Float!){ updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{number:$n}}){ projectV2Item{ id } } }' \
  -f p="$PROJECT_ID" -f i="$ITEM_ID" -f f="PVTF_lADOAq0XsM4AMHhTzgIycjk" -F n=<impact>

# Apetito (number, semanas)
gh api graphql -f query='
mutation($p:ID!,$i:ID!,$f:ID!,$n:Float!){ updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{number:$n}}){ projectV2Item{ id } } }' \
  -f p="$PROJECT_ID" -f i="$ITEM_ID" -f f="PVTF_lADOAq0XsM4AMHhTzgKEqFw" -F n=<semanas>
```

### 3.3 Relaciones

**Padre/hijo (sub-issue):**
```bash
PARENT_NODE=$(gh issue view <padre> --repo SaltokiVanOirschot/SaltokiOnline --json id -q .id)
CHILD_NODE=$(gh issue view <hijo> --repo SaltokiVanOirschot/SaltokiOnline --json id -q .id)
gh api graphql -f query='mutation($p:ID!,$c:ID!){ addSubIssue(input:{issueId:$p, subIssueId:$c}){ issue{ number } } }' \
  -f p="$PARENT_NODE" -f c="$CHILD_NODE"
```

**Bloqueo (BLOCKING bloquea a BLOCKED):**
```bash
BLOCKED_ID=$(gh issue view <bloqueada> --repo SaltokiVanOirschot/SaltokiOnline --json id -q .id)
BLOCKING_ID=$(gh issue view <bloqueante> --repo SaltokiVanOirschot/SaltokiOnline --json id -q .id)
gh api graphql -f query='
mutation($i:ID!,$b:ID!){ addBlockedBy(input:{issueId:$i, blockingIssueId:$b}){ issue{ number } blockingIssue{ number } } }' \
  -f i="$BLOCKED_ID" -f b="$BLOCKING_ID"
```

## Paso 4 — Reportar resultados

| # | Título | Segmento | Status | Impact | Apetito | Relaciones |
|---|--------|----------|--------|--------|---------|------------|
| #XXXX | … | instalador | On the bench | 3 | 4 sem | padre de #YYYY |

Incluye el link a cada issue creada.

## Reglas de comportamiento

- **No inventar evidencia ni métricas.** Lo que no se sepa, se marca como pendiente en la issue.
- **Respetar la plantilla Shape Up** — es el contrato del DoR para cruzar a `Shaping-ok`.
- **Estado inicial por defecto `On the bench`** salvo que el usuario indique que ya entra en `Shaping`.
- **Confirmar la tabla resumen antes de crear** cualquier issue.
- **No marcar el DoR como completo** automáticamente — el OK final es de Nacho (humano), fuera del alcance de esta skill.
