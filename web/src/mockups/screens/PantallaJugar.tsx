// PantallaJugar — "Jugar / Adivinar" (mockup). GeoGuessr de verdad.
//
// Street View a pantalla completa = el juego. NO hay popup/hoja "¿Dónde es esto?".
// Mini-mapa en la esquina que se EXPANDE para clavar el tiro. Cuenta atrás arriba.
// El "Clavar tiro" se hace desde el mini-mapa expandido.

import { useState } from 'react'
import { AppHeader, Button } from '../../ui'
import { StreetViewStub } from './StreetViewStub'
import { MapStub } from './MapStub'
import { IconDiana } from '../icons/MockupIcons'
import styles from './PantallaJugar.module.css'

export function PantallaJugar() {
  // Mini-mapa colapsado (esquina) ↔ expandido (clavar tiro). Arranca expandido
  // para que la captura muestre el gesto clave; el andamiaje MOCKUP conmuta.
  const [expandido, setExpandido] = useState(true)

  return (
    <div className={styles.root}>
      {/* Street View a pantalla completa = el juego */}
      <div className={styles.scene}>
        <StreetViewStub />
      </div>

      {/* Cabecera flotante con cuenta atrás (sin título: es el juego) */}
      <div className={styles.header}>
        <AppHeader
          title={undefined}
          onLead={() => {}}
          lead="close"
          leadLabel="Salir del reto"
          variant="floating"
          action={<CuentaAtras />}
        />
      </div>

      {/* Mini-mapa: colapsado en la esquina, o expandido para clavar el tiro. */}
      {expandido ? (
        <div className={styles.mapaExpandido}>
          <div className={styles.mapaExpandidoScene}>
            <MapStub />
            <IconDiana size={30} className={styles.diana} />
          </div>
          <Button variant="primary" size="lg" fullWidth>
            Clavar tiro
          </Button>
        </div>
      ) : (
        <button
          type="button"
          className={styles.miniMapa}
          onClick={() => setExpandido(true)}
          aria-label="Abrir el mapa para clavar el tiro"
        >
          <MapStub />
          <span className={styles.miniMapaHint}>
            <IconDiana size={16} />
          </span>
        </button>
      )}

      {/* Andamiaje de MOCKUP: conmuta mini-mapa colapsado / expandido. */}
      <div className={styles.scaffold}>
        <span className={styles.scaffoldLabel}>MOCKUP · mapa</span>
        <div className={styles.scaffoldBtns}>
          <button
            type="button"
            className={[styles.scaffoldBtn, expandido ? styles.activo : ''].join(' ')}
            onClick={() => setExpandido(true)}
          >
            Expandido
          </button>
          <button
            type="button"
            className={[styles.scaffoldBtn, !expandido ? styles.activo : ''].join(' ')}
            onClick={() => setExpandido(false)}
          >
            Esquina
          </button>
        </div>
      </div>
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
