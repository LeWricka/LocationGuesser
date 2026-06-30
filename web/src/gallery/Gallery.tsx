// Galería: índice de pantallas + render de un caso aislado. Sin `?case=` muestra el
// índice (lista de enlaces por sección). Con `?case=<id>` monta SOLO esa pantalla a
// pantalla completa, lista para la captura de Playwright. Es una herramienta de
// DESARROLLO (entry aparte de la app real; no entra en el build de producción).

import { useMemo } from 'react'
import { cases, findCase } from './cases'

function currentCaseId(): string | null {
  return new URLSearchParams(window.location.search).get('case')
}

export function Gallery() {
  const caseId = currentCaseId()
  const active = useMemo(() => findCase(caseId), [caseId])

  if (caseId) {
    if (!active) {
      return (
        <main style={{ padding: 24, color: '#f6f7f9', fontFamily: 'system-ui' }}>
          <p>
            Caso no encontrado: <code>{caseId}</code>
          </p>
          <a href="?" style={{ color: '#9ec3e6' }}>
            ← Volver al índice
          </a>
        </main>
      )
    }
    // El caso prepara su mundo (p.ej. mundo vacío) antes de montar la pantalla.
    active.setup?.()
    return <>{active.render()}</>
  }

  return <Index />
}

function Index() {
  const bySection = new Map<string, typeof cases>()
  for (const c of cases) {
    const list = bySection.get(c.section) ?? []
    list.push(c)
    bySection.set(c.section, list)
  }

  return (
    <main
      style={{
        padding: '32px 24px',
        maxWidth: 720,
        margin: '0 auto',
        color: '#f6f7f9',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>Galería de pantallas</h1>
      <p style={{ opacity: 0.7, marginTop: 0 }}>
        {cases.length} casos con fixtures deterministas (sin login ni red). Toca uno para verlo
        aislado a pantalla completa.
      </p>
      {[...bySection.entries()].map(([section, list]) => (
        <section key={section} style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 16, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.6 }}>
            {section}
          </h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {list.map((c) => (
              <li key={c.id}>
                <a
                  href={`?case=${encodeURIComponent(c.id)}`}
                  style={{
                    display: 'block',
                    padding: '12px 16px',
                    background: '#1b1d24',
                    borderRadius: 10,
                    color: '#f6f7f9',
                    textDecoration: 'none',
                  }}
                >
                  <strong>{c.title}</strong>
                  <span style={{ display: 'block', opacity: 0.5, fontSize: 13 }}>{c.id}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  )
}
