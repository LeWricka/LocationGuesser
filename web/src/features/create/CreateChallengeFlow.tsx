import { useEffect, useState } from 'react'
import { CreateChallengeKindPicker } from './CreateChallengeKindPicker'
import { CreateChallengeImmersive, type ChallengePrefill } from './CreateChallengeImmersive'
import { CreateLocationChallenge } from './CreateLocationChallenge'
import { CreateNumberChallenge } from './CreateNumberChallenge'
import { getChallenge, type ChallengeForPlay, type ChallengeKind } from '../../lib/challenges'
import { signedImageUrl } from '../../lib/storage'
import { reportError } from '../../lib/observability'
import { RootErrorBoundary } from '../../lib/RootErrorBoundary'
import { Button, Spinner } from '../../ui'
import flow from './CreateChallengeFlow.module.css'

interface Props {
  groupId: string
  groupName?: string | null
  /**
   * Si el reto NACE de un recuerdo, su id. El reto pre-rellena la foto y el lugar
   * del recuerdo (uno de los dos orígenes que convergen en el mismo formulario).
   * Sin este id, el reto empieza vacío (origen FAB "Reto").
   */
  fromMomentId?: string
  /** Sale del flujo de crear (cancelar / atrás desde el selector). */
  onBack: () => void
  /** Reto creado (de cualquier tipo): el viaje vuelve a la lista y ofrece su enlace. */
  onCreated: (challenge: ChallengeForPlay) => void
}

// Entrada de "crear reto": el reto es una entidad de primera clase con DOS orígenes
// que convergen en el MISMO formulario:
//  (a) desde un recuerdo (`fromMomentId`) → va directo al asistente de ¿Dónde? con
//      la foto y el lugar del recuerdo PRE-RELLENADOS.
//  (b) desde el FAB "Reto" (sin id) → primero el selector de TIPO (¿Dónde? /
//      ¿Adivinas?), luego el asistente propio de cada tipo, empezando vacío.
// Atrás desde un asistente vuelve al selector (origen FAB) o sale (origen recuerdo).
//
// RED DE SEGURIDAD: todo el flujo va envuelto en un error-boundary ACOTADO
// (`CreateChallengeFlow`). Si algo lanza al abrir/crear el reto (p.ej. el deep link
// `#g=…&add=reto`), en vez de tumbar toda la app con el boundary raíz ("Algo ha
// fallado" a pantalla completa), mostramos un fallback recuperable que deja VOLVER
// al viaje. El error se sigue reportando a la observabilidad (Sentry) igual.
function CreateChallengeFlowInner({ groupId, groupName, fromMomentId, onBack, onCreated }: Props) {
  const [kind, setKind] = useState<ChallengeKind | null>(null)
  // Pre-relleno cargado desde el recuerdo de origen (foto + lugar). `undefined`
  // mientras carga; `null` si no aplica o falló (el formulario empieza vacío).
  const [prefill, setPrefill] = useState<ChallengePrefill | null | undefined>(
    fromMomentId ? undefined : null,
  )

  // Origen recuerdo: cargamos su foto y lugar y entramos directos a ¿Dónde?. Un
  // recuerdo se convierte en reto de UBICACIÓN (su lugar pasa a ser la respuesta).
  useEffect(() => {
    if (!fromMomentId) return
    let alive = true
    void (async () => {
      try {
        const moment = await getChallenge(fromMomentId)
        const photoUrl = moment.image_path ? await signedImageUrl(moment.image_path) : null
        if (!alive) return
        setPrefill({
          point:
            moment.place_lat != null && moment.place_lng != null
              ? { lat: moment.place_lat, lng: moment.place_lng }
              : null,
          imagePath: moment.image_path ?? null,
          photoUrl: photoUrl ?? null,
          title: moment.title ?? '',
        })
        setKind('location')
      } catch (err) {
        reportError(err, { area: 'create_challenge_prefill' })
        // Si no podemos cargar el recuerdo, no bloqueamos: el reto empieza vacío.
        if (!alive) return
        setPrefill(null)
        setKind('location')
      }
    })()
    return () => {
      alive = false
    }
  }, [fromMomentId])

  // Cargando el recuerdo de origen: un spinner breve antes de abrir el asistente.
  if (fromMomentId && prefill === undefined) {
    return (
      <div className={flow.loading} role="status">
        <Spinner size={28} />
        <span>Preparando el reto…</span>
      </div>
    )
  }

  if (kind == null) {
    return <CreateChallengeKindPicker groupName={groupName} onBack={onBack} onPick={setKind} />
  }

  if (kind === 'number') {
    return (
      <CreateNumberChallenge
        groupId={groupId}
        groupName={groupName}
        onBack={() => setKind(null)}
        onCreated={onCreated}
      />
    )
  }

  // Origen RECUERDO (fromMomentId): el reto nace de un momento existente con foto y
  // lugar pre-rellenados. Seguimos usando el flujo clásico (CreateChallengeImmersive)
  // porque el lugar ya viene dado y no necesita Street View desde GPS.
  if (fromMomentId) {
    return (
      <CreateChallengeImmersive
        groupId={groupId}
        groupName={groupName}
        prefill={prefill ?? undefined}
        // Origen recuerdo: atrás sale del flujo (no hay selector de tipo que recuperar).
        onBack={onBack}
        onCreated={onCreated}
      />
    )
  }

  // Origen FAB (sin recuerdo): flujo GeoGuessr puro — Street View directo desde GPS.
  // El usuario navega hasta su sitio exacto y lanza sin pasos intermedios.
  return (
    <CreateLocationChallenge
      groupId={groupId}
      groupName={groupName}
      onBack={() => setKind(null)}
      onCreated={onCreated}
    />
  )
}

// Fallback recuperable del boundary acotado: no es la pantalla en blanco del boundary
// raíz. Explica que no se pudo abrir el reto y ofrece VOLVER al viaje (recarga la ruta,
// que remonta limpio). Copy en positivo, sin disculpas largas (estilo del producto).
function CreateChallengeErrorFallback({ onBack }: { onBack: () => void }) {
  return (
    <div className={flow.loading} role="alert">
      <p>No hemos podido abrir el reto.</p>
      <Button variant="primary" onClick={onBack}>
        Volver al viaje
      </Button>
    </div>
  )
}

export function CreateChallengeFlow(props: Props) {
  return (
    <RootErrorBoundary fallback={<CreateChallengeErrorFallback onBack={props.onBack} />}>
      <CreateChallengeFlowInner {...props} />
    </RootErrorBoundary>
  )
}
