import { useState } from 'react'
import { CreateChallenge } from './features/create/CreateChallenge'
import { Button, Card, Stack } from './ui'
import styles from './App.module.css'

type View = 'home' | 'create'

// Cómo funciona, en tres pasos. Pequeño "onboarding" que sienta el tono de
// producto sin necesitar texto largo.
const STEPS = [
  'Saca una foto en algún punto del viaje y marca dónde estás.',
  'Comparte el enlace en el grupo.',
  'Quien más se acerque en el mapa, gana.',
]

function App() {
  const [view, setView] = useState<View>('home')

  if (view === 'create') {
    return <CreateChallenge onBack={() => setView('home')} />
  }

  return (
    <main className={`lg-page ${styles.home}`}>
      <Stack gap={4} align="center">
        <span className={styles.mark} aria-hidden="true">
          📍
        </span>
        <h1 className={styles.title}>
          Location<span className={styles.accent}>Guesser</span>
        </h1>
        <p className={styles.tagline}>GeoGuessr con las fotos de tus amigos.</p>
      </Stack>

      <Button size="lg" className={styles.cta} onClick={() => setView('create')}>
        Crear un reto
      </Button>

      <Card as="ol" padding="md" className={styles.steps}>
        {STEPS.map((text, i) => (
          <li key={text} className={styles.step}>
            <span className={styles.stepNum} aria-hidden="true">
              {i + 1}
            </span>
            <span>{text}</span>
          </li>
        ))}
      </Card>
    </main>
  )
}

export default App
