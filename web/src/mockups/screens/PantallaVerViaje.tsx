// PantallaVerViaje — pantalla 2/5 del camino feliz (mockup).
//
// ShellInmersivo: globo/mapa protagonista arriba + hoja con SegmentedControl
// Diario | Marcador. Patrón Polarsteps.
// Caption sobre el globo: nombre del viaje. Hoja sin título (regla dura: ¡nunca los dos!).

import { useState } from 'react'
import { AppHeader, SegmentedControl, type SegmentedOption } from '../../ui'
import { ShellInmersivo } from '../shells/ShellInmersivo'
import { FIXTURE_VIAJE, FIXTURE_MOMENTOS, FIXTURE_MARCADOR } from './fixtures'
import styles from './PantallaVerViaje.module.css'

type Tab = 'diario' | 'marcador'

const TAB_OPTIONS: readonly SegmentedOption<Tab>[] = [
  { value: 'diario', label: 'Diario' },
  { value: 'marcador', label: 'Marcador' },
]

// Globo del viaje (mapa stub con aspecto de globo terráqueo).
function GloboViaje() {
  return (
    <div className={styles.globo}>
      <div className={styles.tierra} />
      <div className={styles.japon} />
      <div className={styles.ruta} />
      <div className={styles.velo} />
    </div>
  )
}

export function PantallaVerViaje() {
  const [tab, setTab] = useState<Tab>('diario')

  return (
    <ShellInmersivo
      backdrop={<GloboViaje />}
      header={
        <AppHeader
          title={undefined}
          onLead={() => {}}
          lead="back"
          leadLabel="Volver a mis viajes"
          variant="floating"
        />
      }
      // Caption editorial con el nombre del viaje (sobre el globo).
      // NO hay sheetTitle porque caption y sheetTitle son mutuamente excluyentes.
      caption={
        <div className={styles.captionInner}>
          <span className="t-label" style={{ color: 'var(--scene-ink-soft)' }}>
            {FIXTURE_VIAJE.fechas}
          </span>
          <h1 className="t-hero" style={{ color: 'var(--scene-ink)' }}>
            {FIXTURE_VIAJE.nombre}
          </h1>
        </div>
      }
    >
      {/* SegmentedControl como primera pieza dentro de la hoja */}
      <SegmentedControl
        options={TAB_OPTIONS}
        value={tab}
        onChange={setTab}
        label="Secciones del viaje"
      />

      <div style={{ marginTop: 'var(--space-4)' }}>
        {tab === 'diario' ? <TabDiario /> : <TabMarcador />}
      </div>
    </ShellInmersivo>
  )
}

// Tab Diario: lista de momentos (foto + lugar + fecha).
function TabDiario() {
  return (
    <div className={styles.diario}>
      {FIXTURE_MOMENTOS.map((m) => (
        <div key={m.id} className={styles.momento}>
          <div className={styles.momentoEmoji}>{m.emoji}</div>
          <div className={styles.momentoInfo}>
            <div className={['t-body', styles.momentoTitulo].join(' ')}>{m.titulo}</div>
            <div className={styles.momentoMeta}>
              <span className="t-caption">{m.lugar}</span>
              <span className="t-caption">·</span>
              <span className="t-caption">{m.fecha}</span>
              {m.tieneReto && <span className={styles.retoBadge}>Reto</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// Tab Marcador: tabla de clasificación por puntos.
function TabMarcador() {
  return (
    <div className={styles.marcador}>
      {FIXTURE_MARCADOR.map((j, i) => (
        <div key={j.nombre} className={styles.fila}>
          <span className={[styles.filaPosicion, i === 0 ? styles.top : ''].join(' ')}>
            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
          </span>
          <span className={styles.filaAvatar}>{j.emoji}</span>
          <div className={styles.filaInfo}>
            <div className={styles.filaNombre}>{j.nombre}</div>
            <div className={styles.filaDistancia}>
              {j.distanciaKm < 5 ? `${(j.distanciaKm * 1000).toFixed(0)} m` : `${j.distanciaKm} km`}{' '}
              de distancia media
            </div>
          </div>
          <span className={styles.filaPuntos}>{j.puntos.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}
