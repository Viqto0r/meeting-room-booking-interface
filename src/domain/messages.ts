import type { Booking } from './booking'
import { TITLE_MAX_LENGTH } from './constants'

export const UNTITLED = 'Без названия'

export const VIOLATION_MESSAGES = {
  INVALID_FORMAT: 'Некорректный формат даты/времени',
  NOT_ALIGNED: 'Время должно быть кратно 15 минутам',
  OUT_OF_WORKING_HOURS: 'Бронирование возможно только с 09:00 до 18:00',
  START_NOT_BEFORE_END: 'Окончание должно быть позже начала',
  TOO_SHORT: 'Минимальная длительность — 30 минут',
  TOO_LONG: 'Максимальная длительность — 2 часа',
  PAST_DATE: 'Нельзя бронировать на прошедшую дату',
  PAST_TIME: 'Это время уже прошло',
  TITLE_TOO_LONG: `Не более ${TITLE_MAX_LENGTH} символов`,
  BOOKING_LOCKED: 'Прошедшую или уже начавшуюся бронь нельзя изменить',
} as const

/** `10:00–11:00 «Планёрка»` (untitled bookings: «Без названия»). */
export function formatBookingLabel(b: Pick<Booking, 'start' | 'end' | 'title'>): string {
  return `${b.start}–${b.end} «${b.title ?? UNTITLED}»`
}

export function formatConflicts(conflicts: Booking[]): string {
  return conflicts.map(formatBookingLabel).join('; ')
}

export function overlapMessage(conflicts: Booking[]): string {
  return `Время пересекается с: ${formatConflicts(conflicts)}`
}
