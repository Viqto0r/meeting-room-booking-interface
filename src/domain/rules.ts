import type { Booking, BookingInput } from './booking'
import {
  MAX_DURATION_MIN,
  MIN_DURATION_MIN,
  SLOT_STEP_MIN,
  TITLE_MAX_LENGTH,
  WORKDAY_END,
  WORKDAY_START,
} from './constants'
import { overlapMessage, VIOLATION_MESSAGES } from './messages'
import {
  formatLocalDate,
  fromMinutes,
  isValidDateString,
  isValidTimeString,
  startDateTime,
  toMinutes,
} from './time'

export type RuleCode =
  | 'INVALID_FORMAT'
  | 'NOT_ALIGNED'
  | 'OUT_OF_WORKING_HOURS'
  | 'START_NOT_BEFORE_END'
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'PAST_DATE'
  | 'PAST_TIME'
  | 'TITLE_TOO_LONG'
  | 'OVERLAP'
  | 'BOOKING_LOCKED'

export type ViolationTarget = 'date' | 'start' | 'end' | 'title' | 'interval'

export type RuleViolation = {
  code: RuleCode
  target: ViolationTarget
  message: string
  conflicts?: Booking[]
}

export type StartAvailability = 'ok' | 'past' | 'busy' | 'short'
export type DayAvailability = 'past-date' | 'day-over' | 'fully-booked' | 'available'

export type StartOption = { time: string; availability: Exclude<StartAvailability, 'past'> }
export type EndOption = { time: string; durationMin: number; free: boolean }

export type ValidationContext = { now: Date; existing: Booking[]; excludeId?: string }

const DAY_START_MIN = toMinutes(WORKDAY_START)
const DAY_END_MIN = toMinutes(WORKDAY_END)
const LAST_START_MIN = DAY_END_MIN - MIN_DURATION_MIN

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) =>
  a.start < b.end && b.start < a.end

const toRange = (b: Pick<Booking, 'start' | 'end'>) => ({
  start: toMinutes(b.start),
  end: toMinutes(b.end),
})

/** Bookings of `date` relevant for the check, sorted by start. */
function dayBookings(date: string, bookings: Booking[], excludeId?: string): Booking[] {
  return bookings
    .filter((b) => b.date === date && b.id !== excludeId)
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
}

export function isBookingLocked(b: Pick<Booking, 'date' | 'start'>, now: Date): boolean {
  return startDateTime(b).getTime() <= now.getTime()
}

/** First 15-minute mark strictly after `now`, in minutes from midnight. */
export function firstMarkAfter(now: Date): number {
  const minutes =
    now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60 + now.getMilliseconds() / 60000
  return Math.floor(minutes / SLOT_STEP_MIN) * SLOT_STEP_MIN + SLOT_STEP_MIN
}

export function validateBookingInput(input: BookingInput, ctx: ValidationContext): RuleViolation[] {
  const { now, existing, excludeId } = ctx
  const violations: RuleViolation[] = []

  // R0 — format. Stops everything else.
  if (!isValidDateString(input.date)) {
    violations.push(violation('INVALID_FORMAT', 'date'))
  }
  if (!isValidTimeString(input.start)) {
    violations.push(violation('INVALID_FORMAT', 'start'))
  }
  if (!isValidTimeString(input.end)) {
    violations.push(violation('INVALID_FORMAT', 'end'))
  }
  if (violations.length > 0) return violations

  const start = toMinutes(input.start)
  const end = toMinutes(input.end)
  const seen = new Set<ViolationTarget>()
  const add = (code: Exclude<RuleCode, 'OVERLAP'>, target: ViolationTarget) => {
    if (seen.has(target)) return
    seen.add(target)
    violations.push(violation(code, target))
  }

  // R0.1 — step
  if (start % SLOT_STEP_MIN !== 0) add('NOT_ALIGNED', 'start')
  if (end % SLOT_STEP_MIN !== 0) add('NOT_ALIGNED', 'end')
  // R9 — title
  if ((input.title ?? '').trim().length > TITLE_MAX_LENGTH) add('TITLE_TOO_LONG', 'title')
  // R1 — working hours
  if (start < DAY_START_MIN) add('OUT_OF_WORKING_HOURS', 'start')
  if (end > DAY_END_MIN) add('OUT_OF_WORKING_HOURS', 'end')
  // R2 / R3 / R4 — interval shape
  if (start >= end) add('START_NOT_BEFORE_END', 'end')
  else if (end - start < MIN_DURATION_MIN) add('TOO_SHORT', 'end')
  else if (end - start > MAX_DURATION_MIN) add('TOO_LONG', 'end')
  // R6a / R6b — past
  const today = formatLocalDate(now)
  if (input.date < today) add('PAST_DATE', 'date')
  else if (input.date === today && startDateTime(input).getTime() <= now.getTime()) {
    add('PAST_TIME', 'start')
  }

  // R5 — only for an otherwise valid interval (masking)
  if (violations.length === 0) {
    const conflicts = dayBookings(input.date, existing, excludeId).filter((b) =>
      overlaps({ start, end }, toRange(b)),
    )
    if (conflicts.length > 0) {
      violations.push({
        code: 'OVERLAP',
        target: 'interval',
        message: overlapMessage(conflicts),
        conflicts,
      })
    }
  }
  return violations
}

function violation(code: Exclude<RuleCode, 'OVERLAP'>, target: ViolationTarget): RuleViolation {
  return { code, target, message: VIOLATION_MESSAGES[code] }
}

export function canStartAt(
  date: string,
  startMin: number,
  bookings: Booking[],
  now: Date,
  excludeId?: string,
): StartAvailability {
  const today = formatLocalDate(now)
  if (date < today) return 'past'
  if (date === today && startMin < firstMarkAfter(now)) return 'past'

  const day = dayBookings(date, bookings, excludeId).map(toRange)
  if (day.some((r) => r.start <= startMin && startMin < r.end)) return 'busy'

  const nextStart = day.map((r) => r.start).find((s) => s > startMin) ?? DAY_END_MIN
  const limit = Math.min(nextStart, DAY_END_MIN)
  if (limit - startMin < MIN_DURATION_MIN) return 'short'
  return 'ok'
}

/** Start options 09:00…17:30. Past starts are omitted. */
export function getStartOptions(
  date: string,
  bookings: Booking[],
  now: Date,
  excludeId?: string,
): StartOption[] {
  const options: StartOption[] = []
  for (let m = DAY_START_MIN; m <= LAST_START_MIN; m += SLOT_STEP_MIN) {
    const availability = canStartAt(date, m, bookings, now, excludeId)
    if (availability === 'past') continue
    options.push({ time: fromMinutes(m), availability })
  }
  return options
}

/** End options start+30 … min(start+120, 18:00); `free` is false if the interval would overlap. */
export function getEndOptions(
  date: string,
  start: string,
  bookings: Booking[],
  excludeId?: string,
): EndOption[] {
  const startMin = toMinutes(start)
  const day = dayBookings(date, bookings, excludeId).map(toRange)
  const options: EndOption[] = []
  const last = Math.min(startMin + MAX_DURATION_MIN, DAY_END_MIN)
  for (let e = startMin + MIN_DURATION_MIN; e <= last; e += SLOT_STEP_MIN) {
    options.push({
      time: fromMinutes(e),
      durationMin: e - startMin,
      free: !day.some((r) => overlaps({ start: startMin, end: e }, r)),
    })
  }
  return options
}

/** min(start + 60, start of the next booking, 18:00). Assumes `start` is available. */
export function getDefaultEnd(
  date: string,
  start: string,
  bookings: Booking[],
  excludeId?: string,
): string {
  const startMin = toMinutes(start)
  const nextStart = dayBookings(date, bookings, excludeId)
    .map((b) => toMinutes(b.start))
    .find((s) => s > startMin)
  return fromMinutes(Math.min(startMin + 60, nextStart ?? DAY_END_MIN, DAY_END_MIN))
}

/** Free gaps of at least 30 minutes. For today the gap begins no earlier than the first valid start. */
export function getFreeIntervals(
  date: string,
  bookings: Booking[],
  now: Date,
  excludeId?: string,
): Array<{ start: string; end: string }> {
  const today = formatLocalDate(now)
  if (date < today) return []
  let cursor = DAY_START_MIN
  if (date === today) cursor = Math.max(cursor, firstMarkAfter(now))

  const gaps: Array<{ start: string; end: string }> = []
  const pushGap = (from: number, to: number) => {
    if (to - from >= MIN_DURATION_MIN) gaps.push({ start: fromMinutes(from), end: fromMinutes(to) })
  }
  for (const r of dayBookings(date, bookings, excludeId).map(toRange)) {
    if (r.start > cursor) pushGap(cursor, Math.min(r.start, DAY_END_MIN))
    cursor = Math.max(cursor, r.end)
  }
  if (cursor < DAY_END_MIN) pushGap(cursor, DAY_END_MIN)
  return gaps
}

export function getDayAvailability(date: string, bookings: Booking[], now: Date): DayAvailability {
  const today = formatLocalDate(now)
  if (date < today) return 'past-date'
  if (date === today && firstMarkAfter(now) > LAST_START_MIN) return 'day-over'
  for (let m = DAY_START_MIN; m <= LAST_START_MIN; m += SLOT_STEP_MIN) {
    if (canStartAt(date, m, bookings, now) === 'ok') return 'available'
  }
  return 'fully-booked'
}
