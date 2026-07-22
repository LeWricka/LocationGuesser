// Aviso suave del onboarding del CREADOR (pieza 3/4): un `Banner` descartable
// para los DOS remates de la guía —"pásale el enlace a tu gente" tras lanzar
// el reto, y el remate discreto "esto se guarda en tu Bitácora/Marcador"—.
// Envuelve `Banner` (ver ui/Banner.tsx) en vez de reinventar el estilo de
// pastilla: solo añade el botón de cerrar, que es lo único que cambia entre
// los dos usos de TripPage.

import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Banner, Button, Icon } from '../../ui'

export interface Props {
  icon: LucideIcon
  children: ReactNode
  onDismiss: () => void
}

export function CreadorNudge({ icon, children, onDismiss }: Props) {
  return (
    <Banner
      tone="info"
      icon={icon}
      action={
        <Button variant="ghost" iconButton aria-label="Cerrar aviso" onClick={onDismiss}>
          <Icon icon={X} size={16} />
        </Button>
      }
    >
      {children}
    </Banner>
  )
}
