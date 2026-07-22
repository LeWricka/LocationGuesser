// Puerta de la bienvenida del RECEPTOR. Envuelve la pantalla del viaje/reto y
// gobierna DOS momentos independientes, ambos una sola vez por usuario:
//  1. `welcome` — la PRIMERA vez que un invitado llega por un enlace
//     compartido, el marco de UNA pantalla (`GuestWelcomeFrame`, onboarding
//     nuevo pieza 1/4) con el nombre del viaje, quién invita y quién más ya
//     está dentro.
//  2. `guest-register` — el registro post-valor (`GuestRegisterPrompt`): en una
//     visita POSTERIOR, ya con un reto jugado, se ofrece crear cuenta. NUNCA
//     antes de jugar (ver `useGuestRegisterPrompt`); reutiliza el motor de
//     `AccountUpgradeModal`/`useAccountUpgrade` (issue #758) para el alta real.
//
// Por qué un gate aparte y no reutilizar OnboardingGate "a pelo": decidir si es un
// receptor (y no el dueño) es ASÍNCRONO (useReceptorWelcome). Solo montamos el
// marco cuando la resolución confirma que toca; así el creador del viaje nunca
// ve un "te invitan" y no parpadea nada mientras resolvemos.

import { useEffect, useState, type ReactNode } from 'react'
import { persistOnboardingSeen } from '../../lib/profile'
import type { ProfileOnboarding } from '../../lib/database.types'
import { AccountUpgradeModal } from '../auth'
import { OnboardingGate } from './OnboardingGate'
import { useReceptorWelcome } from './useReceptorWelcome'
import { useGuestRegisterPrompt } from './useGuestRegisterPrompt'
import { GuestRegisterPrompt } from './GuestRegisterPrompt'

interface Props {
  groupId: string | undefined
  userId: string | null | undefined
  /** Sesión anónima (issue #758): gobierna el registro post-valor — un usuario
   * con cuenta permanente nunca necesita crear una. */
  isAnonymous: boolean
  /** Mapa de tutoriales ya vistos EN LA CUENTA (#717); ver OnboardingGate. */
  profileOnboarding?: ProfileOnboarding | null
  children: ReactNode
}

export function ReceptorWelcomeGate({
  groupId,
  userId,
  isAnonymous,
  profileOnboarding,
  children,
}: Props) {
  const {
    show,
    tripName,
    ownerName,
    othersCount,
    avatarMembers,
    coverImageUrl,
    hasActiveChallenge,
  } = useReceptorWelcome(groupId ?? undefined, userId ?? undefined)

  const { show: showRegister, markSeen: markRegisterSeen } = useGuestRegisterPrompt(
    groupId,
    userId ?? undefined,
    isAnonymous,
    profileOnboarding,
  )
  // Alta real tras "Crear cuenta" del registro post-valor: mismo modal/hook que
  // el CTA "guárdate" ya validado (issue #758) — sin motor nuevo.
  const [upgradeOpen, setUpgradeOpen] = useState(false)

  // Para un receptor, la bienvenida HACE de intro del viaje: damos por visto el
  // tutorial genérico `group` para no encadenar dos overlays ("te invitan" y
  // luego "qué es Momentu"). La parte de cómo jugar (`challenge`) sí se mantiene
  // aparte, porque es accionable y complementa el "por qué". Se persiste igual
  // que cualquier otro "visto" (#717): caché local + intento en el perfil.
  useEffect(() => {
    if (show) void persistOnboardingSeen('group', userId, profileOnboarding)
  }, [show, userId, profileOnboarding])

  // Al COMPLETAR la intro (issue #901): en vez de solo revelar el viaje, fijamos
  // `tour=bienvenida` en el hash para ARRANCAR allí el tour de bienvenida
  // (Diario → Bitácora → retos). Mismo mecanismo que `tour=reto`, pero disparado
  // desde aquí: esta pantalla YA está montada cuando se pulsa "Ver el viaje", así
  // que `TripPage` lo recoge por `hashchange`. Preservamos el resto de params
  // (`g`, `v`…) y usamos `location.hash =` (no replaceState) a propósito, para
  // que el evento `hashchange` se emita. Solo aquí, un receptor real (no dueño,
  // no ejemplo): quien entra por un reto ya tiene `welcome` visto y nunca pasa
  // por esta intro, así que no colisiona con `tour=reto`.
  const startBienvenidaTour = () => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    params.set('tour', 'bienvenida')
    window.location.hash = `#${params.toString()}`
  }

  // Hasta confirmar que es un receptor (no el dueño), el marco de bienvenida no
  // envuelve nada; el registro post-valor (más abajo) es independiente de esto.
  const content = show ? (
    <OnboardingGate
      context="welcome"
      userId={userId}
      profileOnboarding={profileOnboarding}
      welcomeData={{
        tripName,
        ownerName,
        avatarMembers,
        othersCount,
        coverImageUrl,
        hasActiveChallenge,
      }}
      groupId={groupId}
      onWelcomeEntered={startBienvenidaTour}
    >
      {children}
    </OnboardingGate>
  ) : (
    children
  )

  return (
    <>
      {content}
      {/* Registro post-valor: NUNCA antes del marco de bienvenida de arriba
          (guarda `!show`, defensiva — `useGuestRegisterPrompt` ya exige haber
          jugado, algo que no puede pasar en la primera visita). */}
      {!show && showRegister && !upgradeOpen && (
        <GuestRegisterPrompt
          onCreateAccount={() => {
            markRegisterSeen()
            setUpgradeOpen(true)
          }}
          onDismiss={markRegisterSeen}
        />
      )}
      {upgradeOpen && (
        <AccountUpgradeModal
          open={upgradeOpen}
          onClose={() => setUpgradeOpen(false)}
          origin="guest_register"
          groupId={groupId}
          onUpgraded={() => setUpgradeOpen(false)}
        />
      )}
    </>
  )
}
