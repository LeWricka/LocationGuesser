import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Icon } from './Icon'
import styles from './DatePicker.module.css'

interface Props {
  /** Valor en `YYYY-MM-DD` (fecha sin hora/zona) o cadena vacía / null si no hay. */
  value: string | null | undefined
  /** Emite el nuevo valor (`YYYY-MM-DD`) o `null` al vaciar. */
  onChange: (value: string | null) => void
  /** Límite inferior `YYYY-MM-DD` (inclusive): días anteriores quedan deshabilitados. */
  min?: string
  /** Límite superior `YYYY-MM-DD` (inclusive): días posteriores quedan deshabilitados. */
  max?: string
  /** Texto cuando no hay fecha elegida. */
  placeholder?: string
  /** Nombre accesible del campo (equivalente a la label si no va dentro de Field). */
  'aria-label'?: string
  /** Marca el campo como inválido (borde de error). Field lo gestiona por ti. */
  invalid?: boolean
  /** Id del disparador (lo inyecta Field para conectar la label). */
  id?: string
  /** aria-describedby inyectado por Field (ayuda + error). */
  'aria-describedby'?: string
  /** aria-invalid inyectado por Field. */
  'aria-invalid'?: boolean
  disabled?: boolean
}

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const

// --- Utilidades de fecha (todo `YYYY-MM-DD` local, sin hora ni zona) ---

// Parsea `YYYY-MM-DD` a Date LOCAL (mediodía para esquivar saltos de DST).
function parseIso(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const [, y, mo, d] = m
  const date = new Date(Number(y), Number(mo) - 1, Number(d), 12)
  return Number.isNaN(date.getTime()) ? null : date
}

function toIso(date: Date): string {
  const y = date.getFullYear()
  const mo = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${mo}-${d}`
}

function todayIso(): string {
  return toIso(new Date())
}

// Fecha humana larga: "3 de marzo de 2026" (para el disparador).
function humanLong(iso: string): string {
  const d = parseIso(iso)
  if (!d) return ''
  return `${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`
}

// Índice de columna (0=Lunes … 6=Domingo) del primer día del mes.
function firstWeekdayMondayBased(year: number, month: number): number {
  const jsDay = new Date(year, month, 1).getDay() // 0=Dom … 6=Sáb
  return (jsDay + 6) % 7
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function clampToBounds(iso: string, min?: string, max?: string): boolean {
  if (min && iso < min) return false
  if (max && iso > max) return false
  return true
}

/**
 * DatePicker — selector de fecha propio del kit (no el input nativo `dd/mm/yyyy`).
 * Un campo con look de Input que abre un calendario mensual: rejilla de días,
 * navegación de mes, "hoy" marcado, selección en acento. Mobile-first (targets
 * ≥44px), accesible (teclado en la rejilla, aria, foco visible) y con vaciado
 * (fecha opcional → null). El valor va y viene en `YYYY-MM-DD` (coherente con
 * `starts_on`/`ends_on`). La validación de rango (fin ≥ inicio) la hace quien lo
 * usa vía `min`/`max`; aquí solo deshabilitamos los días fuera de límites.
 */
export function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = 'Elige una fecha',
  invalid,
  id,
  disabled,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: Props) {
  const selectedIso = value || null
  const [open, setOpen] = useState(false)
  // Mes visible (independiente de la selección): arranca en la fecha elegida, o
  // en el mínimo, o en hoy. Se navega con las flechas de la cabecera.
  const [viewDate, setViewDate] = useState<Date>(() => {
    const base = parseIso(selectedIso ?? '') ?? parseIso(min ?? '') ?? new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1, 12)
  })
  // Día que tiene el foco de teclado dentro de la rejilla (patrón roving tabindex).
  const [focusIso, setFocusIso] = useState<string | null>(null)

  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const gridId = useId()
  const today = todayIso()

  // Alineación/apertura del popover: por defecto cuelga a la izquierda y hacia
  // abajo del disparador, pero eso desborda el viewport cuando el trigger vive
  // cerca del borde derecho (p.ej. "Vuelta" en un layout a dos columnas) o cerca
  // del borde inferior. Se recalcula al abrir midiendo el disparador y el propio
  // popover ya montado (useLayoutEffect corre antes del paint: sin parpadeo).
  const [popoverAlign, setPopoverAlign] = useState<'start' | 'end'>('start')
  const [popoverFlip, setPopoverFlip] = useState(false)

  const reposition = useCallback(() => {
    if (!rootRef.current || !popoverRef.current) return
    const rootRect = rootRef.current.getBoundingClientRect()
    const popRect = popoverRef.current.getBoundingClientRect()
    const margin = 8 // colchón mínimo respecto al borde del viewport
    setPopoverAlign(rootRect.left + popRect.width > window.innerWidth - margin ? 'end' : 'start')
    setPopoverFlip(rootRect.bottom + popRect.height > window.innerHeight - margin)
  }, [])

  // Abre el calendario recolocando el mes visible sobre la selección (o el
  // mínimo, o hoy) y fijando el foco de teclado en un día sensato para navegar
  // con flechas. Se calcula en el gesto (no en un efecto) para no encadenar
  // renders. Toggle: si ya está abierto, cierra.
  function toggleOpen() {
    setOpen((wasOpen) => {
      if (wasOpen) return false
      const anchor = selectedIso ?? min ?? today
      const anchorDate = parseIso(anchor) ?? new Date()
      setViewDate(new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1, 12))
      setFocusIso(selectedIso ?? (clampToBounds(today, min, max) ? today : (min ?? max ?? today)))
      return true
    })
  }

  // Cierra al hacer clic fuera o con Escape (devuelve el foco al disparador).
  useEffect(() => {
    if (!open) return
    function onDocDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Mueve el foco real del DOM al día enfocado cuando el popover está abierto.
  useLayoutEffect(() => {
    if (!open || !focusIso || !gridRef.current) return
    const el = gridRef.current.querySelector<HTMLButtonElement>(`[data-iso="${focusIso}"]`)
    el?.focus()
  }, [open, focusIso, viewDate])

  // Recalcula la posición al abrir y al cambiar de mes (la rejilla puede tener 5
  // o 6 semanas y variar de alto). Antes del paint: evita el parpadeo de un
  // popover que nace desbordado y luego "salta" a su sitio.
  useLayoutEffect(() => {
    if (!open) return
    reposition()
  }, [open, viewDate, reposition])

  // Re-encaja si el usuario rota el móvil o redimensiona con el popover abierto.
  useEffect(() => {
    if (!open) return
    window.addEventListener('resize', reposition)
    return () => window.removeEventListener('resize', reposition)
  }, [open, reposition])

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  // Celdas del mes: null para el relleno inicial, luego 1..n con su `YYYY-MM-DD`.
  const cells = useMemo(() => {
    const lead = firstWeekdayMondayBased(year, month)
    const total = daysInMonth(year, month)
    const out: Array<{ iso: string; day: number } | null> = []
    for (let i = 0; i < lead; i++) out.push(null)
    for (let d = 1; d <= total; d++) {
      out.push({ iso: toIso(new Date(year, month, d, 12)), day: d })
    }
    return out
  }, [year, month])

  const goMonth = useCallback((delta: number) => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1, 12))
  }, [])

  const select = useCallback(
    (iso: string) => {
      if (!clampToBounds(iso, min, max)) return
      onChange(iso)
      setOpen(false)
      triggerRef.current?.focus()
    },
    [min, max, onChange],
  )

  const clear = useCallback(() => {
    onChange(null)
    setOpen(false)
    triggerRef.current?.focus()
  }, [onChange])

  // Teclado en la rejilla: flechas mueven día a día / semana a semana; Inicio/Fin
  // a los extremos de la semana; RePág/AvPág cambian de mes; Enter/Espacio elige.
  function onGridKeyDown(e: React.KeyboardEvent) {
    if (!focusIso) return
    const cur = parseIso(focusIso)
    if (!cur) return
    const colFromMonday = (cur.getDay() + 6) % 7
    let next: Date
    switch (e.key) {
      case 'ArrowLeft':
        next = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() - 1, 12)
        break
      case 'ArrowRight':
        next = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1, 12)
        break
      case 'ArrowUp':
        next = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() - 7, 12)
        break
      case 'ArrowDown':
        next = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 7, 12)
        break
      case 'Home':
        next = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() - colFromMonday, 12)
        break
      case 'End':
        next = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + (6 - colFromMonday), 12)
        break
      case 'PageUp':
        next = new Date(cur.getFullYear(), cur.getMonth() - 1, cur.getDate(), 12)
        break
      case 'PageDown':
        next = new Date(cur.getFullYear(), cur.getMonth() + 1, cur.getDate(), 12)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        select(focusIso)
        return
      default:
        return
    }
    e.preventDefault()
    const nextIso = toIso(next)
    setFocusIso(nextIso)
    // Si el foco cruza al mes anterior/siguiente, arrastra la vista con él.
    if (next.getMonth() !== month || next.getFullYear() !== year) {
      setViewDate(new Date(next.getFullYear(), next.getMonth(), 1, 12))
    }
  }

  const triggerClasses = [
    styles.trigger,
    invalid ? styles.invalid : null,
    selectedIso ? null : styles.empty,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className={`lg-press ${triggerClasses}`}
        onClick={toggleOpen}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid ?? invalid ?? undefined}
      >
        <Icon icon={Calendar} size={18} className={styles.triggerIco} />
        <span className={styles.triggerText}>
          {selectedIso ? humanLong(selectedIso) : placeholder}
        </span>
      </button>
      {/* Vaciar la fecha (opcional → null). Va como HERMANO del disparador —no
          anidado— para no romper la regla "controles interactivos sin anidar". */}
      {selectedIso && (
        <button
          type="button"
          className={styles.clearBtn}
          aria-label="Quitar la fecha"
          onClick={clear}
        >
          <Icon icon={X} size={16} />
        </button>
      )}

      {open && (
        <div
          ref={popoverRef}
          className={[
            styles.popover,
            popoverAlign === 'end' ? styles.popoverEnd : null,
            popoverFlip ? styles.popoverFlip : null,
          ]
            .filter(Boolean)
            .join(' ')}
          role="dialog"
          aria-modal="false"
          aria-label="Elegir fecha"
        >
          <div className={styles.calHeader}>
            <button
              type="button"
              className={`lg-press ${styles.navBtn}`}
              aria-label="Mes anterior"
              onClick={() => goMonth(-1)}
            >
              <Icon icon={ChevronLeft} size={20} />
            </button>
            <span className={styles.monthLabel} aria-live="polite">
              {MONTHS[month]} {year}
            </span>
            <button
              type="button"
              className={`lg-press ${styles.navBtn}`}
              aria-label="Mes siguiente"
              onClick={() => goMonth(1)}
            >
              <Icon icon={ChevronRight} size={20} />
            </button>
          </div>

          <div className={styles.weekRow} aria-hidden="true">
            {WEEKDAYS.map((w, i) => (
              <span key={i} className={styles.weekday}>
                {w}
              </span>
            ))}
          </div>

          <div
            className={styles.grid}
            role="grid"
            aria-labelledby={gridId}
            ref={gridRef}
            onKeyDown={onGridKeyDown}
          >
            <span id={gridId} className={styles.srOnly}>
              {MONTHS[month]} {year}
            </span>
            {cells.map((cell, i) => {
              if (!cell) return <span key={`pad-${i}`} className={styles.pad} aria-hidden="true" />
              const isSelected = cell.iso === selectedIso
              const isToday = cell.iso === today
              const outOfBounds = !clampToBounds(cell.iso, min, max)
              const isFocusTarget = cell.iso === focusIso
              const dayClasses = [
                styles.day,
                isSelected ? styles.daySelected : null,
                isToday && !isSelected ? styles.dayToday : null,
              ]
                .filter(Boolean)
                .join(' ')
              return (
                <button
                  key={cell.iso}
                  type="button"
                  data-iso={cell.iso}
                  className={dayClasses}
                  role="gridcell"
                  aria-selected={isSelected}
                  aria-current={isToday ? 'date' : undefined}
                  aria-label={humanLong(cell.iso)}
                  disabled={outOfBounds}
                  tabIndex={isFocusTarget ? 0 : -1}
                  onClick={() => select(cell.iso)}
                >
                  {cell.day}
                </button>
              )
            })}
          </div>

          <div className={styles.footer}>
            <button
              type="button"
              className={styles.footerBtn}
              disabled={!clampToBounds(today, min, max)}
              onClick={() => select(today)}
            >
              Hoy
            </button>
            {selectedIso && (
              <button type="button" className={styles.footerBtn} onClick={clear}>
                Borrar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
