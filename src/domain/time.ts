import type { Booking } from './booking'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const pad = (n: number, len = 2) => String(n).padStart(len, '0')

export function isValidTimeString(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value)
}

export function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number) as [number, number, number]
  if (m < 1 || m > 12) return false
  // Local constructor only: `new Date('YYYY-MM-DD')` would be parsed as UTC.
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number) as [number, number]
  return h * 60 + m
}

export function fromMinutes(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

export function formatLocalDate(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number]
  return formatLocalDate(new Date(y, m - 1, d + days))
}

/** Local moment when the booking (or a date + start time) begins. */
export function startDateTime(b: Pick<Booking, 'date' | 'start'>): Date {
  const [y, m, d] = b.date.split('-').map(Number) as [number, number, number]
  const [hh, mm] = b.start.split(':').map(Number) as [number, number]
  return new Date(y, m - 1, d, hh, mm)
}

/** 30 -> "30 мин", 60 -> "1 ч", 75 -> "1 ч 15 мин". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} мин`
  if (m === 0) return `${h} ч`
  return `${h} ч ${m} мин`
}
