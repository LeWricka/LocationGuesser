// Error boundary de raíz, ligera y SIN dependencia estática de Sentry. Antes
// main.tsx usaba el <ErrorBoundary> de `@sentry/react`, lo que arrastraba el SDK
// de Sentry al bundle inicial. Esta versión es una clase React mínima que captura
// el error, lo reporta por el canal de observabilidad DIFERIDO (`reportError`, que
// encola hasta que Sentry cargue) y pinta un fallback amable. Así Sentry queda
// fuera del camino crítico de la landing sin perder la captura del crash.

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from './observability'

interface Props {
  fallback: ReactNode
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class RootErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Reporta por el canal diferido (no-op si la observabilidad no está activa).
    reportError(error, { componentStack: info.componentStack })
  }

  render(): ReactNode {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}
