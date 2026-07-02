// PantallaJugar — pantalla 4/5 del camino feliz (mockup).
//
// ShellInmersivo: Street View protagonista a sangre para explorar.
// Mini-mapa en esquina inferior derecha (expandible) para clavar el tiro.
// Cuenta atrás insinuada en la cabecera. CTA "Clavar tiro".
//
// Caption sobre el SV: instrucción de navegación. Hoja con mini-mapa e instrucción.

import { AppHeader, Button } from '../../ui'
import { ShellInmersivo } from '../shells/ShellInmersivo'
import { StreetViewStub } from './StreetViewStub'
import { MapStub } from './MapStub'
import styles from './PantallaJugar.module.css'

export function PantallaJugar() {
  return (
    <ShellInmersivo
      backdrop={<StreetViewStub />}
      header={
        <AppHeader
          title={undefined}
          onLead={() => {}}
          lead="close"
          leadLabel="Salir del reto"
          variant="floating"
          action={<CuentaAtras />}
        />
      }
      // Caption: instrucción de exploración sobre el SV.
      // La hoja no tiene sheetTitle (regla dura cumplida).
      caption={
        <span className="t-caption" style={{ color: 'var(--scene-ink-soft)' }}>
          Pasea y reconoce el lugar
        </span>
      }
      cta={
        <Button variant="primary" size="lg" fullWidth>
          Clavar tiro
        </Button>
      }
    >
      {/* Mini-mapa para clavar el tiro: flota sobre la hoja (posición absoluta
          en el shell, porque la hoja tiene overflow:hidden que lo cortaría) */}
      <div className={styles.instruccion}>
        <h2
          className="t-section"
          style={{ color: 'var(--color-text)', marginBottom: 'var(--space-1)' }}
        >
          ¿Dónde es esto?
        </h2>
        <p className="t-body" style={{ color: 'var(--color-text-muted)' }}>
          Toca el mapa para clavar tu tiro. El más cercano gana.
        </p>
      </div>
      <p className={styles.pista}>Toca el mapa para ampliar · Arrastra para mover el pin</p>
    </ShellInmersivo>
  )
}

// Mini-mapa superpuesto: flota en la esquina inferior derecha del shell.
// No puede ir dentro de sheetInner (overflow la corta): se renderiza como
// hermano del shell en MockupIndexWrapper, pero para el mockup lo dejamos como
// elemento absoluto dentro del contenedor de PantallaJugar.
export function MiniMapaFlotante() {
  return (
    <div className={styles.miniMapa}>
      <MapStub pinEmoji="🎯" showGps={false} />
    </div>
  )
}

// Cuenta atrás en la cabecera (pastilla translúcida sobre el SV).
function CuentaAtras() {
  return (
    <div className={styles.cuentaAtras}>
      <span className={styles.cuentaAtrasNum}>0:24</span>
      <span className={styles.cuentaAtrasLabel}>restante</span>
    </div>
  )
}
