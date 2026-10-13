import type { Booking } from '@/domain/booking'
import { isBookingLocked } from '@/domain/rules'
import { startDateTime } from '@/domain/time'

export type BookingStatus = 'past' | 'ongoing' | null

/** `null` for a booking that can still be edited; locked ones are "past" once their end is reached. */
export function getBookingStatus(booking: Booking, now: Date): BookingStatus {
  if (!isBookingLocked(booking, now)) return null
  const end = startDateTime({ date: booking.date, start: booking.end })
  return end.getTime() <= now.getTime() ? 'past' : 'ongoing'
}

export const STATUS_TEXT = { past: 'прошла', ongoing: 'идёт сейчас' } as const
