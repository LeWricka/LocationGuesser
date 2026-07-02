// PantallaCrearReto — "Crear ¿Dónde?" (mockup). SV OPERATIVO, no decorativo.
//
// El Street View es la herramienta de trabajo a pantalla completa: pones el pin
// moviéndote dentro del propio panorama. Chrome MÍNIMO (una barra compacta abajo),
// NO una hoja grande decorativa. La posición del panorama ES la respuesta.
//
// "Sin cobertura" se resuelve INLINE (aviso breve + CTA deshabilitado), sin
// pantalla aparte. El andamiaje MOCKUP conmuta entre ambos estados.

import { useState } from 'react'
import { AppHeader, Button, Banner } from '../../ui'
import { StreetViewStub } from './StreetViewStub'
import { IconCandado } from '../icons/MockupIcons'
import { FIXTURE_UBICACION } from './fixtures'
import styles from './PantallaCrearReto.module.css'

type Estado = 'street-view' | 'sin-cobertura'

export function PantallaCrearReto() {
  const [estado, setEstado] = useState<Estado>('street-view')
  const sinCobertura = estado === 'sin-cobertura'

  return (
    <div className={styles.root}>
      {/* Street View a pantalla completa = herramienta operativa */}
      <div className={styles.scene}>
        <StreetViewStub label={FIXTURE_UBICACION.label} showGps={true} />
      </div>

      {/* Cabecera flotante mínima */}
      <div className={styles.header}>
        <AppHeader
          title={undefined}
          onLead={() => {}}
          lead="close"
          leadLabel="Cancelar"
          variant="floating"
        />
      </div>

      {/* Barra de controles compacta abajo (chrome mínimo, NO hoja grande) */}
      <div className={styles.controls}>
        {sinCobertura ? (
          <Banner tone="aviso">
            No hay Street View en este punto. Muévete a una calle con cobertura: sin Street View no
            se puede crear el reto.
          </Banner>
        ) : (
          <div className={styles.privacidad}>
            <IconCandado size={16} className={styles.privacidadIcon} />
            <span className={styles.privacidadTexto}>Nadie verá la ubicación hasta que acabe</span>
          </div>
        )}

        <div className={styles.controlsRow}>
          <span className={styles.tituloBreve}>Este es tu sitio</span>
          <Button variant="primary" size="lg" disabled={sinCobertura}>
            Lanzar el reto
          </Button>
        </div>
      </div>

      {/* Andamiaje de MOCKUP (no es UI de producto): conmuta los 2 estados inline. */}
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
              {e === 'street-view' ? 'Con SV' : 'Sin SV'}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
