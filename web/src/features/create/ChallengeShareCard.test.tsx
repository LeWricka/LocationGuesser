import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { ChallengeShareCard } from './ChallengeShareCard'

// Tarjeta-IMAGEN del reto (issue #595/#974): componente presentacional puro. Los
// tests guardan el síntoma reportado en prod — el chip «Un viaje» cuando faltaba
// el nombre real del viaje — y que la portada resuelta se pinta de fondo.

describe('ChallengeShareCard — chip del viaje y portada (#974)', () => {
  test('con nombre de viaje real: pinta ese nombre como chip', () => {
    render(
      <ChallengeShareCard
        ref={createRef()}
        challengeTitle="¿Dónde desayuné?"
        groupName="Lisboa"
        kind="location"
        coverDataUrl={null}
        domain="momentu.art"
      />,
    )
    expect(screen.getByText('Lisboa')).toBeTruthy()
    expect(screen.queryByText('Un viaje')).toBeNull()
  })

  test('sin nombre de viaje (null): cae al genérico «Un viaje»', () => {
    // Era exactamente el bug: App.tsx montaba el flujo SIN groupName y el chip
    // caía aquí. El fix pasa el nombre real; este test fija el fallback esperado.
    render(
      <ChallengeShareCard
        ref={createRef()}
        challengeTitle="¿Dónde desayuné?"
        groupName={null}
        kind="location"
        coverDataUrl={null}
        domain="momentu.art"
      />,
    )
    expect(screen.getByText('Un viaje')).toBeTruthy()
  })

  test('con portada resuelta (data URL): la pinta como fondo, sin escena de marca', () => {
    const { container } = render(
      <ChallengeShareCard
        ref={createRef()}
        challengeTitle="¿Dónde desayuné?"
        groupName="Lisboa"
        kind="location"
        coverDataUrl="data:image/jpeg;base64,AAAA"
        domain="momentu.art"
      />,
    )
    const media = container.querySelector('[aria-hidden="true"]') as HTMLElement
    expect(media.style.backgroundImage).toContain('data:image/jpeg;base64,AAAA')
  })
})
