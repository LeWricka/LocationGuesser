import { useState } from 'react'
import { CreateChallenge } from './features/create/CreateChallenge'

type View = 'home' | 'create'

function App() {
  const [view, setView] = useState<View>('home')

  if (view === 'create') {
    return <CreateChallenge onBack={() => setView('home')} />
  }

  return (
    <main className="app home">
      <h1>📍 LocationGuesser</h1>
      <p className="muted">GeoGuessr con las fotos de tus amigos.</p>
      <button type="button" className="btn primary" onClick={() => setView('create')}>
        Crear un reto
      </button>
    </main>
  )
}

export default App
