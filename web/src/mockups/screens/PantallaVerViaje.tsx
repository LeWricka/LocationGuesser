// PantallaVerViaje — pantalla 2/5 del camino feliz (mockup).
//
// ShellInmersivo: globo/mapa protagonista arriba + hoja con SegmentedControl
// Diario | Marcador. Patrón Polarsteps.
// Caption sobre el globo: nombre del viaje. Hoja sin título (regla dura: ¡nunca los dos!).

import { useState } from 'react'
import { AppHeader, SegmentedControl, type SegmentedOption } from '../../ui'
import { ShellInmersivo } from '../shells/ShellInmersivo'
import { IconReto, IconMedalla } from '../icons/MockupIcons'
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
      // sheetTitle con el nombre del viaje (dentro de la hoja).
      // La pantalla de producción usará caption sobre el protagonista, pero para
      // el mockup esto garantiza visibilidad sin batallas de z-index/GPU.
      sheetTitle={
        <div className={styles.captionInner}>
          <span
            className="t-label"
            style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}
          >
            {FIXTURE_VIAJE.fechas}
          </span>
          <span className="t-section" style={{ color: 'var(--color-text)', display: 'block' }}>
            {FIXTURE_VIAJE.nombre}
          </span>
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

// Tab Diario: FOTO-FIRST (estilo Polarsteps). Cada momento es una tarjeta con
// imagen grande a ancho completo; título+lugar+fecha sobre un velo en la foto.
// Los retos de ubicación (sin foto) muestran una miniatura de SV/mapa + chip "Reto".
function TabDiario() {
  return (
    <div className={styles.diario}>
      {FIXTURE_MOMENTOS.map((m) => (
        <article key={m.id} className={styles.momento}>
          {m.tipo === 'foto' ? (
            <img className={styles.momentoFoto} src={m.foto} alt={m.titulo} loading="lazy" />
          ) : (
            // Reto de ubicación: no hay foto → miniatura de Street View/mapa stub.
            <div className={styles.momentoReto} aria-hidden="true">
              <div className={styles.momentoRetoScene} />
              <span className={styles.retoChipFloat}>
                <IconReto size={14} />
                Reto
              </span>
            </div>
          )}
          {/* Velo + texto sobre la imagen (título + lugar + fecha) */}
          <div className={styles.momentoOverlay}>
            <h3 className={styles.momentoTitulo}>{m.titulo}</h3>
            <div className={styles.momentoMeta}>
              <span>{m.lugar}</span>
              <span className={styles.metaDot}>·</span>
              <span>{m.fecha}</span>
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}

// Tab Marcador: clasificación por puntos. Medalla custom (oro/plata/bronce) para
// el podio; avatar = círculo con inicial (sin emoji).
function TabMarcador() {
  return (
    <div className={styles.marcador}>
      {FIXTURE_MARCADOR.map((j, i) => {
        const rank = i < 3 ? ((i + 1) as 1 | 2 | 3) : undefined
        return (
          <div key={j.nombre} className={styles.fila}>
            <span className={[styles.filaPosicion, styles[`medal${i + 1}`] ?? ''].join(' ')}>
              {rank ? <IconMedalla size={22} rank={rank} /> : `${i + 1}`}
            </span>
            <span className={styles.filaAvatar}>{j.inicial}</span>
            <div className={styles.filaInfo}>
              <div className={styles.filaNombre}>{j.nombre}</div>
              <div className={styles.filaDistancia}>
                {j.distanciaKm < 5
                  ? `${(j.distanciaKm * 1000).toFixed(0)} m`
                  : `${j.distanciaKm} km`}{' '}
                de distancia media
              </div>
            </div>
            <span className={styles.filaPuntos}>{j.puntos.toLocaleString()}</span>
          </div>
        )
      })}
    </div>
  )
}
