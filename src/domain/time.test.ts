import {
  addDays,
  formatDuration,
  formatLocalDate,
  fromMinutes,
  isValidDateString,
  isValidTimeString,
  startDateTime,
  toMinutes,
} from './time'

describe('time helpers', () => {
  it('converts between HH:mm and minutes', () => {
    expect(toMinutes('10:15')).toBe(615)
    expect(fromMinutes(615)).toBe('10:15')
    expect(fromMinutes(540)).toBe('09:00')
  })

  it('validates dates strictly', () => {
    expect(isValidDateString('2026-10-13')).toBe(true)
    expect(isValidDateString('2026-02-30')).toBe(false)
    expect(isValidDateString('2028-02-29')).toBe(true)
    expect(isValidDateString('2026-13-01')).toBe(false)
    expect(isValidDateString('abc')).toBe(false)
    expect(isValidDateString('2026-1-1')).toBe(false)
    expect(isValidDateString(20261013)).toBe(false)
  })

  it('validates time strings', () => {
    expect(isValidTimeString('09:00')).toBe(true)
    expect(isValidTimeString('23:59')).toBe(true)
    expect(isValidTimeString('9:00')).toBe(false)
    expect(isValidTimeString('25:00')).toBe(false)
    expect(isValidTimeString('10:60')).toBe(false)
    expect(isValidTimeString(900)).toBe(false)
  })

  it('formats and shifts local dates', () => {
    expect(formatLocalDate(new Date(2026, 9, 13, 23, 59))).toBe('2026-10-13')
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('builds a local start date-time', () => {
    const d = startDateTime({ date: '2026-10-13', start: '10:15' })
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([
      2026, 9, 13, 10, 15,
    ])
  })

  it('formats durations', () => {
    expect(formatDuration(30)).toBe('30 мин')
    expect(formatDuration(60)).toBe('1 ч')
    expect(formatDuration(75)).toBe('1 ч 15 мин')
    expect(formatDuration(120)).toBe('2 ч')
  })
})
