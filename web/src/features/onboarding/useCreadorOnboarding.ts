// Detecta y gobierna el onboarding del CREADOR — aprender-haciendo (pieza
// 3/4): quien acaba de crear un viaje y cae en su Diario vacío se guía de UNA
// acción cada vez, contextual, en vez de una pantalla-lista de pasos. Los 5
// avisos (intro → coach-mark en el "+" → sugerencia de reto tras el primer
// momento → aviso de compartir tras lanzarlo → remate discreto) se derivan de
// datos REALES del viaje (nº de momentos, si ya existe un reto) más un puñado
// de banderas locales para "¿ya vi este paso?" — no hace falta una máquina de
// estados persistida: el propio viaje ES el estado.
//
// Solo aplica al DUEÑO (issue de origen: "creador nuevo") y solo hasta que el
// contexto `creador` (ver lib/onboardingFlags.ts) se marque visto en la
// cuenta — eso apaga la guía ENTERA para siempre (cualquier viaje futuro),
// igual que el resto de tutoriales "una vez por cuenta" (#717). "Saltar guía"
// (el botón del coach-mark) hace justo eso: apaga TODO el recorrido, no solo
// el paso actual — el resto de avisos SÍ son descartables paso a paso sin
// matar la guía entera (cerrar la sugerencia con × no impide ver, más tarde,
// el aviso de compartir si el usuario acaba creando un reto por su cuenta).
//
// Las banderas de paso (intro/sugerencia/compartir/remate ya vistos) viven
// SOLO en localStorage, a propósito más ligeras que el mecanismo de
// `onboardingFlags`/`profiles.onboarding`: perder una en un storage efímero
// (el gotcha de #717) repetiría, como mucho, UN paso contextual — no la guía
// entera desde el principio, así que no vale la pena la escritura a servidor
// por cada micro-paso. El "visto" DEFINITIVO (fin del recorrido o "Saltar
// guía") sí usa `useOnboarding`/`profiles.onboarding`, igual que el resto.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { track } from '../../lib/analytics'
import type { ProfileOnboarding } from '../../lib/database.types'
import { useOnboarding } from './useOnboarding'

export type CreadorStage = 'intro' | 'coach' | 'suggest' | 'share' | 'remate' | null

type StepFlag = 'intro' | 'skip' | 'suggest' | 'share' | 'remate'

function stepFlagKey(step: StepFlag, userId?: string | null): string {
  return `lg:onboarding:creador:${step}:${userId ?? 'anon'}`
}

function readStepFlag(step: StepFlag, userId?: string | null): boolean {
  try {
    return localStorage.getItem(stepFlagKey(step, userId)) === '1'
  } catch {
    // Sin storage disponible: tratamos el paso como no visto (a lo sumo se
    // repite, nunca bloquea).
    return false
  }
}

function writeStepFlag(step: StepFlag, userId?: string | null): void {
  try {
    localStorage.setItem(stepFlagKey(step, userId), '1')
  } catch {
    // Igual que el resto del kit de onboarding: si falla el storage, no rompe.
  }
}

export interface UseCreadorOnboarding {
  /** Paso a mostrar AHORA MISMO, o null si no toca ninguno. */
  stage: CreadorStage
  /** "Empezar" de la intro → deja paso al coach-mark. */
  dismissIntro: () => void
  /** "Saltar guía" del coach-mark → apaga el recorrido ENTERO para siempre. */
  skipGuide: () => void
  /** × o "Crear un reto" de la sugerencia: se ve UNA sola vez pase lo que pase. */
  dismissSuggest: () => void
  /** × del aviso "pásale el enlace a tu gente". */
  dismissShare: () => void
  /** × del remate "esto se guarda en tu Bitácora…" — cierra el recorrido. */
  dismissRemate: () => void
}

export function useCreadorOnboarding(
  userId: string | null | undefined,
  profileOnboarding: ProfileOnboarding | null | undefined,
  isOwner: boolean,
  momentsCount: number,
  hasChallenge: boolean,
): UseCreadorOnboarding {
  const { shouldShow, markSeen } = useOnboarding('creador', userId, profileOnboarding)
  // Reactivo a propósito (a diferencia de useRetoShareOnboarding, que congela
  // "active" al montar): `isOwner` llega ASÍNCRONO (TripPage confirma la
  // membresía tras montar, ver reloadMembership) — si lo congeláramos en el
  // primer render, `active` quedaría en `false` para siempre. `shouldShow` solo
  // baja por NUESTRA propia llamada a `markSeen` (skipGuide/dismissRemate),
  // nunca "a media acción" por sorpresa, así que no hace falta congelarlo.
  const active = isOwner && shouldShow

  const [introSeen, setIntroSeen] = useState(() => readStepFlag('intro', userId))
  const [guideSkipped, setGuideSkipped] = useState(() => readStepFlag('skip', userId))
  const [suggestSeen, setSuggestSeen] = useState(() => readStepFlag('suggest', userId))
  const [shareSeen, setShareSeen] = useState(() => readStepFlag('share', userId))
  const [remateSeen, setRemateSeen] = useState(() => readStepFlag('remate', userId))

  const stage: CreadorStage = useMemo(() => {
    if (!active || guideSkipped) return null
    if (!introSeen) return 'intro'
    if (momentsCount === 0) return 'coach'
    if (!suggestSeen) return 'suggest'
    // Sin reto todavía: la sugerencia ya se resolvió (aceptada o no) y no hay
    // nada más que avisar hasta que exista un reto real que compartir.
    if (!hasChallenge) return null
    if (!shareSeen) return 'share'
    if (!remateSeen) return 'remate'
    return null
  }, [
    active,
    guideSkipped,
    introSeen,
    momentsCount,
    suggestSeen,
    hasChallenge,
    shareSeen,
    remateSeen,
  ])

  // onboarding_started una sola vez, al primer paso real (igual que
  // OnboardingGate/useRetoShareOnboarding).
  const startedRef = useRef(false)
  useEffect(() => {
    if (stage && !startedRef.current) {
      startedRef.current = true
      track('onboarding_started', { context: 'creador' })
    }
  }, [stage])

  const dismissIntro = useCallback(() => {
    writeStepFlag('intro', userId)
    setIntroSeen(true)
  }, [userId])

  const skipGuide = useCallback(() => {
    writeStepFlag('skip', userId)
    setGuideSkipped(true)
    track('onboarding_skipped', { context: 'creador' })
    markSeen()
  }, [userId, markSeen])

  const dismissSuggest = useCallback(() => {
    writeStepFlag('suggest', userId)
    setSuggestSeen(true)
  }, [userId])

  const dismissShare = useCallback(() => {
    writeStepFlag('share', userId)
    setShareSeen(true)
  }, [userId])

  const dismissRemate = useCallback(() => {
    writeStepFlag('remate', userId)
    setRemateSeen(true)
    track('onboarding_completed', { context: 'creador' })
    markSeen()
  }, [userId, markSeen])

  return { stage, dismissIntro, skipGuide, dismissSuggest, dismissShare, dismissRemate }
}
