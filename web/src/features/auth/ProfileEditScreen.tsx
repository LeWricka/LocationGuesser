// Pantalla de perfil (`#perfil`, cuentas-y-home.md §3.1/§3.5): editar el
// display_name, elegir avatar (animal del set) y cerrar sesión. Wiring sobre
// `lib/profile` y `lib/auth`; UI del kit.
//
// Migrada a ShellUtilitario + AppHeader (issue #596, patrón CreateGroup post-#494):
// antes vivía en AuthScreen (tarjeta centrada, "atrás" apretado junto a "Cerrar
// sesión" en el footer). Ahora es una pantalla de tarea (papel, no tarjeta
// flotante): atrás arriba-izquierda en la cabecera, Guardar como CTA fijo al
// fondo, y "Cerrar sesión" como acción secundaria separada al final del
// contenido (NO pegada al atrás). La lógica de guardado/avatar no cambia.

import { useState } from 'react'
import { Check, ChevronRight, Compass, MapPinned, Plus, UserPlus, Wrench } from 'lucide-react'
import { AppHeader, Avatar, Button, Field, Icon, Input, Stack, useToast } from '../../ui'
import { ShellUtilitario } from '../../ui/shells'
import { upsertProfile } from '../../lib/profile'
import { signOut } from '../../lib/auth'
import { exampleTripHash } from '../../lib/route'
import { PushNotificationsControl } from './PushNotificationsControl'
import { uploadAvatar } from '../../lib/storage'
import { ANIMAL_EMOJIS, avatarToken, parseAvatar } from '../../lib/avatar'
import { track } from '../../lib/analytics'
import type { Profile } from '../../lib/database.types'
import { AvatarPhotoPicker } from './AvatarPhotoPicker'
import { getSlides, OnboardingSlideshow, useOnboarding } from '../onboarding'
import type { OnboardingContext } from '../../lib/onboardingFlags'
import styles from './ProfileEditScreen.module.css'

// Contextos de los TRES tutoriales-slideshow reabribles desde "Tutoriales"
// (onboarding nuevo, pieza 4/4): "Empezar un viaje" es el MISMO recorrido que
// "Ver tutorial" de la home (`entry`, ver `HomePage.tsx`); "Jugar un reto" y
// "Te han invitado" reutilizan el contenido de los tutoriales por-pantalla
// LEGADO (`challenge`/`group`, `lib/onboardingFlags.ts`) — ya no se auto-
// muestran en ningún sitio, así que revivirlos aquí como repaso manual no
// choca con nada. "Ver un viaje de ejemplo" no es un slideshow: abre el viaje
// de ejemplo con la guía conducida (`GuidedTour`, ver `TripPage`/`exampleTripHash`).
type TutorialSlideContext = Extract<OnboardingContext, 'entry' | 'challenge' | 'group'>

interface Props {
  userId: string
  profile: Profile | null
  /** Vuelve a leer el perfil de BD tras guardar (del SessionContext). */
  onSaved: () => Promise<void> | void
  /** Volver a la home. */
  onBack: () => void
  /** Abrir la vista de administración. Solo lo pasa App.tsx si eres admin; si
   * no llega, el botón no se muestra (la seguridad real está en las RPCs). */
  onOpenAdmin?: () => void
}

export function ProfileEditScreen({ userId, profile, onSaved, onBack, onOpenAdmin }: Props) {
  const toast = useToast()
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  // Avatar elegido (token `emoji:<char>` o el del perfil). Estado local para
  // que el selector y la previsualización respondan al instante.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url ?? null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Sección "Tutoriales" (onboarding nuevo, pieza 4/4): "Repasa cómo funciona
  // Momentu cuando quieras." Reutiliza el MISMO gate que "Ver tutorial" de la
  // home (`useOnboarding` + un forzado local) para cada uno de los tres
  // recorridos-slideshow — solo cambia CUÁL se fuerza.
  const [openTutorial, setOpenTutorial] = useState<TutorialSlideContext | null>(null)
  const entryTutorial = useOnboarding('entry', userId, profile?.onboarding)
  const challengeTutorial = useOnboarding('challenge', userId, profile?.onboarding)
  const groupTutorial = useOnboarding('group', userId, profile?.onboarding)
  const TUTORIAL_GATE: Record<TutorialSlideContext, { markSeen: () => void }> = {
    entry: entryTutorial,
    challenge: challengeTutorial,
    group: groupTutorial,
  }
  function closeTutorial() {
    if (openTutorial) TUTORIAL_GATE[openTutorial].markSeen()
    setOpenTutorial(null)
  }

  // Emoji actualmente seleccionado (para marcarlo en el grid). Si el perfil aún
  // no tiene animal explícito, se resalta el animal por defecto del id.
  const current = parseAvatar(avatarUrl, userId)
  const selectedEmoji = current.kind === 'emoji' ? current.emoji : null
  // ¿El avatar actual es una foto subida? Entonces se muestra como preview y no
  // se resalta ningún animal del grid.
  const photoUrl = current.kind === 'image' ? current.src : null

  function chooseEmoji(emoji: string) {
    setAvatarUrl(avatarToken(emoji))
    setSaved(false)
  }

  // Sube la foto al bucket público `avatars` y deja su URL pública como avatar.
  // La subida es inmediata (no espera a Guardar) para poder previsualizar la
  // foto ya recortada/comprimida; "Guardar" persiste la URL en el perfil.
  async function handlePickPhoto(file: File | null) {
    if (!file) return
    setError(null)
    setSaved(false)
    setUploading(true)
    try {
      const url = await uploadAvatar(file, userId)
      setAvatarUrl(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos subir la foto.')
    } finally {
      setUploading(false)
    }
  }

  // Quitar la foto → volver al animal por defecto del id (avatar_url null).
  function clearPhoto() {
    setAvatarUrl(null)
    setSaved(false)
  }

  async function handleSave() {
    setError(null)
    setSaved(false)
    const name = displayName.trim()
    if (name.length < 2) {
      setError('Pon al menos 2 caracteres.')
      return
    }
    setLoading(true)
    try {
      await upsertProfile({ id: userId, displayName: name, avatarUrl })
      track('avatar_changed', {
        has_emoji: avatarUrl?.startsWith('emoji:') ?? false,
        has_photo: photoUrl != null,
      })
      await onSaved()
      setSaved(true)
      toast.show('Perfil guardado', { tone: 'success' })
    } catch {
      setError('No pudimos guardar los cambios.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSignOut() {
    // signOut dispara onAuthStateChange → AuthProvider limpia la sesión y el
    // router cae al login. No navegamos a mano.
    await signOut()
  }

  return (
    <div className={styles.root}>
      <ShellUtilitario
        header={<AppHeader lead="back" onLead={onBack} leadLabel="Volver" title="Tu perfil" />}
        footer={
          <Button
            type="button"
            size="lg"
            fullWidth
            loading={loading}
            disabled={uploading}
            onClick={() => void handleSave()}
          >
            {saved ? (
              <>
                Guardado <Icon icon={Check} size={16} />
              </>
            ) : (
              'Guardar'
            )}
          </Button>
        }
      >
        <div className={styles.hero}>
          <Avatar userId={userId} name={displayName} avatarUrl={avatarUrl} size="lg" />
          <p className="t-caption">Cambia tu nombre, sube una foto o elige tu animal.</p>
        </div>

        <Stack gap={4}>
          <Field label="Tu nombre" error={error}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                type="text"
                name="display_name"
                autoComplete="nickname"
                placeholder="Lewis"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value)
                  setSaved(false)
                }}
                onKeyDown={(e) => {
                  // Enter guarda directamente (antes lo hacía el submit del
                  // <form>; sin form nativo, lo replicamos aquí).
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void handleSave()
                  }
                }}
                disabled={loading}
                maxLength={40}
              />
            )}
          </Field>

          <div className={styles.photoSection}>
            <span className={styles.sectionLabel}>Tu foto</span>
            <AvatarPhotoPicker
              preview={photoUrl}
              loading={uploading}
              onPick={(file) => void handlePickPhoto(file)}
              onClear={clearPhoto}
            />
            <p className={styles.photoHint}>
              {photoUrl
                ? 'Tu foto se usa como avatar. Quítala para volver al animal.'
                : 'Sin foto usamos tu animal. Sube una para personalizarlo.'}
            </p>
          </div>

          <fieldset className={styles.picker} disabled={uploading}>
            <legend className={styles.pickerLegend}>Tu animal</legend>
            <div className={styles.grid} role="radiogroup" aria-label="Elige tu animal">
              {ANIMAL_EMOJIS.map((emoji) => {
                const isSelected = emoji === selectedEmoji
                return (
                  <button
                    key={emoji}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={`Animal ${emoji}`}
                    className={`${styles.option} ${isSelected ? styles.selected : ''}`}
                    onClick={() => chooseEmoji(emoji)}
                    disabled={loading}
                  >
                    <Avatar userId={userId} avatarUrl={avatarToken(emoji)} size="md" />
                  </button>
                )
              })}
            </div>
          </fieldset>

          {/* Avisos y preferencias de notificaciones (PWA): control aparte del
              guardado del perfil — persiste solo/directamente, sin pasar por
              "Guardar". */}
          <PushNotificationsControl userId={userId} profile={profile} />
        </Stack>

        {/* Tutoriales (onboarding nuevo, pieza 4/4): repasa cualquier recorrido
            cuando quieras, sin esperar a que la app decida mostrarlo. Cada fila
            relanza su propio gate (mismo mecanismo que "Ver tutorial" de la
            home); "Ver un viaje de ejemplo" es la única que no es un slideshow:
            abre el viaje de ejemplo con la guía conducida. */}
        <div className={styles.tutorials}>
          <span className={styles.sectionLabel}>Tutoriales</span>
          <p className={styles.tutorialsIntro}>Repasa cómo funciona Momentu cuando quieras.</p>
          <div className={styles.tutorialList}>
            <button
              type="button"
              className={styles.tutorialRow}
              onClick={() => setOpenTutorial('entry')}
            >
              <span className={styles.tutorialIcon}>
                <Icon icon={Plus} size={18} />
              </span>
              <span className={styles.tutorialText}>
                <b>Empezar un viaje</b>
                <span>Crear, subir momentos, invitar y lanzar retos.</span>
              </span>
              <span className={styles.tutorialGo}>
                Ver <Icon icon={ChevronRight} size={16} />
              </span>
            </button>

            <button
              type="button"
              className={styles.tutorialRow}
              onClick={() => setOpenTutorial('challenge')}
            >
              <span className={styles.tutorialIcon}>
                <Icon icon={Compass} size={18} />
              </span>
              <span className={styles.tutorialText}>
                <b>Jugar un reto</b>
                <span>Adivinar en el mapa a contrarreloj.</span>
              </span>
              <span className={styles.tutorialGo}>
                Ver <Icon icon={ChevronRight} size={16} />
              </span>
            </button>

            <button
              type="button"
              className={styles.tutorialRow}
              onClick={() => setOpenTutorial('group')}
            >
              <span className={styles.tutorialIcon}>
                <Icon icon={UserPlus} size={18} />
              </span>
              <span className={styles.tutorialText}>
                <b>Te han invitado</b>
                <span>Qué pasa cuando entras al viaje de tu gente.</span>
              </span>
              <span className={styles.tutorialGo}>
                Ver <Icon icon={ChevronRight} size={16} />
              </span>
            </button>

            <button
              type="button"
              className={styles.tutorialRow}
              onClick={() => {
                location.hash = exampleTripHash(true)
              }}
            >
              <span className={styles.tutorialIcon}>
                <Icon icon={MapPinned} size={18} />
              </span>
              <span className={styles.tutorialText}>
                <b>Ver un viaje de ejemplo</b>
                <span>Explora un viaje de muestra a tu aire.</span>
              </span>
              <span className={styles.tutorialGo}>
                Ver <Icon icon={ChevronRight} size={16} />
              </span>
            </button>
          </div>
        </div>

        {/* Acciones secundarias, separadas del formulario y del "atrás" (que ya
            vive en la cabecera): vista de administración (si aplica) y cerrar
            sesión, al pie del contenido. */}
        <div className={styles.secondaryActions}>
          {onOpenAdmin && (
            <Button variant="secondary" size="sm" onClick={onOpenAdmin}>
              <Icon icon={Wrench} size={16} /> Vista de administración
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => void handleSignOut()}>
            Cerrar sesión
          </Button>
        </div>
      </ShellUtilitario>

      {/* Slideshow forzado (onboarding nuevo, pieza 4/4): mismo componente que
          gatea `OnboardingGate` en el resto de la app, aquí montado a mano sin
          pasar por el gate de "primera vez" — es un repaso deliberado. */}
      {openTutorial && (
        <OnboardingSlideshow
          slides={getSlides(openTutorial)}
          onComplete={closeTutorial}
          onSkip={closeTutorial}
        />
      )}
    </div>
  )
}
