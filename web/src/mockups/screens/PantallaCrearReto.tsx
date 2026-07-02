// PantallaCrearReto — pantalla 3/5 del camino feliz (mockup).
//
// "¿Dónde?" = GeoGuessr puro: SIN foto, SIN historia.
// Dos sub-estados navegables:
//   (a) Ubicación: mapa a sangre + pin ajustable + botón GPS; hoja con CTA "Ver el Street View"
//   (b) Confirmar SV: Street View a sangre + hoja con aviso de privacidad + CTA "Lanzar el reto"
//
// También muestra el estado "sin cobertura de SV" cuando se selecciona.

import { useState } from 'react'
import { AppHeader, Button, Banner } from '../../ui'
import { ShellInmersivo } from '../shells/ShellInmersivo'
import { MapStub } from './MapStub'
import { StreetViewStub } from './StreetViewStub'
import { FIXTURE_UBICACION } from './fixtures'
import styles from './PantallaCrearReto.module.css'

type Estado = 'ubicacion' | 'confirmar-sv' | 'sin-cobertura'

interface Props {
  /** Estado inicial para mostrar en la galería. Por defecto 'ubicacion'. */
  estadoInicial?: Estado
}

export function PantallaCrearReto({ estadoInicial = 'ubicacion' }: Props) {
  const [estado, setEstado] = useState<Estado>(estadoInicial)

  // El backdrop cambia según el estado:
  // - ubicacion: mapa a sangre con pin ajustable
  // - confirmar-sv / sin-cobertura: Street View (o mapa vacío con aviso)
  const backdrop =
    estado === 'ubicacion' || estado === 'sin-cobertura' ? (
      <MapStub label={FIXTURE_UBICACION.label} pinEmoji="📍" showGps={true} />
    ) : (
      <StreetViewStub />
    )

  return (
    <ShellInmersivo
      backdrop={backdrop}
      header={
        <AppHeader
          title={undefined}
          onLead={() => {}}
          lead="close"
          leadLabel="Cancelar"
          variant="floating"
        />
      }
      // Regla dura caption XOR sheetTitle: cada estado usa SOLO el título de la hoja.
      // (Antes ubicacion tenía caption + título repitiendo "el pin/tu ubicación".)
      sheetTitle={
        estado === 'ubicacion'
          ? '¿Dónde estás?'
          : estado === 'confirmar-sv'
            ? 'Este es tu sitio.'
            : 'Sin Street View aquí'
      }
      cta={
        <EstadoCTA
          estado={estado}
          onNext={() => setEstado('confirmar-sv')}
          onSinCobertura={() => setEstado('sin-cobertura')}
        />
      }
    >
      {/* Andamiaje de MOCKUP (no es UI de producto): conmuta entre los sub-estados
          de esta pantalla. Estilo deliberadamente "de herramienta" (etiqueta MOCKUP,
          borde discontinuo, monoespaciado) para que no se confunda con tabs reales. */}
      <div className={styles.scaffold}>
        <span className={styles.scaffoldLabel}>MOCKUP · estado</span>
        <div className={styles.scaffoldBtns}>
          {(['ubicacion', 'confirmar-sv', 'sin-cobertura'] as Estado[]).map((e) => (
            <button
              key={e}
              type="button"
              className={[styles.scaffoldBtn, estado === e ? styles.activo : ''].join(' ')}
              onClick={() => setEstado(e)}
            >
              {e === 'ubicacion' ? 'Ubicación' : e === 'confirmar-sv' ? 'Confirmar SV' : 'Sin SV'}
            </button>
          ))}
        </div>
      </div>

      {estado === 'ubicacion' && <ContenidoUbicacion />}
      {estado === 'confirmar-sv' && <ContenidoConfirmarSV />}
      {estado === 'sin-cobertura' && <ContenidoSinCobertura />}
    </ShellInmersivo>
  )
}

// CTA principal según el estado.
function EstadoCTA({
  estado,
  onNext,
  onSinCobertura,
}: {
  estado: Estado
  onNext: () => void
  onSinCobertura: () => void
}) {
  if (estado === 'ubicacion') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <Button variant="primary" size="lg" fullWidth onClick={onNext}>
          Ver el Street View
        </Button>
        <Button variant="ghost" size="md" fullWidth onClick={onSinCobertura}>
          Simular sin cobertura
        </Button>
      </div>
    )
  }
  if (estado === 'confirmar-sv') {
    return (
      <Button variant="primary" size="lg" fullWidth>
        Lanzar el reto
      </Button>
    )
  }
  // sin-cobertura: botón deshabilitado
  return (
    <Button variant="primary" size="lg" fullWidth disabled>
      Ver el Street View
    </Button>
  )
}

// Contenido de la hoja en estado "Ubicación".
// El título "¿Dónde estás?" va en sheetTitle; aquí solo la ayuda (sin repetir).
function ContenidoUbicacion() {
  return (
    <div className={styles.instruccion}>
      <p className="t-body" style={{ color: 'var(--color-text-muted)' }}>
        Centra el pin en tu ubicación. Luego verás el Street View para confirmar.
      </p>
    </div>
  )
}

// Contenido de la hoja en estado "Confirmar SV".
// Una sola frase de privacidad (la tarjeta-candado); el subtítulo aporta algo
// distinto (qué verán) sin repetir el "nadie sabrá dónde es".
function ContenidoConfirmarSV() {
  return (
    <div className={styles.confirmacion}>
      <p className="t-body" style={{ color: 'var(--color-text-muted)' }}>
        Así es como lo verán tus compañeros.
      </p>
      <div className={styles.nota}>
        <span className={styles.notaEmoji}>🔒</span>
        <p className="t-caption" style={{ color: 'var(--accent)' }}>
          Nadie verá la ubicación real hasta que el reto acabe.
        </p>
      </div>
    </div>
  )
}

// Contenido cuando no hay cobertura de Street View.
function ContenidoSinCobertura() {
  return (
    <div className={styles.confirmacion}>
      <Banner tone="aviso">
        No hay cobertura de Street View en este punto. Mueve el pin a una calle con cobertura para
        poder lanzar el reto.
      </Banner>
      <p className="t-body" style={{ color: 'var(--color-text-muted)' }}>
        Prueba en una calle principal o en el centro del pueblo más cercano.
      </p>
    </div>
  )
}
