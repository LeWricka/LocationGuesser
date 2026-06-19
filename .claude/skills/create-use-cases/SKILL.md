---
name: create-use-cases
description: Crea issues de caso de uso en LeWricka/LocationGuesser siguiendo una plantilla Shape Up ligera, las añade al Project 14 y rellena campos (Status, Priority, Size) y relaciones padre/hijo y bloqueo. Usar al crear casos de uso o requisitos para LocationGuesser.
---

STARTER_CHARACTER = 📋⚡

## Target

- **Repositorio:** `LeWricka/LocationGuesser`
- **Proyecto:** Project #14 (usuario `LeWricka`) — `PROJECT_ID = PVT_kwHOABkrCM4BbIkS`
- **Plantilla de cuerpo:** Shape Up ligera (ver Paso 2). En español, lenguaje de producto.
- **Flujo:** un caso recién creado entra en `Backlog`. Pasa a `Ready` cuando está bien definido y listo para construir.

> ⚠️ Esta skill SOLO opera sobre `LeWricka/LocationGuesser` y su Project #14. Nunca crear issues en otros repos.

### IDs del Project #14 (verificados)

| Campo | Field ID | Tipo | Opciones |
|-------|----------|------|----------|
| Status | `PVTSSF_lAHOABkrCM4BbIkSzhV7ReQ` | single-select | Backlog=`f75ad846`, Ready=`61e4505c`, In progress=`47fc9ee4`, In review=`df73e18b`, Done=`98236657` |
| Priority | `PVTSSF_lAHOABkrCM4BbIkSzhV7RhY` | single-select | P0=`79628723`, P1=`0a877460`, P2=`da944a9c` |
| Size | `PVTSSF_lAHOABkrCM4BbIkSzhV7Rhc` | single-select | XS=`6c6483d2`, S=`f784b110`, M=`7515a9f1`, L=`817d0097`, XL=`db339eb2` |
| Estimate | `PVTF_lAHOABkrCM4BbIkSzhV7Rhg` | number | — |

> Si los IDs fallaran (cambio de configuración), redescúbrelos:
> ```bash
> gh api graphql -f query='query{user(login:"LeWricka"){projectV2(number:14){id fields(first:30){nodes{... on ProjectV2FieldCommon{id name dataType} ... on ProjectV2SingleSelectField{id name options{id name}}}}}}}'
> ```

## Paso 1 — Recopilar casos de uso

Pide input al usuario. Dos modos:

**Modo lista:** el usuario da una lista de casos (títulos + descripción breve). Confirma la lista antes de continuar.

**Modo contexto:** el usuario apunta a un documento existente (p.ej. `docs/estrategia/prueba-de-un-dia.md`). Usa la skill `story-splitting` para partir el contexto en slices verticales bien dimensionados — detecta red flags lingüísticos (y, o, gestionar, incluyendo) y produce casos que aporten valor por sí solos. Presenta los casos para confirmación antes de crear nada.

Por cada caso, pregunta o infiere:
- **Status inicial:** `Backlog` (por defecto) o `Ready` (si ya está definido).
- **Priority:** `P0` (crítico para jugar hoy) | `P1` | `P2`.
- **Size:** `XS`–`XL` (apetito, no estimación precisa).
- **Relaciones:** ¿bloquea o depende de otros? ¿es hijo de una issue/épica existente?
- **Labels:** etiquetas que apliquen (`feat`, `chore`, área…).

Presenta una **tabla resumen** de todos los casos con sus campos antes de crear nada. Espera aprobación.

## Paso 2 — Escribir el cuerpo de la issue

Plantilla Shape Up ligera. Escribe en español, lenguaje de producto. Rellena solo lo que tengas con evidencia; lo que falte se marca como pendiente, no se inventa.

```
# [Título del caso de uso]

## Problema
- Qué resuelve y para quién
- Estado actual: cómo se hace hoy y por qué duele

## Apetito
- **Size:** [XS–XL]  ·  **Priority:** [P0–P2]
- **Trade-off:** si se desborda, qué recortamos primero

## Solución
- Flujo funcional (breadboarding)
- Reglas / detalles relevantes
- Dependencias técnicas (Supabase, Leaflet, Edge Function, localStorage…)

## Fuera de alcance (No-Gos)

## Criterios de aceptación
- [ ] …
```

## Paso 3 — Crear las issues

Usa `gh`. Comprueba antes que el remoto y el repo son `LeWricka/LocationGuesser`.

### 3.1 Crear la issue

```bash
gh issue create --repo LeWricka/LocationGuesser \
  --title "<título>" --body "<cuerpo>" --label "<label>"
```

### 3.2 Añadir al Project #14 y fijar campos

```bash
PROJECT_ID="PVT_kwHOABkrCM4BbIkS"
CONTENT_ID=$(gh issue view <número> --repo LeWricka/LocationGuesser --json id -q .id)

# Añadir al proyecto → devuelve el item id
ITEM_ID=$(gh api graphql -f query='
mutation($p:ID!,$c:ID!){ addProjectV2ItemById(input:{projectId:$p, contentId:$c}){ item{ id } } }' \
  -f p="$PROJECT_ID" -f c="$CONTENT_ID" --jq '.data.addProjectV2ItemById.item.id')

# Status (por defecto Backlog = f75ad846)
gh api graphql -f query='
mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){ updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{singleSelectOptionId:$o}}){ projectV2Item{ id } } }' \
  -f p="$PROJECT_ID" -f i="$ITEM_ID" -f f="PVTSSF_lAHOABkrCM4BbIkSzhV7ReQ" -f o="f75ad846"

# Priority (p.ej. P0 = 79628723)
gh api graphql -f query='
mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){ updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{singleSelectOptionId:$o}}){ projectV2Item{ id } } }' \
  -f p="$PROJECT_ID" -f i="$ITEM_ID" -f f="PVTSSF_lAHOABkrCM4BbIkSzhV7RhY" -f o="79628723"

# Size (p.ej. S = f784b110)
gh api graphql -f query='
mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){ updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{singleSelectOptionId:$o}}){ projectV2Item{ id } } }' \
  -f p="$PROJECT_ID" -f i="$ITEM_ID" -f f="PVTSSF_lAHOABkrCM4BbIkSzhV7Rhc" -f o="f784b110"
```

### 3.3 Relaciones

**Padre/hijo (sub-issue):**
```bash
PARENT_NODE=$(gh issue view <padre> --repo LeWricka/LocationGuesser --json id -q .id)
CHILD_NODE=$(gh issue view <hijo> --repo LeWricka/LocationGuesser --json id -q .id)
gh api graphql -f query='mutation($p:ID!,$c:ID!){ addSubIssue(input:{issueId:$p, subIssueId:$c}){ issue{ number } } }' \
  -f p="$PARENT_NODE" -f c="$CHILD_NODE"
```

**Bloqueo (BLOCKING bloquea a BLOCKED):**
```bash
BLOCKED_ID=$(gh issue view <bloqueada> --repo LeWricka/LocationGuesser --json id -q .id)
BLOCKING_ID=$(gh issue view <bloqueante> --repo LeWricka/LocationGuesser --json id -q .id)
gh api graphql -f query='
mutation($i:ID!,$b:ID!){ addBlockedBy(input:{issueId:$i, blockingIssueId:$b}){ issue{ number } blockingIssue{ number } } }' \
  -f i="$BLOCKED_ID" -f b="$BLOCKING_ID"
```

## Paso 4 — Reportar resultados

| # | Título | Status | Priority | Size | Relaciones |
|---|--------|--------|----------|------|------------|
| #N | … | Backlog | P0 | S | hijo de #M |

Incluye el link a cada issue creada.

## Reglas de comportamiento

- **Solo `LeWricka/LocationGuesser` y Project #14.** Nunca otro repo/proyecto.
- **No inventar evidencia ni criterios.** Lo que no se sepa, se marca como pendiente.
- **Estado inicial por defecto `Backlog`** salvo que el usuario indique `Ready`.
- **Confirmar la tabla resumen antes de crear** cualquier issue.
- **Slices verticales:** cada caso debe aportar valor por sí solo (apóyate en `story-splitting`).
