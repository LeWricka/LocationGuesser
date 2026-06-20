import type { ReactNode } from 'react'
import { Card } from './Card'
import { Stack } from './Stack'
import styles from './AuthScreen.module.css'

interface Props {
  /**
   * Cabecera opcional alineada arriba a la izquierda, fuera del bloque centrado:
   * sitio para un control de "volver" que nunca deje la pantalla sin salida.
   */
  header?: ReactNode
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
export function AuthScreen({ header, icon, title, subtitle, children, footer, className }: Props) {
  return (
    <div className={[styles.screen, className].filter(Boolean).join(' ')}>
      <Card as="main" padding="lg" raised className={styles.card}>
        {header && <div className={styles.header}>{header}</div>}
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
