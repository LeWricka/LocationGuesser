import type { ReactNode } from 'react'
import { Card } from './Card'
import { Stack } from './Stack'
import styles from './AuthScreen.module.css'

interface Props {
  /** Emoji/ícono grande de cabecera (p.ej. 📍, 📬). */
  icon?: ReactNode
  title: ReactNode
  /** Subtítulo/descripción bajo el título. */
  subtitle?: ReactNode
  /** Cuerpo (formulario, acciones…). */
  children: ReactNode
  /** Pie opcional (enlaces secundarios). */
  footer?: ReactNode
  className?: string
}

// Lienzo común de las pantallas de onboarding (login, revisa-tu-correo, perfil):
// tarjeta centrada vertical y horizontalmente, mobile-first. Presentacional.
export function AuthScreen({ icon, title, subtitle, children, footer, className }: Props) {
  return (
    <div className={[styles.screen, className].filter(Boolean).join(' ')}>
      <Card as="main" padding="lg" raised className={styles.card}>
        <Stack gap={5}>
          <Stack gap={3} align="center">
            {icon && (
              <span className={styles.icon} aria-hidden="true">
                {icon}
              </span>
            )}
            <h1 className={styles.title}>{title}</h1>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </Stack>
          {children}
        </Stack>
        {footer && <div className={styles.footer}>{footer}</div>}
      </Card>
    </div>
  )
}
