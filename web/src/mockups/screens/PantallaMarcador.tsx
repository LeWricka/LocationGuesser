// PantallaMarcador — pantalla 5/5 del camino feliz (mockup).
//
// Tras clavar el tiro: resultado personal (distancia + puntos) + ubicación real
// en el mapa con la línea al tiro + clasificación del grupo.
// ShellFeed: cabecera + scroll de contenido.

import { AppHeader, Button } from '../../ui'
import { ShellFeed } from '../shells/ShellFeed'
import { MapStub } from './MapStub'
import { IconConfeti, IconMedalla, IconPin, IconDiana } from '../icons/MockupIcons'
import { FIXTURE_MARCADOR, FIXTURE_RESPUESTA } from './fixtures'
import styles from './PantallaMarcador.module.css'

// Fixture del resultado personal (Lewis = posición 2)
const MI_RESULTADO = {
  nombre: 'Lewis',
  puntos: 4200,
  distanciaKm: 8.0,
  posicion: 2,
}

export function PantallaMarcador() {
  return (
    <ShellFeed
      header={
        <AppHeader
          title="Resultado"
          onLead={() => {}}
          lead="close"
          leadLabel="Volver al viaje"
          variant="plain"
          action={
            <Button variant="ghost" size="sm">
              Compartir
            </Button>
          }
        />
      }
    >
      {/* Mi resultado personal */}
      <div className={styles.resultadoCard}>
        <div className={styles.resultadoHeader}>
          <div className={styles.resultadoEmoji}>
            <IconConfeti size={40} />
          </div>
          <div className={styles.resultadoNumeros}>
            <div className={styles.resultadoPuntos}>{MI_RESULTADO.puntos.toLocaleString()} pts</div>
            <div className={styles.resultadoDistancia}>
              A {MI_RESULTADO.distanciaKm} km de la respuesta · Puesto #{MI_RESULTADO.posicion}
            </div>
          </div>
        </div>

        {/* Mapa con el tiro y la respuesta real */}
        <div className={styles.mapaResultado}>
          <MapStub label={FIXTURE_RESPUESTA.label} pin="none" />
          {/* Línea del tiro (SVG superpuesto): respuesta real (teal) → tiro (ámbar) */}
          <svg
            className={styles.lineaTiro}
            viewBox="0 0 280 160"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Respuesta real: punto teal */}
            <circle cx="140" cy="80" r="7" fill="var(--mk-primary)" />
            {/* Tiro del jugador: punto ámbar */}
            <circle cx="185" cy="55" r="7" fill="var(--mk-accent)" />
            {/* Línea entre ambos */}
            <line
              x1="140"
              y1="80"
              x2="185"
              y2="55"
              stroke="var(--mk-accent)"
              strokeWidth="2"
              strokeDasharray="6 4"
            />
          </svg>
        </div>

        <p className={styles.leyenda}>
          <span className={styles.leyendaItem}>
            <IconPin size={16} className={styles.leyendaPin} />
            {FIXTURE_RESPUESTA.label}
          </span>
          <span className={styles.leyendaItem}>
            <IconDiana size={16} className={styles.leyendaDiana} />
            Tu tiro
          </span>
        </p>
      </div>

      {/* Clasificación del grupo */}
      <div className={styles.seccion}>
        <h2 className={['t-section', styles.seccionTitulo].join(' ')}>Clasificación</h2>
        {FIXTURE_MARCADOR.map((j, i) => {
          const esYo = j.nombre === MI_RESULTADO.nombre
          const rank = i < 3 ? ((i + 1) as 1 | 2 | 3) : undefined
          return (
            <div key={j.nombre} className={[styles.fila, esYo ? styles.yo : ''].join(' ')}>
              <span
                className={[styles.filaPosicion, rank ? styles[`medal${i + 1}`] : ''].join(' ')}
              >
                {rank ? <IconMedalla size={22} rank={rank} /> : `${i + 1}.`}
              </span>
              <span className={styles.filaAvatar}>{j.inicial}</span>
              <div className={styles.filaInfo}>
                <div className={styles.filaNombre}>
                  {j.nombre}
                  {esYo && (
                    <span
                      style={{
                        marginLeft: 'var(--space-2)',
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--accent)',
                        fontWeight: 'var(--font-weight-semibold)',
                      }}
                    >
                      (tú)
                    </span>
                  )}
                </div>
                <div className={styles.filaDistancia}>
                  {j.distanciaKm < 5
                    ? `${(j.distanciaKm * 1000).toFixed(0)} m`
                    : `${j.distanciaKm} km`}{' '}
                  de distancia
                </div>
              </div>
              <span className={styles.filaPuntos}>{j.puntos.toLocaleString()}</span>
            </div>
          )
        })}
      </div>

      {/* CTA al final del feed */}
      <Button variant="secondary" size="lg" fullWidth style={{ marginTop: 'var(--space-3)' }}>
        Volver al viaje
      </Button>
    </ShellFeed>
  )
}
