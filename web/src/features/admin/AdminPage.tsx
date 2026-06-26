import { useEffect, useState } from 'react'
import { BackHomeButton, Badge, Card, EmptyState, Row, Skeleton, Stack } from '../../ui'
import {
  getAdminAnalytics,
  getAdminGroupChallenges,
  getAdminGroups,
  type AdminAnalytics,
  type AdminGroup,
  type AdminGroupChallenge,
} from '../../lib/admin'
import { fmtCadence, fmtDate, fmtInt, fmtKm, fmtNumber, fmtPercent, fmtSeconds } from './format'
import styles from './AdminPage.module.css'

interface Props {
  /** Vuelve a la home (lo cablea App.tsx; por defecto limpia el hash). */
  onBack?: () => void
}

// Pantalla de administración (solo lectura): un dashboard de agregados globales
// arriba y una lista de grupos que se despliega a sus retos con métricas por
// reto. Todo vía RPCs `admin_*` (SECURITY DEFINER + is_admin() en servidor). No
// hay ninguna acción destructiva. La ruta solo se muestra al admin (App.tsx);
// aun así el servidor deniega a no-admins.
export function AdminPage({ onBack }: Props) {
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null)
  const [groups, setGroups] = useState<AdminGroup[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [a, g] = await Promise.all([getAdminAnalytics(), getAdminGroups()])
        if (cancelled) return
        setAnalytics(a)
        setGroups(g)
      } catch {
        if (!cancelled)
          setError('No hemos podido cargar la administración. Reintenta en un momento.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const goBack =
    onBack ??
    (() => {
      location.hash = ''
    })

  return (
    <main className="lg-page">
      <Stack gap={6}>
        <BackHomeButton onClick={goBack} />
        <header>
          <h1 className={styles.title}>Administración</h1>
          <p className={styles.subtitle}>Métricas y grupos (solo lectura).</p>
        </header>

        {error ? (
          <Card>
            <EmptyState icon="⚠️" tone="danger" title="Algo falló" description={error} />
          </Card>
        ) : (
          <>
            <AnalyticsSection analytics={analytics} />
            <GroupsSection groups={groups} />
          </>
        )}
      </Stack>
    </main>
  )
}

// --- Dashboard de analíticas -----------------------------------------------

function AnalyticsSection({ analytics }: { analytics: AdminAnalytics | null }) {
  return (
    <section>
      <h2 className={styles.sectionTitle}>📊 Resumen global</h2>
      {!analytics ? (
        <MetricsSkeleton />
      ) : (
        <div className={styles.metrics}>
          <Metric label="Grupos" value={fmtInt(analytics.groups_count)} />
          <Metric label="Retos" value={fmtInt(analytics.challenges_count)} />
          <Metric label="Participantes" value={fmtInt(analytics.participants_count)} />
          <Metric label="Votos" value={fmtInt(analytics.votes_count)} />
          <Metric
            label="Retos por grupo"
            value={fmtNumber(analytics.avg_challenges_per_group)}
            hint="media"
          />
          <Metric
            label="Cadencia de retos"
            value={fmtCadence(analytics.avg_days_between_challenges)}
            hint="media entre retos"
          />
          <Metric
            label="Votos por reto"
            value={fmtNumber(analytics.avg_votes_per_challenge)}
            hint="media"
          />
          <Metric
            label="Participación"
            value={fmtPercent(analytics.avg_participation_pct)}
            hint="media"
          />
          <Metric
            label="Tiempo de respuesta"
            value={fmtSeconds(analytics.avg_response_seconds)}
            hint="medio"
          />
          <Metric
            label="Tiempo consumido"
            value={fmtPercent(analytics.avg_time_consumed_pct)}
            hint="del plazo, medio"
          />
        </div>
      )}
    </section>
  )
}

// Tarjeta de una métrica: número grande (dato editorial) + etiqueta + ayuda.
function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card padding="md">
      <Stack gap={1}>
        <span className={styles.metricValue}>{value}</span>
        <span className={styles.metricLabel}>{label}</span>
        {hint && <span className={styles.metricHint}>{hint}</span>}
      </Stack>
    </Card>
  )
}

function MetricsSkeleton() {
  return (
    <div className={styles.metrics} role="status" aria-label="Cargando métricas">
      {Array.from({ length: 10 }, (_, i) => (
        <Card key={i} padding="md">
          <Stack gap={2}>
            <Skeleton width={80} height={36} radius="md" />
            <Skeleton width={110} height={14} />
          </Stack>
        </Card>
      ))}
    </div>
  )
}

// --- Lista de grupos --------------------------------------------------------

function GroupsSection({ groups }: { groups: AdminGroup[] | null }) {
  return (
    <section>
      <h2 className={styles.sectionTitle}>🗂️ Grupos</h2>
      {!groups ? (
        <div role="status" aria-label="Cargando grupos">
          <Stack gap={3}>
            {[0, 1, 2].map((i) => (
              <Card key={i}>
                <Stack gap={2}>
                  <Skeleton width="55%" height={18} />
                  <Skeleton width="35%" height={14} />
                  <Skeleton width="100%" height={14} />
                </Stack>
              </Card>
            ))}
          </Stack>
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState
            icon="🗺️"
            title="Aún no hay grupos"
            description="Cuando se cree un grupo real, aparecerá aquí."
          />
        </Card>
      ) : (
        <Stack gap={3}>
          {groups.map((g) => (
            <GroupRow key={g.group_id} group={g} />
          ))}
        </Stack>
      )}
    </section>
  )
}

// Fila de grupo desplegable: contadores siempre visibles; al abrir, carga (una
// sola vez) los retos del grupo con sus métricas.
function GroupRow({ group }: { group: AdminGroup }) {
  const [open, setOpen] = useState(false)
  const [challenges, setChallenges] = useState<AdminGroupChallenge[] | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || loaded) return
    let cancelled = false
    void (async () => {
      try {
        const c = await getAdminGroupChallenges(group.group_id)
        if (cancelled) return
        setChallenges(c)
        setLoaded(true)
      } catch {
        if (!cancelled) setError('No se pudieron cargar los retos del grupo.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, loaded, group.group_id])

  const name = group.name?.trim() || group.group_id

  return (
    <Card padding="none">
      <button
        type="button"
        className={styles.disclosure}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className={styles.groupHead}>
          <span className={styles.groupName}>{name}</span>
          <span className={styles.groupMeta}>
            {group.owner_email ?? 'sin dueño'} · {fmtDate(group.created_at)}
          </span>
        </div>
        <Row gap={2} align="center">
          <span className={styles.counters}>
            <span title="Miembros">👥 {fmtInt(group.member_count)}</span>
            <span title="Retos">🎯 {fmtInt(group.challenge_count)}</span>
            <span title="Votos">🗳️ {fmtInt(group.vote_count)}</span>
            <span title="Participantes">🙋 {fmtInt(group.participant_count)}</span>
          </span>
          <span className={styles.chevron} aria-hidden="true">
            {open ? '▲' : '▼'}
          </span>
        </Row>
      </button>

      {open && (
        <div className={styles.reveal}>
          {error ? (
            <p className={styles.error}>{error}</p>
          ) : !loaded ? (
            <div role="status" aria-label="Cargando retos">
              <Stack gap={2}>
                <Skeleton width="100%" height={14} />
                <Skeleton width="80%" height={14} />
              </Stack>
            </div>
          ) : challenges && challenges.length > 0 ? (
            <Stack gap={3}>
              {challenges.map((c) => (
                <ChallengeRow key={c.challenge_id} challenge={c} />
              ))}
            </Stack>
          ) : (
            <p className={styles.empty}>Este grupo aún no tiene retos.</p>
          )}
        </div>
      )}
    </Card>
  )
}

// Detalle de un reto: cabecera (título, fecha, foto) + métricas en una rejilla.
function ChallengeRow({ challenge }: { challenge: AdminGroupChallenge }) {
  return (
    <div className={styles.challenge}>
      <Row justify="between" align="start" gap={2}>
        <div>
          <span className={styles.challengeTitle}>{challenge.title}</span>
          <span className={styles.challengeMeta}>{fmtDate(challenge.created_at)}</span>
        </div>
        <Badge tone={challenge.has_image ? 'accent' : 'neutral'}>
          {challenge.has_image ? '📷 con foto' : 'sin foto'}
        </Badge>
      </Row>
      <dl className={styles.challengeMetrics}>
        <Stat label="Votos" value={fmtInt(challenge.vote_count)} />
        <Stat label="Participación" value={fmtPercent(challenge.participation_pct)} />
        <Stat label="Distancia media" value={fmtKm(challenge.avg_distance_km)} />
        <Stat label="Puntos medios" value={fmtNumber(challenge.avg_points, 0)} />
        <Stat label="Tiempo de respuesta" value={fmtSeconds(challenge.avg_elapsed_seconds)} />
        <Stat label="Tiempo consumido" value={fmtPercent(challenge.avg_time_consumed_pct)} />
      </dl>
    </div>
  )
}

// Una métrica por reto: etiqueta pequeña + valor. dt/dd para semántica de lista
// de definiciones.
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
      <dt className={styles.statLabel}>{label}</dt>
      <dd className={styles.statValue}>{value}</dd>
    </div>
  )
}
