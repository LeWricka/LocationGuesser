import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  deadlineFromMinutes,
  deadlineFromNow,
  fmtElapsed,
  formatDeadline,
  isPast,
  parseMomentDate,
} from './time'

describe('time', () => {
  beforeEach(() => {
    // Fijamos "ahora" para que la cuenta atrás sea determinista.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-20T10:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  describe('formatDeadline (cuenta atrás)', () => {
    test('horas y minutos', () => {
      // +3 h 12 m
      expect(formatDeadline('2026-06-20T13:12:00Z')).toBe('quedan 3 h 12 m')
    })

    test('horas exactas → sin minutos', () => {
      expect(formatDeadline('2026-06-20T14:00:00Z')).toBe('quedan 4 h')
    })

    test('solo minutos', () => {
      expect(formatDeadline('2026-06-20T10:45:00Z')).toBe('quedan 45 m')
    })

    test('menos de un minuto → segundos', () => {
      expect(formatDeadline('2026-06-20T10:00:30Z')).toBe('quedan 30 s')
    })

    test('más de un día → días y horas', () => {
      // +1 d 5 h
      expect(formatDeadline('2026-06-21T15:00:00Z')).toBe('quedan 1 d 5 h')
    })

    test('plazo vencido → cerrado', () => {
      expect(formatDeadline('2026-06-20T09:00:00Z')).toBe('cerrado')
    })
  })

  describe('deadlineFromNow', () => {
    test('suma horas y devuelve ISO absoluto', () => {
      expect(deadlineFromNow(4)).toBe('2026-06-20T14:00:00.000Z')
    })

    test('admite fracciones de hora', () => {
      expect(deadlineFromNow(0.5)).toBe('2026-06-20T10:30:00.000Z')
    })
  })

  describe('deadlineFromMinutes', () => {
    test('suma minutos y devuelve ISO absoluto', () => {
      expect(deadlineFromMinutes(30)).toBe('2026-06-20T10:30:00.000Z')
    })

    test('admite plazos express muy cortos', () => {
      expect(deadlineFromMinutes(5)).toBe('2026-06-20T10:05:00.000Z')
    })

    test('coincide con deadlineFromNow (horas = minutos/60)', () => {
      expect(deadlineFromMinutes(240)).toBe(deadlineFromNow(4))
    })
  })

  test('isPast', () => {
    expect(isPast('2026-06-20T09:00:00Z')).toBe(true)
    expect(isPast('2026-06-20T11:00:00Z')).toBe(false)
  })
})

// Issue #566 / migración 0037: `parseMomentDate` es la pieza que evita el
// off-by-one al mostrar/editar `happened_on` (fecha PURA, sin hora ni huso) en
// husos horarios AL OESTE de UTC — el propio hueco que describe el issue
// ("cuidado con el off-by-one de toISOString y timezones").
describe('parseMomentDate (#566, migración 0037)', () => {
  // `process.env.TZ` SÍ afecta a los `Date` creados DESPUÉS de cambiarlo (V8 lo
  // consulta en cada construcción, no solo al arrancar el proceso) — verificado
  // en Node antes de escribir el test. Restauramos siempre, para no filtrar el
  // huso a otros tests de este proceso.
  const originalTz = process.env.TZ
  afterEach(() => {
    process.env.TZ = originalTz
  })

  test('fecha PURA (YYYY-MM-DD): construye el Date en LOCAL, sin desplazar el día', () => {
    process.env.TZ = 'UTC'
    const d = parseMomentDate('2026-07-02')
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 6, 2])
  })

  test('en un huso AL OESTE de UTC, el día elegido NO se corre al anterior', () => {
    // `new Date('2026-07-02')` a pelo SÍ se correría a 1 de julio aquí (medianoche
    // UTC cae en la tarde del día previo en Los Ángeles) — la razón de ser de esta
    // función. Repro verificado con Node antes de escribir el test.
    process.env.TZ = 'America/Los_Angeles'
    const naive = new Date('2026-07-02')
    expect(naive.getDate()).toBe(1) // el bug que NO queremos

    const fixed = parseMomentDate('2026-07-02')
    expect([fixed.getFullYear(), fixed.getMonth(), fixed.getDate()]).toEqual([2026, 6, 2])
  })

  test('en un huso AL ESTE de UTC, el día elegido tampoco se adelanta', () => {
    process.env.TZ = 'Pacific/Auckland' // UTC+12/+13 según DST
    const fixed = parseMomentDate('2026-07-02')
    expect([fixed.getFullYear(), fixed.getMonth(), fixed.getDate()]).toEqual([2026, 6, 2])
  })

  test('instante ISO completo (created_at, momento legado): se parsea como instante real', () => {
    process.env.TZ = 'UTC'
    const iso = '2026-07-02T23:00:00.000Z'
    expect(parseMomentDate(iso).getTime()).toBe(new Date(iso).getTime())
  })

  test('valor inválido: Date inválido (NaN), no revienta', () => {
    expect(Number.isNaN(parseMomentDate('no-es-una-fecha').getTime())).toBe(true)
  })
})

// Issue #811: tiempo de respuesta en la leyenda del resultado (votes.elapsed_seconds).
describe('fmtElapsed', () => {
  test('bajo el minuto: segundos a secas', () => {
    expect(fmtElapsed(12)).toBe('12 s')
    expect(fmtElapsed(0)).toBe('0 s')
    expect(fmtElapsed(59)).toBe('59 s')
  })

  test('a partir de un minuto: "m" + segundos con cero a la izquierda', () => {
    expect(fmtElapsed(60)).toBe('1 m 00 s')
    expect(fmtElapsed(65)).toBe('1 m 05 s')
    expect(fmtElapsed(125)).toBe('2 m 05 s')
  })

  test('null (sin cronómetro, voto legado o reto sin límite) → "—"', () => {
    expect(fmtElapsed(null)).toBe('—')
  })
})
