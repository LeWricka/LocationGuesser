# Migraciones automáticas

Guía de **puesta en marcha** del pipeline que aplica las migraciones de Supabase
en cada push a `main`.

El workflow está en [`.github/workflows/db-migrate.yml`](../.github/workflows/db-migrate.yml).
En cada push a `main` aplica las migraciones pendientes con `supabase db push`.

> **El deploy del front lo sigue haciendo Vercel** por su auto-deploy de git: no
> lo tocamos. El orden Vercel-vs-migración se garantiza con disciplina (regla de
> 2 fases, abajo), no con un deploy-hook.

Hay **dos tareas manuales** que debe hacer el usuario una vez (Claude no puede:
no tiene acceso a los secrets del repo ni a credenciales de la BD).

---

## 1. Crear los GitHub secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**.
Crear estos dos:

| Secret | Qué es | De dónde sale |
|--------|--------|---------------|
| `SUPABASE_ACCESS_TOKEN` | Token personal del CLI de Supabase | [supabase.com/account/tokens](https://supabase.com/account/tokens) → *Generate new token* |
| `SUPABASE_DB_PASSWORD` | Contraseña de la BD del proyecto | Supabase → Project → **Settings → Database → Connection** (o resetearla ahí) |

> Ninguno de estos valores se escribe NUNCA en el repo. El workflow los lee de
> `secrets.*` y los pasa por `env` al CLI. No se imprimen en los logs.

---

## 2. Regla de 2 fases: migrar antes de usar (disciplina, gratis)

El front estático de Vercel auto-despliega en cada push a `main`, y la migración
corre en su propio workflow. **No controlamos cuál de los dos termina antes.** El
problema clásico (el bug tipo `closed_at`) era: el front nuevo `select`a una
columna que la BD aún no tiene → producción rota.

La solución no necesita ningún ajuste de Vercel ni deploy-hook, solo **orden de
merge**:

1. **Primero** se mergea la migración que **añade** la columna/tabla.
2. **Después** (otro PR) se mergea el front que la usa.

Como las migraciones son **aditivas** (añaden, no quitan ni renombran), una vez
aplicada la fase 1 la columna existe para siempre. El front de la fase 2 nunca
puede salir antes que su columna, así que **da igual quién gane la carrera
Vercel-vs-migración**: el front jamás selecciona algo que todavía no existe.

> **Por qué funciona sin coordinar deploys.** Entre fase 1 y fase 2 el front viejo
> sigue corriendo y no conoce la columna nueva → no la pide. La columna añadida
> es invisible hasta que llega el front que la usa. El orden temporal de los dos
> pipelines deja de importar.
>
> **Corolario:** evita migraciones **destructivas** (drop/rename de columnas en
> uso) en el mismo ciclo que el front. Si hay que retirar una columna, hazlo en
> dos fases inversas: primero deja de usarla en el front, luego la dropeas.

---

## 3. Reconciliación única del historial (CRÍTICO — hacer ANTES del primer push)

Las migraciones **0001–0020 se aplicaron a mano** (SQL Editor del dashboard), así
que el historial remoto `supabase_migrations.schema_migrations` **probablemente NO
las tiene registradas**. Si no se reconcilia:

> ⚠️ Un `supabase db push` ingenuo creería que 0001–0020 están pendientes e
> intentaría **re-aplicarlas**. Fallarían en seco (`relation already exists`,
> `column already exists`, etc.) y el job quedaría en rojo. En el peor caso, una
> migración a medio re-aplicar deja la BD inconsistente.

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
3. **Mergea a `main`.** El workflow `DB migrate` se dispara y aplica 0021
   (columna `description`, aditiva y nullable → no rompe nada).
4. **Revisa la pestaña Actions**: el job debe terminar en verde. Si `db push`
   falla, corrige y reintenta (la migración no se registra hasta que va en verde).
5. **Verifica la columna** sin credenciales sensibles (publishable key):

   ```bash
   curl "https://ykquigyjvgxisgdxryxr.supabase.co/rest/v1/challenges?select=id,description&limit=1" \
     -H "apikey: <publishable>" -H "Authorization: Bearer <publishable>"
   ```

> 0021 es **aditiva** (columna nullable, sin default, sin tocar policies): el
> riesgo de esta primera pasada es mínimo. Es la migración ideal para estrenar el
> pipeline. Por la **regla de 2 fases (§2)**, el front que use `description` se
> mergea en un PR posterior, nunca antes de que esta migración esté en `main`.
