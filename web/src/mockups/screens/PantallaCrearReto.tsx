// PantallaCrearReto — pantalla "Crear ¿Dónde?" del camino feliz (mockup).
//
// FLUJO SIMPLIFICADO: un solo paso = Street View directo. El usuario se mueve
// DENTRO del propio Street View (seedeado por "tu ubicación") hasta su sitio
// exacto; la posición del panorama ES la respuesta del reto. No hay paso de mapa.
//
// Dos sub-estados:
//   (a) street-view: SV a sangre + hoja con privacidad + CTA "Lanzar el reto"
//   (b) sin-cobertura: si el punto no tiene SV, se avisa y el CTA se deshabilita.

import { useState } from 'react'
import { AppHeader, Button, Banner } from '../../ui'
import { ShellInmersivo } from '../shells/ShellInmersivo'
import { StreetViewStub } from './StreetViewStub'
import { FIXTURE_UBICACION } from './fixtures'
import styles from './PantallaCrearReto.module.css'

type Estado = 'street-view' | 'sin-cobertura'

interface Props {
  /** Estado inicial para mostrar en la galería. Por defecto 'street-view'. */
  estadoInicial?: Estado
}

export function PantallaCrearReto({ estadoInicial = 'street-view' }: Props) {
  const [estado, setEstado] = useState<Estado>(estadoInicial)

  return (
    <ShellInmersivo
      // Protagonista único: Street View a sangre, con chip de lugar (dónde cae el
      // panorama). El GPS de recentrar se omite en el mockup: con la hoja alta
      // quedaría tapado; es afordancia opcional que se resolverá en producto.
      backdrop={<StreetViewStub label={FIXTURE_UBICACION.label} />}
      header={
        <AppHeader
          title={undefined}
          onLead={() => {}}
          lead="close"
          leadLabel="Cancelar"
          variant="floating"
        />
      }
      // Regla dura caption XOR sheetTitle: SIN caption flotante sobre el SV;
      // el título vive en la hoja.
      sheetTitle={estado === 'street-view' ? 'Este es tu sitio.' : 'Sin Street View aquí'}
      cta={
        estado === 'street-view' ? (
          <Button variant="primary" size="lg" fullWidth>
            Lanzar el reto
          </Button>
        ) : (
          // Sin cobertura: no se puede crear el reto → CTA deshabilitado.
          <Button variant="primary" size="lg" fullWidth disabled>
            Lanzar el reto
          </Button>
        )
      }
    >
      {/* Andamiaje de MOCKUP (no es UI de producto): conmuta entre los sub-estados
          de esta pantalla. Estilo deliberadamente "de herramienta" (etiqueta MOCKUP,
          borde discontinuo, monoespaciado) para que no se confunda con tabs reales. */}
      <div className={styles.scaffold}>
        <span className={styles.scaffoldLabel}>MOCKUP · estado</span>
        <div className={styles.scaffoldBtns}>
          {(['street-view', 'sin-cobertura'] as Estado[]).map((e) => (
            <button
              key={e}
              type="button"
              className={[styles.scaffoldBtn, estado === e ? styles.activo : ''].join(' ')}
              onClick={() => setEstado(e)}
            >
              {e === 'street-view' ? 'Street View' : 'Sin SV'}
            </button>
          ))}
        </div>
      </div>

      {estado === 'street-view' ? <ContenidoStreetView /> : <ContenidoSinCobertura />}
    </ShellInmersivo>
  )
}

// Contenido de la hoja en estado normal (Street View con cobertura).
// El título "Este es tu sitio." va en sheetTitle; aquí una sola línea de ayuda
// + la única frase de privacidad (tarjeta-candado).
function ContenidoStreetView() {
  return (
    <div className={styles.confirmacion}>
      <p className="t-body" style={{ color: 'var(--color-text-muted)' }}>
        Muévete por el Street View hasta el punto exacto. Así lo verán tus compañeros.
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

// Contenido cuando el punto no tiene cobertura de Street View: sin SV no se
// puede crear el reto (ni, por tanto, jugarlo).
function ContenidoSinCobertura() {
  return (
    <div className={styles.confirmacion}>
      <Banner tone="aviso">
        No hay Street View en este punto. Muévete o busca una calle con cobertura: sin Street View
        no se puede crear el reto.
      </Banner>
    </div>
  )
}
