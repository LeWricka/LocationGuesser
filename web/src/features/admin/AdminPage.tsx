import { useEffect, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Map as MapIcon,
  Target,
  User,
  Users,
  Vote,
} from 'lucide-react'
import { BackHomeButton, Badge, Card, EmptyState, Icon, Row, Skeleton, Stack } from '../../ui'
import {
  getAdminAnalytics,
  getAdminGroupChallenges,
  getAdminGroups,
  type AdminAnalytics,
  type AdminGroup,
  type AdminGroupChallenge,
} from '../../lib/admin'
import {
  fmtCadence,
  fmtDate,
  fmtInt,
  fmtKind,
  fmtKm,
  fmtNumber,
  fmtPercent,
  fmtSeconds,
  fmtSince,
  fmtStatus,
} from './format'
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
    <main className="lg-page lg-rise">
      <Stack gap={6}>
        <BackHomeButton onClick={goBack} />
        <header>
          <h1 className={`t-display ${styles.title}`}>Administración</h1>
          <p className={`t-caption ${styles.subtitle}`}>Métricas y grupos (solo lectura).</p>
        </header>

        {error ? (
          <Card>
            <EmptyState
              icon={<Icon icon={AlertTriangle} size={32} />}
              tone="danger"
              title="Algo falló"
              description={error}
            />
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
      <h2 className={`t-label ${styles.sectionTitle}`}>
        <Icon icon={BarChart3} size={16} /> Resumen global
      </h2>
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
          <Metric
            label="Respuesta (mediana)"
            value={fmtSeconds(analytics.median_response_seconds)}
            hint="mediana global"
          />
          <Metric
            label="Salidas de la app"
            value={fmtPercent(analytics.avg_left_app_pct)}
            hint="de los votos"
          />
          <Metric label="Timeouts" value={fmtPercent(analytics.timeout_pct)} hint="votos sin pin" />
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
        <span className={`t-label ${styles.metricLabel}`}>{label}</span>
        {hint && <span className={styles.metricHint}>{hint}</span>}
      </Stack>
    </Card>
  )
}

function MetricsSkeleton() {
  return (
    <div className={styles.metrics} role="status" aria-label="Cargando métricas">
      {Array.from({ length: 13 }, (_, i) => (
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
      <h2 className={`t-label ${styles.sectionTitle}`}>
        <Icon icon={FolderOpen} size={16} /> Grupos
      </h2>
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
            icon={<Icon icon={MapIcon} size={32} />}
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
          <span className={styles.groupNameRow}>
            <span className={styles.groupName}>{name}</span>
            <Badge tone={group.is_active ? 'success' : 'neutral'} dot={group.is_active}>
              {group.is_active ? 'Activo' : 'Inactivo'}
            </Badge>
          </span>
          <span className={styles.groupMeta}>
            {group.owner_email ?? 'sin dueño'} · {fmtDate(group.created_at)}
          </span>
        </div>
        <Row gap={2} align="center">
          <span className={styles.counters}>
            <span title="Miembros">
              <Icon icon={Users} size={14} /> {fmtInt(group.member_count)}
            </span>
            <span title="Retos">
              <Icon icon={Target} size={14} /> {fmtInt(group.challenge_count)}
            </span>
            <span title="Votos">
              <Icon icon={Vote} size={14} /> {fmtInt(group.vote_count)}
            </span>
            <span title="Participantes">
              <Icon icon={User} size={14} /> {fmtInt(group.participant_count)}
            </span>
          </span>
          <span className={styles.chevron}>
            <Icon icon={open ? ChevronUp : ChevronDown} size={18} />
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
          ) : (
            <Stack gap={4}>
              <GroupStats group={group} />
              {challenges && challenges.length > 0 ? (
                <Stack gap={3}>
                  <h3 className={`t-title ${styles.blockTitle}`}>Retos</h3>
                  {challenges.map((c) => (
                    <ChallengeRow key={c.challenge_id} challenge={c} />
                  ))}
                </Stack>
              ) : (
                <p className={styles.empty}>Este grupo aún no tiene retos.</p>
              )}
            </Stack>
          )}
        </div>
      )}
    </Card>
  )
}

// Bloque de stats del grupo (columnas ampliadas de admin_groups), agrupado por
// tema para que no sea un muro de números: participación, rendimiento, tiempo e
// integridad/contexto.
function GroupStats({ group }: { group: AdminGroup }) {
  return (
    <Stack gap={3}>
      <StatGroup title="Participación y cobertura">
        <Stat label="Miembros activos" value={fmtPercent(group.active_member_pct)} />
        <Stat label="Lurkers" value={fmtInt(group.lurker_count)} />
        <Stat label="Cobertura de votos" value={fmtPercent(group.coverage_pct)} />
      </StatGroup>
      <StatGroup title="Rendimiento">
        <Stat label="Distancia media" value={fmtKm(group.avg_distance_km)} />
        <Stat label="Mejor jugador" value={group.top_player ?? '—'} />
      </StatGroup>
      <StatGroup title="Tiempo">
        <Stat label="Respuesta (mediana)" value={fmtSeconds(group.median_response_seconds)} />
        <Stat
          label="Tiempo consumido (mediana)"
          value={fmtPercent(group.median_time_consumed_pct)}
        />
        <Stat label="Timeouts" value={fmtInt(group.timeout_count)} />
      </StatGroup>
      <StatGroup title="Integridad y contexto">
        <Stat label="Última actividad" value={fmtSince(group.last_activity_at)} />
        <Stat label="Cadencia de retos" value={fmtCadence(group.avg_days_between_challenges)} />
        <Stat
          label="Salidas de la app"
          value={`${fmtInt(group.left_app_count)} (${fmtPercent(group.left_app_pct)})`}
        />
      </StatGroup>
    </Stack>
  )
}

// Subbloque temático: subtítulo + rejilla de stats (dl). Reutiliza la rejilla de
// métricas por reto.
function StatGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className={`t-label ${styles.statGroupTitle}`}>{title}</h4>
      <dl className={styles.challengeMetrics}>{children}</dl>
    </div>
  )
}

// Detalle de un reto, expandible: cabecera (título, fecha, badges de tipo/estado/
// foto) + resumen siempre visible; al abrir, métricas ampliadas (dispersión,
// mejor/peor jugador, medianas, no votantes, timeouts, salidas de la app).
function ChallengeRow({ challenge }: { challenge: AdminGroupChallenge }) {
  const [open, setOpen] = useState(false)

  return (
    <div className={styles.challenge}>
      <button
        type="button"
        className={styles.challengeHead}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className={styles.challengeHeadMain}>
          <span className={styles.challengeTitle}>{challenge.title}</span>
          <span className={styles.challengeMeta}>
            {fmtDate(challenge.created_at)}
            {challenge.author ? ` · ${challenge.author}` : ''}
          </span>
          <span className={styles.challengeBadges}>
            <Badge tone={challenge.status === 'abierto' ? 'live' : 'neutral'}>
              {fmtStatus(challenge.status)}
            </Badge>
            <Badge tone="accent">{fmtKind(challenge.kind)}</Badge>
          </span>
        </div>
        <span className={styles.chevron}>
          <Icon icon={open ? ChevronUp : ChevronDown} size={16} />
        </span>
      </button>

      <dl className={styles.challengeMetrics}>
        <Stat label="Votos" value={fmtInt(challenge.vote_count)} />
        <Stat label="Participación" value={fmtPercent(challenge.participation_pct)} />
        <Stat label="Distancia media" value={fmtKm(challenge.avg_distance_km)} />
        <Stat label="Puntos medios" value={fmtNumber(challenge.avg_points, 0)} />
      </dl>

      {open && (
        <Stack gap={3}>
          <StatGroup title="Dispersión de distancias">
            <Stat label="Mínima" value={fmtKm(challenge.min_distance_km)} />
            <Stat label="Mediana" value={fmtKm(challenge.median_distance_km)} />
            <Stat label="Máxima" value={fmtKm(challenge.max_distance_km)} />
          </StatGroup>
          <StatGroup title="Jugadores">
            <Stat label="Puntos máx." value={fmtInt(challenge.max_points)} />
            <Stat label="Mejor jugador" value={challenge.best_player ?? '—'} />
            <Stat label="Peor jugador" value={challenge.worst_player ?? '—'} />
          </StatGroup>
          <StatGroup title="Tiempo">
            <Stat
              label="Respuesta (mediana)"
              value={fmtSeconds(challenge.median_elapsed_seconds)}
            />
            <Stat
              label="Tiempo consumido (mediana)"
              value={fmtPercent(challenge.median_time_consumed_pct)}
            />
          </StatGroup>
          <StatGroup title="Integridad">
            <Stat label="No votantes" value={fmtInt(challenge.non_voter_count)} />
            <Stat label="Timeouts" value={fmtInt(challenge.timeout_count)} />
            <Stat label="Salidas de la app" value={fmtInt(challenge.left_app_count)} />
          </StatGroup>
        </Stack>
      )}
    </div>
  )
}

// Una métrica: etiqueta pequeña + valor. dt/dd para semántica de lista de
// definiciones.
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
      <dt className={styles.statLabel}>{label}</dt>
      <dd className={styles.statValue}>{value}</dd>
    </div>
  )
}
