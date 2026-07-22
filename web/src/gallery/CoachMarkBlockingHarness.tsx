// Harness de la GALERÍA para el modo `blocking` de `CoachMark` (issue #888).
//
// Por qué existe: el bug de #887 (coach-mark `pointer-events:none` sobre un mapa
// Leaflet/Google VIVO — arrastraba el mapa, "Siguiente" no recibía el toque) se
// escapó porque la galería/a11y/E2E SIEMPRE montan mapas STUBEADOS/de mentira
// (planos, sin listeners): el camino "toque real contra un elemento interactivo
// debajo del coach-mark" nunca se ejercitó. Este harness sustituye el mapa por un
// `<button>` a pantalla completa que SÍ reacciona al toque (cambia de texto), así
// un test de Playwright real (no jsdom, que ignora `pointer-events` al hacer
// hit-testing) puede aserter que el scrim bloqueante lo protege — ver
// `e2e/gallery-coachmark-blocking.spec.ts`.
import { useRef, useState } from 'react'
import { CoachMark } from '../features/onboarding/CoachMark'

export function CoachMarkBlockingHarness() {
  const targetRef = useRef<HTMLButtonElement | null>(null)
  // Si el scrim NO bloqueara (regresión del bug), tocar el "mapa" lo dispararía.
  const [mapTouched, setMapTouched] = useState(false)
  const [step, setStep] = useState<'coach' | 'done'>('coach')

  return (
    <div
      style={{
        position: 'relative',
        height: '100dvh',
        overflow: 'hidden',
        background: 'var(--scene-bg)',
      }}
    >
      {/* "Mapa" de resultado simulado, pero REALMENTE interactivo (a diferencia de
          los stubs planos de la galería): ocupa casi toda la pantalla, como el mapa
          real del reveal. */}
      <button
        type="button"
        ref={targetRef}
        data-testid="fake-map"
        onClick={() => setMapTouched(true)}
        aria-label="Mapa de resultado (simulado, para el test de bloqueo)"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          border: 'none',
          background: 'var(--scene-surface)',
          color: 'var(--scene-ink)',
          font: 'inherit',
          fontSize: 18,
        }}
      >
        {mapTouched ? 'mapa: TOCADO (bug de #888 si esto se ve)' : 'mapa: intacto'}
      </button>

      {step === 'coach' && (
        <CoachMark
          targetRef={targetRef}
          step="Paso 1 de 1"
          title="Esto marcaron los demás"
          body="Coach-mark bloqueante (issue #888): el mapa de debajo no debe reaccionar al toque."
          ariaLabel="Esto marcaron los demás"
          dismissLabel="Saltar"
          primaryAction={{ label: 'Siguiente', onClick: () => setStep('done') }}
          onDismiss={() => setStep('done')}
          blocking
        />
      )}

      {step === 'done' && (
        <p
          data-testid="coach-done"
          role="status"
          style={{ position: 'absolute', top: 16, left: 16, color: 'var(--scene-ink)' }}
        >
          Siguiente: OK
        </p>
      )}
    </div>
  )
}
