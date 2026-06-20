import { useEffect, useState } from 'react'
import { CreateGroup } from './features/create/CreateGroup'
import { PlayChallenge } from './features/play/PlayChallenge'
import { GroupPage } from './features/group/GroupPage'
import { parseHash } from './lib/route'
import { Button, Card, Stack, withViewTransition } from './ui'
import styles from './App.module.css'

type View = 'home' | 'create'

// Cómo funciona, en tres pasos. Pequeño "onboarding" que sienta el tono de
// producto sin necesitar texto largo. Copy social y genérica: el contenedor es
// un "grupo" (viaje, despedida, finde, partida…), no solo un viaje.
const STEPS = [
  'Crea un grupo para tu plan: un viaje, una despedida, un finde…',
  'Añade retos con una foto y su sitio, y comparte el enlace.',
  'Quien más se acerque en el mapa, gana. La clasificación se acumula.',
]

function App() {
  // Routing por hash: #g=<grupo>&c=<reto>. El orquestador posee este router;
  // cada feature vive en su carpeta y no toca App.tsx.
  const [route, setRoute] = useState(parseHash())
  const [view, setView] = useState<View>('home')

  useEffect(() => {
    // Al cambiar de vista envolvemos el setState en la View Transitions API para
    // un cross-fade nativo entre pantallas (Home → grupo → jugar → resultado).
    // Donde no exista (Firefox hoy) cae a un setState normal: cambio instantáneo.
    const onHash = () => withViewTransition(() => setRoute(parseHash()))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Mismo cross-fade al entrar/salir del formulario de crear grupo, que no pasa
  // por el hash (es estado interno de la Home).
  const goView = (next: View) => withViewTransition(() => setView(next))

  // Un reto concreto → jugar. Solo el grupo → página del grupo (histórico y
  // clasificación). Sin hash → Home (flujo grupo-primero).
  if (route.challenge) {
    return <PlayChallenge challengeId={route.challenge} groupId={route.group} />
  }
  if (route.group) {
    return <GroupPage groupId={route.group} />
  }
  if (view === 'create') {
    return <CreateGroup onBack={() => goView('home')} />
  }

  return (
    <main className={`lg-page ${styles.home} lg-stagger`}>
      <Stack gap={4} align="center">
        <span className={`${styles.mark} lg-pop`} aria-hidden="true">
          📍
        </span>
        <h1 className={styles.title}>
          Location<span className={styles.accent}>Guesser</span>
        </h1>
        <p className={styles.tagline}>GeoGuessr con las fotos de tu grupo.</p>
      </Stack>

      <Button size="lg" className={styles.cta} onClick={() => goView('create')}>
        Crear un grupo
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
