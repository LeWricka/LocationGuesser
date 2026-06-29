# Migraciones automáticas + deploy ordenado

Guía de **puesta en marcha** del pipeline que aplica las migraciones de Supabase
y despliega el front en el orden correcto: **migrar primero, desplegar después**.

El workflow está en [`.github/workflows/db-migrate.yml`](../.github/workflows/db-migrate.yml).
En cada push a `main`: aplica las migraciones pendientes con `supabase db push` y
**solo si eso va en verde** dispara el deploy de Vercel vía Deploy Hook.

> **Por qué este orden.** El front estático de Vercel auto-despliega en cada push
> a `main`. Si el código nuevo asume una columna/tabla que aún no existe en la BD,
> el deploy rompe producción hasta que alguien aplica la migración a mano (fue el
> bug tipo `closed_at`). Aplicando el esquema **antes** del deploy, la BD siempre
> va por delante (o a la par) del código.

Hay **tres tareas manuales** que debe hacer el usuario una vez (Claude no puede:
no tiene acceso a los secrets del repo, al panel de Vercel ni a credenciales de la BD).

---

## 1. Crear los GitHub secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**.
Crear estos tres:

| Secret | Qué es | De dónde sale |
|--------|--------|---------------|
| `SUPABASE_ACCESS_TOKEN` | Token personal del CLI de Supabase | [supabase.com/account/tokens](https://supabase.com/account/tokens) → *Generate new token* |
| `SUPABASE_DB_PASSWORD` | Contraseña de la BD del proyecto | Supabase → Project → **Settings → Database → Connection** (o resetearla ahí) |
| `VERCEL_DEPLOY_HOOK_URL` | URL secreta que dispara un deploy de production | Vercel → Project → **Settings → Git → Deploy Hooks** → crear uno para la rama `main` |

> Ninguno de estos valores se escribe NUNCA en el repo. El workflow los lee de
> `secrets.*` y los pasa por `env` al CLI. No se imprimen en los logs.

---

## 2. Desactivar el auto-deploy por git en Vercel

Para que el deploy **solo** ocurra vía el hook (tras migrar) y no también por el
push de git (que iría en paralelo, sin esperar a la migración):

- Vercel → Project → **Settings → Git → Ignored Build Step**.
- Poner un comando que **siempre cancele** el build automático de production, p.ej.:

  ```bash
  exit 0   # "ignorar build": no construir nunca por push de git
  ```

  (Vercel interpreta exit code **0** del Ignored Build Step como "no hace falta
  build" y **cancela** el deploy automático. El deploy real lo arranca el Deploy
  Hook, que ignora este paso.)

- Alternativa más explícita: en **Settings → Git** desconectar el despliegue
  automático de Production (dejar solo Preview para PRs, si se quiere).

> **Por qué.** Si ambos caminos están activos (push de git **y** hook), el deploy
> por git puede salir ANTES de que termine la migración → vuelve el problema de
> orden. Dejando un único disparador (el hook tras `db push`) el orden queda
> garantizado.
>
> **Nota:** los deploys de **Preview** (PRs) pueden seguir activos sin riesgo: no
> tocan producción ni la BD de prod.

---

## 3. Reconciliación única del historial (CRÍTICO — hacer ANTES del primer push)

Las migraciones **0001–0020 se aplicaron a mano** (SQL Editor del dashboard), así
que el historial remoto `supabase_migrations.schema_migrations` **probablemente NO
las tiene registradas**. Si no se reconcilia:

> ⚠️ Un `supabase db push` ingenuo creería que 0001–0020 están pendientes e
> intentaría **re-aplicarlas**. Fallarían en seco (`relation already exists`,
> `column already exists`, etc.) y el job quedaría en rojo → no se desplegaría
> nunca. En el peor caso, una migración a medio re-aplicar deja la BD inconsistente.

La solución es **marcar 0001–0020 como ya aplicadas** en el historial remoto, sin
ejecutarlas, de modo que `db push` solo aplique de **0021 en adelante**.

### Pasos (una sola vez, desde tu máquina con el repo)

```bash
cd /ruta/al/repo            # raíz del monorepo (donde está supabase/)

# Autenticarte y enlazar el proyecto (interactivo la primera vez):
npx supabase login
npx supabase link --project-ref ykquigyjvgxisgdxryxr

# 1) Ver el estado real del historial remoto vs. local:
npx supabase migration list

# 2) Marcar como APLICADAS las que ya están en prod (0001–0020), sin ejecutarlas.
#    `migration repair --status applied <version>` solo escribe en el historial.
#    La <version> es el prefijo numérico del fichero (0001, 0002, …, 0020).
for v in 0001 0002 0003 0004 0005 0006 0007 0008 0009 0010 \
         0011 0012 0013 0014 0015 0016 0017 0018 0019 0020; do
  npx supabase migration repair --status applied "$v"
done

# 3) Verificar: 0001–0020 deben salir como aplicadas (Remote) y 0021 como pendiente.
npx supabase migration list
```

> **Alternativa con `db pull`.** En vez del `repair` en bucle, `npx supabase db pull`
> introspecciona el esquema remoto y sincroniza el historial. Es más opaco (puede
> generar una migración de baseline nueva) y aquí preferimos el `repair` explícito
> porque sabemos exactamente qué versiones están en prod. Usa `db pull` solo si
> `migration list` muestra discrepancias raras que el `repair` no arregla.
>
> **Si tu versión del CLI no acepta el prefijo corto** (`0001`), usa el nombre de
> versión que muestre `migration list` en la columna *Local*.

---

## 4. Probar el pipeline de forma segura la primera vez

1. **Haz la reconciliación (§3) ANTES de cualquier push.** Confirma con
   `migration list` que 0001–0020 = aplicadas y 0021 = pendiente.
2. **Simula `db push` en seco** desde tu máquina antes de confiar en el CI:

   ```bash
   npx supabase db push --dry-run
   ```

   Debe decir que aplicaría **solo** `0021_challenge_description.sql`. Si lista
   alguna de 0001–0020, la reconciliación no quedó bien: vuelve al §3.
3. **Mergea a `main`.** El workflow `DB migrate + deploy` se dispara:
   - aplica 0021 (columna `description`, aditiva y nullable → no rompe nada),
   - y al ir en verde, llama al Deploy Hook → Vercel despliega.
4. **Revisa la pestaña Actions**: el job debe terminar en verde. Si `db push`
   falla, el deploy **no** se dispara (producción intacta) — corrige y reintenta.
5. **Verifica la columna** sin credenciales sensibles (publishable key):

   ```bash
   curl "https://ykquigyjvgxisgdxryxr.supabase.co/rest/v1/challenges?select=id,description&limit=1" \
     -H "apikey: <publishable>" -H "Authorization: Bearer <publishable>"
   ```

> 0021 es **aditiva** (columna nullable, sin default, sin tocar policies): el
> riesgo de esta primera pasada es mínimo. Es la migración ideal para estrenar el
> pipeline.
