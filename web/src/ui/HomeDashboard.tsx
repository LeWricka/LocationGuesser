import type { ReactNode } from 'react'
import { Avatar } from './Avatar'
import { Button } from './Button'
import { Card } from './Card'
import { CountUp } from './CountUp'
import { CreateGroupFab } from './CreateGroupFab'
import { GroupCard } from './GroupCard'
import type { GroupStatus } from './GroupCard'
import { HomeEmptyState } from './HomeEmptyState'
import { Row } from './Row'
import { Stack } from './Stack'
import styles from './HomeDashboard.module.css'

export interface HomeGroup {
  id: string
  name: string
  status: GroupStatus
  owned?: boolean
  meta?: ReactNode
}

export interface HomeTurn {
  /** Id del reto a jugar. */
  id: string
  /** Grupo al que pertenece el reto. */
  groupName: string
  /** Quién creó el reto (p.ej. "Ana"). */
  author: string
  /** Cuenta atrás ya formateada (p.ej. "3 h 12 m"). Lo formatea #3/#6. */
  countdown: string
}

export interface HomeStats {
  /** Puntos totales del usuario. */
  totalPoints: number
  /** Nº de grupos jugados. */
  groupsPlayed: number
  /** Mejor reto: puntos + grupo (p.ej. "4 932 (Lisboa)"). Opcional. */
  best?: string
}

interface Props {
  /** Nombre a mostrar del usuario (display_name). */
  displayName: string
  avatarUrl?: string | null
  /** Retos abiertos sin votar (sección "Te toca jugar"). Vacío → no se muestra. */
  turns?: HomeTurn[]
  /** Grupos del usuario. Vacío → estado de bienvenida (§3.3). */
  groups?: HomeGroup[]
  /** Agregado "Tus números". Sin partidas → mensaje guía. */
  stats?: HomeStats | null
  onOpenProfile?: () => void
  onCreateGroup?: () => void
  onOpenGroup?: (id: string) => void
  onPlayTurn?: (id: string) => void
  className?: string
}

// Layout presentacional de la home/dashboard (§3.2). Sin auth ni datos reales:
// todo entra por props. Las secciones siguen la jerarquía de atención del doc.
export function HomeDashboard({
  displayName,
  avatarUrl,
  turns = [],
  groups = [],
  stats,
  onOpenProfile,
  onCreateGroup,
  onOpenGroup,
  onPlayTurn,
  className,
}: Props) {
  const hasGroups = groups.length > 0

  return (
    <div className={[styles.home, className].filter(Boolean).join(' ')}>
      <Stack gap={6}>
        {/* Cabecera: saludo + acceso al perfil por el avatar. */}
        <header className={styles.header}>
          <div className={styles.greeting}>
            <p className={styles.hello}>Hola,</p>
            <h1 className={styles.name}>{displayName}</h1>
          </div>
          <button
            type="button"
            className={styles.profileButton}
            onClick={onOpenProfile}
            aria-label="Abrir tu perfil"
          >
            <Avatar name={displayName} src={avatarUrl} size="md" />
          </button>
        </header>

        {/* 🔔 Te toca jugar — solo si hay retos pendientes (no ocupa en vacío). */}
        {turns.length > 0 && (
          <section aria-labelledby="home-turns">
            <h2 id="home-turns" className={styles.sectionTitle}>
              <span aria-hidden="true">🔔</span> Te toca jugar
            </h2>
            <Stack gap={3}>
              {turns.map((turn) => (
                <Card key={turn.id} padding="md" raised className={styles.turn}>
                  <div className={styles.turnInfo}>
                    <span className={styles.turnGroup}>{turn.groupName}</span>
                    <span className={styles.turnMeta}>
                      reto de {turn.author} · <span aria-hidden="true">⏳</span> {turn.countdown}
                    </span>
                  </div>
                  <Button size="sm" onClick={onPlayTurn ? () => onPlayTurn(turn.id) : undefined}>
                    Jugar
                  </Button>
                </Card>
              ))}
            </Stack>
          </section>
        )}

        {/* 👥 Tus grupos — o estado de bienvenida si el usuario es nuevo. */}
        {hasGroups ? (
          <section aria-labelledby="home-groups">
            <h2 id="home-groups" className={styles.sectionTitle}>
              <span aria-hidden="true">👥</span> Tus grupos
            </h2>
            <Stack gap={3}>
              {groups.map((group) => (
                <GroupCard
                  key={group.id}
                  name={group.name}
                  status={group.status}
                  owned={group.owned}
                  meta={group.meta}
                  onClick={onOpenGroup ? () => onOpenGroup(group.id) : undefined}
                />
              ))}
            </Stack>
          </section>
        ) : (
          <HomeEmptyState name={displayName} onCreateGroup={onCreateGroup} />
        )}

        {/* 🏆 Tus números — agregado del usuario. */}
        {hasGroups && (
          <section aria-labelledby="home-stats">
            <h2 id="home-stats" className={styles.sectionTitle}>
              <span aria-hidden="true">🏆</span> Tus números
            </h2>
            {stats ? (
              <Card padding="md">
                <Row gap={5} wrap justify="start" align="baseline">
                  <div className={styles.stat}>
                    <CountUp
                      value={stats.totalPoints}
                      className={`${styles.statValue} ${styles.statValueAccent}`}
                    />
                    <span className={styles.statLabel}>puntos</span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statValue}>{stats.groupsPlayed}</span>
                    <span className={styles.statLabel}>grupos</span>
                  </div>
                  {stats.best && (
                    <div className={styles.stat}>
                      <span className={styles.statValueSm}>{stats.best}</span>
                      <span className={styles.statLabel}>mejor reto</span>
                    </div>
                  )}
                </Row>
              </Card>
            ) : (
              <Card padding="md">
                <p className={styles.statsEmpty}>
                  Cuando juegues tu primer reto, aquí verás tus puntos.
                </p>
              </Card>
            )}
          </section>
        )}
      </Stack>

      {/* Acción primaria siempre accesible. */}
      <CreateGroupFab onClick={onCreateGroup} />
    </div>
  )
}
