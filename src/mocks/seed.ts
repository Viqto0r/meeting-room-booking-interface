import type { Booking } from '@/domain/booking'
import { firstMarkAfter } from '@/domain/rules'
import { addDays, formatLocalDate, fromMinutes } from '@/domain/time'

const DAY_START = 9 * 60
const DAY_END = 18 * 60

/** 2–3 bookings today (a past one and future ones when the time of day allows) and 2 tomorrow. */
export function createSeed(now: Date, newId: () => string = () => crypto.randomUUID()): Booking[] {
  const today = formatLocalDate(now)
  const tomorrow = addDays(today, 1)
  const make = (date: string, start: number, end: number, title: string): Booking => ({
    id: newId(),
    date,
    start: fromMinutes(start),
    end: fromMinutes(end),
    title,
  })
  const result: Booking[] = []

  if (firstMarkAfter(now) > DAY_START + 45) {
    result.push(make(today, DAY_START, DAY_START + 30, 'Утренний стендап'))
  }
  const base = Math.max(DAY_START, firstMarkAfter(now))
  const first = base + 60
  if (first + 60 <= DAY_END) {
    result.push(make(today, first, first + 60, 'Планёрка'))
    const second = first + 60 + 60
    if (second + 30 <= DAY_END) result.push(make(today, second, second + 30, 'Ревью дизайна'))
  }

  result.push(make(tomorrow, 10 * 60, 11 * 60, 'Планёрка'))
  result.push(make(tomorrow, 14 * 60, 15 * 60 + 30, 'Интервью с кандидатом'))
  return result
}
