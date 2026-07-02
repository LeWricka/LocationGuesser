// MockupIndex — visor navegable de los mockups del camino feliz.
//
// Acceso: añade `#mockups` al hash para activarlo. Si no hay `#mockups`, la app
// arranca normalmente (sin romper el flujo de producción).
//
// Navegación:
//  - Barra superior: ← prev | contador | → next | ≡ índice
//  - Panel de índice (toggle): lista de todas las pantallas con nombre y shell
//  - Navegación prev/siguiente envuelve (circular)

import { useState } from 'react'
import { PantallaEntrar } from './screens/PantallaEntrar'
import { PantallaVerViaje } from './screens/PantallaVerViaje'
import { PantallaCrearReto } from './screens/PantallaCrearReto'
import { PantallaJugar } from './screens/PantallaJugar'
import { PantallaMarcador } from './screens/PantallaMarcador'
import styles from './MockupIndex.module.css'

interface MockupPantalla {
  id: string
  nombre: string
  shell: string
  render: () => React.ReactElement
}

// Registro de las 5 pantallas del camino feliz.
// PantallaCrearReto tiene 3 sub-estados; registramos los 3 para la galería.
const PANTALLAS: MockupPantalla[] = [
  {
    id: 'entrar',
    nombre: 'Entrar',
    shell: 'ShellUtilitario',
    render: () => <PantallaEntrar />,
  },
  {
    id: 'ver-viaje',
    nombre: 'Ver viaje',
    shell: 'ShellInmersivo',
    render: () => <PantallaVerViaje />,
  },
  {
    id: 'crear-reto-ubicacion',
    nombre: 'Crear reto — Ubicación',
    shell: 'ShellInmersivo',
    render: () => <PantallaCrearReto estadoInicial="ubicacion" />,
  },
  {
    id: 'crear-reto-sv',
    nombre: 'Crear reto — Confirmar Street View',
    shell: 'ShellInmersivo',
    render: () => <PantallaCrearReto estadoInicial="confirmar-sv" />,
  },
  {
    id: 'crear-reto-sin-sv',
    nombre: 'Crear reto — Sin cobertura SV',
    shell: 'ShellInmersivo',
    render: () => <PantallaCrearReto estadoInicial="sin-cobertura" />,
  },
  {
    id: 'jugar',
    nombre: 'Jugar / Adivinar',
    shell: 'ShellInmersivo',
    render: () => <PantallaJugar />,
  },
  {
    id: 'marcador',
    nombre: 'Marcador / Resultado',
    shell: 'ShellFeed',
    render: () => <PantallaMarcador />,
  },
]

// Exponer la lista para Playwright (igual que window.__galleryCases en la galería).
// Permite que el script de captura recorra los mockups sin hardcodear los IDs.
if (typeof window !== 'undefined') {
  ;(window as Window & { __mockupPantallas?: typeof PANTALLAS }).__mockupPantallas = PANTALLAS
}

export { PANTALLAS }

export function MockupIndex() {
  const [idx, setIdx] = useState(0)
  const [showIndex, setShowIndex] = useState(false)

  const pantalla = PANTALLAS[idx]
  const total = PANTALLAS.length

  function prev() {
    setIdx((i) => (i - 1 + total) % total)
    setShowIndex(false)
  }
  function next() {
    setIdx((i) => (i + 1) % total)
    setShowIndex(false)
  }
  function goTo(i: number) {
    setIdx(i)
    setShowIndex(false)
  }

  return (
    <div className={styles.root}>
      {/* Barra de navegación */}
      <nav className={styles.nav}>
        <button className={styles.navBtn} onClick={prev} aria-label="Pantalla anterior">
          ←
        </button>
        <div className={styles.navTitle}>{pantalla.nombre}</div>
        <span className={styles.counter}>
          {idx + 1}/{total}
        </span>
        <button className={styles.navBtn} onClick={next} aria-label="Pantalla siguiente">
          →
        </button>
        <button
          className={styles.menuBtn}
          onClick={() => setShowIndex((s) => !s)}
          aria-label="Ver índice de pantallas"
        >
          ≡
        </button>
      </nav>

      {/* La pantalla mockup activa */}
      <div className={styles.screen}>{pantalla.render()}</div>

      {/* Panel de índice (toggle) */}
      {showIndex && (
        <div className={styles.indexPanel} role="dialog" aria-label="Índice de pantallas">
          <div className={styles.indexTitle}>Pantallas del camino feliz</div>
          {PANTALLAS.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={[styles.indexItem, i === idx ? styles.activo : ''].join(' ')}
              onClick={() => goTo(i)}
            >
              <span className={styles.indexItemNum}>{i + 1}.</span>
              <span>
                <div className={styles.indexItemNombre}>{p.nombre}</div>
                <div className={styles.indexItemShell}>{p.shell}</div>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
