import type { Booking, BookingInput } from './booking'
import {
  canStartAt,
  getDayAvailability,
  getDefaultEnd,
  getEndOptions,
  getFreeIntervals,
  getStartOptions,
  isBookingLocked,
  validateBookingInput,
  type RuleCode,
} from './rules'

const DAY = '2026-10-14'
const NOW = new Date(2026, 9, 13, 12, 0, 0, 0) // 13 Oct 12:00 — DAY is tomorrow

const b = (
  start: string,
  end: string,
  title?: string,
  date = DAY,
  id = `${date}-${start}`,
): Booking => ({
  id,
  date,
  start,
  end,
  ...(title ? { title } : {}),
})
const input = (start: string, end: string, extra: Partial<BookingInput> = {}): BookingInput => ({
  date: DAY,
  start,
  end,
  ...extra,
})
const codes = (i: BookingInput, existing: Booking[] = [], now = NOW, excludeId?: string) =>
  validateBookingInput(i, { now, existing, excludeId }).map((v) => `${v.code}@${v.target}`)
const at = (h: number, m: number, s = 0, ms = 0, date = 13) => new Date(2026, 9, date, h, m, s, ms)

describe('validateBookingInput: format (R0)', () => {
  it('rejects malformed values and stops further checks', () => {
    expect(codes({ date: 'abc', start: '9:00', end: '25:00' })).toEqual([
      'INVALID_FORMAT@date',
      'INVALID_FORMAT@start',
      'INVALID_FORMAT@end',
    ])
    expect(codes({ date: '2026-02-30', start: '10:00', end: '11:00' })).toEqual([
      'INVALID_FORMAT@date',
    ])
  })
  it('does not report anything else together with a format error', () => {
    expect(codes({ date: DAY, start: '10:00', end: 'xx', title: 'x'.repeat(200) })).toEqual([
      'INVALID_FORMAT@end',
    ])
  })
})

describe('validateBookingInput: step, hours, duration', () => {
  it('accepts a valid booking', () => {
    expect(codes(input('10:00', '11:00'))).toEqual([])
  })
  it('flags unaligned times', () => {
    expect(codes(input('10:10', '11:00'))).toEqual(['NOT_ALIGNED@start'])
    expect(codes(input('10:00', '11:10'))).toEqual(['NOT_ALIGNED@end'])
  })
  it('handles the working day boundaries', () => {
    expect(codes(input('17:30', '18:00'))).toEqual([])
    expect(codes(input('09:00', '09:30'))).toEqual([])
    expect(codes(input('17:45', '18:00'))).toEqual(['TOO_SHORT@end'])
    expect(codes(input('08:45', '09:30'))).toEqual(['OUT_OF_WORKING_HOURS@start'])
    expect(codes(input('17:30', '18:15'))).toEqual(['OUT_OF_WORKING_HOURS@end'])
  })
  it('checks start < end', () => {
    expect(codes(input('11:00', '11:00'))).toEqual(['START_NOT_BEFORE_END@end'])
    expect(codes(input('12:00', '11:00'))).toEqual(['START_NOT_BEFORE_END@end'])
  })
  it('checks duration bounds', () => {
    expect(codes(input('10:00', '10:15'))).toEqual(['TOO_SHORT@end'])
    expect(codes(input('10:00', '10:30'))).toEqual([])
    expect(codes(input('10:00', '12:00'))).toEqual([])
    expect(codes(input('10:00', '12:15'))).toEqual(['TOO_LONG@end'])
  })
  it('keeps one violation per target, the first by order', () => {
    // end 18:15: NOT_ALIGNED? no (aligned) -> OUT_OF_WORKING_HOURS first, TOO_LONG dropped
    expect(codes(input('16:00', '18:15'))).toEqual(['OUT_OF_WORKING_HOURS@end'])
    // end unaligned and out of hours -> NOT_ALIGNED wins
    expect(codes(input('17:00', '18:10'))).toEqual(['NOT_ALIGNED@end'])
  })
  it('collects violations on several targets', () => {
    expect(codes(input('08:00', '09:00', { title: 'x'.repeat(101) }))).toEqual([
      'TITLE_TOO_LONG@title',
      'OUT_OF_WORKING_HOURS@start',
    ])
  })
})

describe('validateBookingInput: title (R9)', () => {
  it('allows 100 chars and rejects 101 after trim', () => {
    expect(codes(input('10:00', '11:00', { title: 'x'.repeat(100) }))).toEqual([])
    expect(codes(input('10:00', '11:00', { title: 'x'.repeat(101) }))).toEqual([
      'TITLE_TOO_LONG@title',
    ])
    expect(codes(input('10:00', '11:00', { title: `  ${'x'.repeat(100)}  ` }))).toEqual([])
  })
})

describe('validateBookingInput: past (R6)', () => {
  it('rejects a past date', () => {
    expect(codes({ date: '2026-10-12', start: '10:00', end: '11:00' })).toEqual(['PAST_DATE@date'])
  })
  it('accepts today in the future', () => {
    expect(codes({ date: '2026-10-13', start: '12:15', end: '12:45' }, [], NOW)).toEqual([])
  })
  it('uses a strict comparison with now', () => {
    const today = (s: string, e: string) => ({ date: '2026-10-13', start: s, end: e })
    expect(codes(today('10:15', '10:45'), [], at(10, 15, 0, 0))).toEqual(['PAST_TIME@start'])
    expect(codes(today('10:15', '10:45'), [], at(10, 14, 59, 999))).toEqual([])
    expect(codes(today('10:15', '10:45'), [], at(10, 7))).toEqual([])
    expect(codes(today('10:00', '10:30'), [], at(10, 7))).toEqual(['PAST_TIME@start'])
    expect(codes(today('11:45', '12:30'), [], at(12, 0))).toEqual(['PAST_TIME@start'])
  })
})

describe('validateBookingInput: overlap (R5, R7)', () => {
  const existing = [b('10:00', '11:00', 'Планёрка')]
  it('allows touching intervals', () => {
    expect(codes(input('11:00', '12:00'), existing)).toEqual([])
    expect(codes(input('09:00', '10:00'), existing)).toEqual([])
  })
  it('detects partial, nested, identical and enclosing overlaps', () => {
    for (const [s, e] of [
      ['10:30', '11:30'],
      ['09:30', '10:30'],
      ['10:15', '10:45'],
      ['10:00', '11:00'],
      ['09:30', '11:30'],
    ] as const) {
      expect(codes(input(s, e), existing)).toEqual(['OVERLAP@interval'])
    }
  })
  it('reports conflicts with a formatted message', () => {
    const [v] = validateBookingInput(input('10:30', '11:30'), { now: NOW, existing })
    expect(v?.conflicts).toEqual(existing)
    expect(v?.message).toBe('Время пересекается с: 10:00–11:00 «Планёрка»')
  })
  it('joins several conflicts and names untitled ones', () => {
    const list = [b('10:00', '10:30'), b('10:30', '11:00', 'Встреча')]
    const [v] = validateBookingInput(input('10:00', '11:00'), { now: NOW, existing: list })
    expect(v?.message).toBe(
      'Время пересекается с: 10:00–10:30 «Без названия»; 10:30–11:00 «Встреча»',
    )
  })
  it('ignores the edited booking itself (R7)', () => {
    const self = b('10:00', '11:00', 'Планёрка', DAY, 'self')
    expect(codes(input('10:00', '11:30'), [self], NOW, 'self')).toEqual([])
    expect(codes(input('10:00', '11:30'), [self])).toEqual(['OVERLAP@interval'])
  })
  it('ignores bookings of other dates, checks the target date on move', () => {
    const other = [b('10:00', '11:00', 'X', '2026-10-15')]
    expect(codes(input('10:00', '11:00'), other)).toEqual([])
    expect(codes({ date: '2026-10-15', start: '10:00', end: '11:00' }, other)).toEqual([
      'OVERLAP@interval',
    ])
  })
  it('masks OVERLAP when other violations exist', () => {
    const nine = [b('09:00', '10:00')]
    expect(codes(input('08:45', '09:30'), nine)).toEqual(['OUT_OF_WORKING_HOURS@start'])
    expect(codes(input('09:00', '09:15'), nine)).toEqual(['TOO_SHORT@end'])
  })
})

describe('isBookingLocked (R8)', () => {
  const booking = { date: '2026-10-13', start: '10:00' }
  it('locks at the start moment inclusive', () => {
    expect(isBookingLocked(booking, at(10, 0, 0, 0))).toBe(true)
    expect(isBookingLocked(booking, at(9, 59, 59, 999))).toBe(false)
    expect(isBookingLocked(booking, at(10, 30))).toBe(true)
    expect(isBookingLocked({ date: '2026-10-12', start: '17:00' }, at(10, 0))).toBe(true)
  })
})

describe('canStartAt', () => {
  const list = [b('10:00', '11:00')]
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
  it('returns short when less than 30 minutes remain before a booking or the end of day', () => {
    expect(canStartAt(DAY, m('09:45'), list, NOW)).toBe('short')
    expect(canStartAt(DAY, m('09:30'), list, NOW)).toBe('ok')
    expect(canStartAt(DAY, m('17:45'), [], NOW)).toBe('short')
    expect(canStartAt(DAY, m('17:30'), [], NOW)).toBe('ok')
  })
  it('returns busy inside a booking', () => {
    expect(canStartAt(DAY, m('10:00'), [b('10:00', '10:45')], NOW)).toBe('busy')
    expect(canStartAt(DAY, m('10:30'), list, NOW)).toBe('busy')
    expect(canStartAt(DAY, m('11:00'), list, NOW)).toBe('ok')
  })
  it('returns past for past dates and past time today', () => {
    expect(canStartAt('2026-10-12', m('10:00'), [], NOW)).toBe('past')
    expect(canStartAt('2026-10-13', m('10:00'), [], at(10, 7))).toBe('past')
    expect(canStartAt('2026-10-13', m('10:15'), [], at(10, 7))).toBe('ok')
    expect(canStartAt('2026-10-13', m('10:15'), [], at(10, 15))).toBe('past')
    expect(canStartAt('2026-10-13', m('10:15'), [], at(10, 14, 59, 999))).toBe('ok')
  })
  it('excludes the edited booking', () => {
    expect(canStartAt(DAY, m('10:00'), list, NOW, list[0]?.id)).toBe('ok')
  })
})

describe('getStartOptions', () => {
  it('lists 09:00…17:30 with availability', () => {
    const opts = getStartOptions(DAY, [b('10:00', '11:00')], NOW)
    expect(opts).toHaveLength(35)
    expect(opts[0]).toEqual({ time: '09:00', availability: 'ok' })
    expect(opts.at(-1)).toEqual({ time: '17:30', availability: 'ok' })
    expect(opts.find((o) => o.time === '09:45')?.availability).toBe('short')
    expect(opts.find((o) => o.time === '10:15')?.availability).toBe('busy')
  })
  it('hides past starts today', () => {
    const opts = getStartOptions('2026-10-13', [], at(10, 7))
    expect(opts[0]?.time).toBe('10:15')
    expect(getStartOptions('2026-10-13', [], at(10, 15))[0]?.time).toBe('10:30')
    expect(getStartOptions('2026-10-13', [], at(10, 15, 30))[0]?.time).toBe('10:30')
  })
  it('is empty on a past date', () => {
    expect(getStartOptions('2026-10-12', [], NOW)).toEqual([])
  })
})

describe('getEndOptions', () => {
  it('lists start+30…start+120 with durations', () => {
    const opts = getEndOptions(DAY, '10:00', [])
    expect(opts.map((o) => o.time)).toEqual([
      '10:30',
      '10:45',
      '11:00',
      '11:15',
      '11:30',
      '11:45',
      '12:00',
    ])
    expect(opts[0]?.durationMin).toBe(30)
    expect(opts.every((o) => o.free)).toBe(true)
  })
  it('caps at the end of the day', () => {
    expect(getEndOptions(DAY, '17:30', []).map((o) => o.time)).toEqual(['18:00'])
    expect(getEndOptions(DAY, '16:30', []).at(-1)?.time).toBe('18:00')
  })
  it('marks options leading to an overlap', () => {
    const opts = getEndOptions(DAY, '09:30', [b('10:00', '11:00')])
    expect(opts.map((o) => o.free)).toEqual([true, false, false, false, false, false, false])
  })
})

describe('getDefaultEnd', () => {
  it('is start + 60 by default', () => {
    expect(getDefaultEnd(DAY, '10:00', [])).toBe('11:00')
  })
  it('stops at the next booking', () => {
    expect(getDefaultEnd(DAY, '09:30', [b('10:00', '11:00')])).toBe('10:00')
    expect(getDefaultEnd(DAY, '10:00', [b('11:30', '12:00')])).toBe('11:00')
    expect(getDefaultEnd(DAY, '11:00', [b('11:30', '12:00')])).toBe('11:30')
  })
  it('stops at the end of the day', () => {
    expect(getDefaultEnd(DAY, '17:30', [])).toBe('18:00')
    expect(getDefaultEnd(DAY, '17:00', [])).toBe('18:00')
  })
})

describe('getFreeIntervals', () => {
  it('returns gaps of at least 30 minutes', () => {
    const list = [b('10:00', '11:30'), b('11:45', '12:00')]
    expect(getFreeIntervals(DAY, list, NOW)).toEqual([
      { start: '09:00', end: '10:00' },
      { start: '12:00', end: '18:00' },
    ])
  })
  it('drops short gaps', () => {
    expect(getFreeIntervals(DAY, [b('09:15', '17:45')], NOW)).toEqual([])
  })
  it('starts from the first valid start today', () => {
    expect(getFreeIntervals('2026-10-13', [], at(10, 7))).toEqual([
      { start: '10:15', end: '18:00' },
    ])
  })
  it('is empty on past dates', () => {
    expect(getFreeIntervals('2026-10-12', [], NOW)).toEqual([])
  })
})

describe('getDayAvailability', () => {
  it('detects a past date', () => {
    expect(getDayAvailability('2026-10-12', [], NOW)).toBe('past-date')
  })
  it('detects day-over today after the last possible start', () => {
    expect(getDayAvailability('2026-10-13', [], at(17, 30, 0, 0))).toBe('day-over')
    expect(getDayAvailability('2026-10-13', [], at(17, 29, 59, 999))).toBe('available')
  })
  it('detects a fully booked day', () => {
    const full = [
      b('09:00', '11:00'),
      b('11:00', '13:00'),
      b('13:00', '15:00'),
      b('15:00', '17:00'),
      b('17:00', '18:00'),
    ]
    expect(getDayAvailability(DAY, full, NOW)).toBe('fully-booked')
    // only 15-minute gaps left
    expect(getDayAvailability(DAY, [b('09:00', '09:45'), b('10:00', '18:00')], NOW)).toBe(
      'fully-booked',
    )
  })
  it('is available otherwise', () => {
    expect(getDayAvailability(DAY, [b('09:00', '17:00')], NOW)).toBe('available')
  })
})

describe('violation code coverage', () => {
  it('exposes all codes as RuleCode', () => {
    const c: RuleCode = 'BOOKING_LOCKED'
    expect(c).toBe('BOOKING_LOCKED')
  })
})
