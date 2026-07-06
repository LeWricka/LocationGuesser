import { useEffect, useState } from 'react'
import { CreateChallengeKindPicker } from './CreateChallengeKindPicker'
import { CreateLocationChallenge } from './CreateLocationChallenge'
import { CreateNumberChallenge } from './CreateNumberChallenge'
import type { ChallengePrefill } from './challengePrefill'
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
  /**
   * PROMOCIÓN de un recuerdo YA guardado (issue #723, botón "Convertir en reto"
   * de la hoja del momento): mismo asistente y mismo pre-relleno que
   * `fromMomentId`, pero al lanzar el recuerdo SE CONVIERTE
   * (`promoteToChallenge`, mismo `challengeId`), no se crea un reto nuevo.
   * Excluyente con `fromMomentId` (si vinieran ambos, manda este).
   */
  promoteMomentId?: string
  /** Sale del flujo de crear (cancelar / atrás desde el selector). */
  onBack: () => void
  /** Reto creado (de cualquier tipo): el viaje vuelve a la lista y ofrece su enlace. */
  onCreated: (challenge: ChallengeForPlay) => void
}

// Entrada de "crear reto": el reto es una entidad de primera clase con TRES orígenes
// que convergen en el MISMO formulario — el MISMO asistente, sin excepciones
// (unificación #722/#723: antes el origen recuerdo abría `CreateChallengeImmersive`
// y el "Convertir en reto" de la hoja del momento un sub-flujo inline propio, ambos
// más limitados — eliminados):
//  (a) desde un recuerdo RECIÉN guardado (`fromMomentId`) → asistente completo de
//      ¿Dónde estamos? (`CreateLocationChallenge`) con el pin, la foto (quitable,
//      sigue opcional) y el título del recuerdo PRE-RELLENADOS. Al lanzar, crea un
//      reto NUEVO además del recuerdo.
//  (b) PROMOCIÓN de un recuerdo existente (`promoteMomentId`, issue #723) → mismo
//      asistente y mismo pre-relleno, pero al lanzar el recuerdo SE CONVIERTE
//      (`promoteToChallenge`, mismo `challengeId`), no se duplica.
//  (c) desde el FAB "Reto" (sin id) → primero el selector de TIPO (¿Dónde estamos? /
//      ¿Adivinas?), luego el asistente propio de cada tipo, empezando vacío.
// Atrás desde un asistente vuelve al selector (origen FAB) o sale (origen recuerdo).
//
// RED DE SEGURIDAD: todo el flujo va envuelto en un error-boundary ACOTADO
// (`CreateChallengeFlow`). Si algo lanza al abrir/crear el reto (p.ej. el deep link
// `#g=…&add=reto`), en vez de tumbar toda la app con el boundary raíz ("Algo ha
// fallado" a pantalla completa), mostramos un fallback recuperable que deja VOLVER
// al viaje. El error se sigue reportando a la observabilidad (Sentry) igual.
function CreateChallengeFlowInner({
  groupId,
  groupName,
  fromMomentId,
  promoteMomentId,
  onBack,
  onCreated,
}: Props) {
  const [kind, setKind] = useState<ChallengeKind | null>(null)
  // Recuerdo de ORIGEN del pre-relleno: promocionar manda sobre `from` (no
  // deberían coexistir; promocionar es la intención más específica).
  const sourceMomentId = promoteMomentId ?? fromMomentId
  // Pre-relleno cargado desde el recuerdo de origen (foto + lugar). `undefined`
  // mientras carga; `null` si no aplica o falló (el formulario empieza vacío).
  const [prefill, setPrefill] = useState<ChallengePrefill | null | undefined>(
    sourceMomentId ? undefined : null,
  )

  // Origen recuerdo (nuevo o a promocionar): cargamos su foto y lugar y entramos
  // directos a ¿Dónde estamos?. Un recuerdo se convierte en reto de UBICACIÓN (su
  // lugar pasa a ser la respuesta).
  useEffect(() => {
    if (!sourceMomentId) return
    let alive = true
    void (async () => {
      try {
        const moment = await getChallenge(sourceMomentId)
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
        // (En modo promoción el envío sigue promocionando la fila correcta: el id
        // viaja aparte del prefill.)
        if (!alive) return
        setPrefill(null)
        setKind('location')
      }
    })()
    return () => {
      alive = false
    }
  }, [sourceMomentId])

  // Cargando el recuerdo de origen: un spinner breve antes de abrir el asistente.
  if (sourceMomentId && prefill === undefined) {
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

  // Origen RECUERDO (nuevo o promoción) o FAB: EL MISMO asistente completo
  // (unificación). Con recuerdo de origen va prefijado (pin, foto quitable,
  // título) y atrás sale del flujo entero (no hay selector de tipo que
  // recuperar, ver arriba). Sin él (FAB), empieza vacío; atrás vuelve al
  // selector de tipo. `promoteMomentId` cambia solo el VERBO al lanzar.
  return (
    <CreateLocationChallenge
      groupId={groupId}
      groupName={groupName}
      prefill={sourceMomentId ? (prefill ?? undefined) : undefined}
      promoteMomentId={promoteMomentId}
      onBack={sourceMomentId ? onBack : () => setKind(null)}
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
