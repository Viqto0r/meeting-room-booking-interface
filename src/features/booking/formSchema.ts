import { z } from 'zod'
import type { Booking, BookingInput } from '@/domain/booking'
import { TITLE_MAX_LENGTH } from '@/domain/constants'
import { VIOLATION_MESSAGES } from '@/domain/messages'
import { validateBookingInput } from '@/domain/rules'
import { isValidDateString, isValidTimeString } from '@/domain/time'

export type FormValues = { date: string; start: string; end: string; title: string }
export type FieldKey = keyof FormValues

export type FormErrors = Partial<Record<FieldKey, string>> & {
  /** OVERLAP: a property of the whole interval, not of one field. */
  interval?: { message: string; conflicts: Booking[] }
}

/** Format and title checks (R0, R9). Business rules come from the domain layer. */
const formSchema = z.object({
  date: z.string().refine(isValidDateString, VIOLATION_MESSAGES.INVALID_FORMAT),
  start: z.string().refine(isValidTimeString, VIOLATION_MESSAGES.INVALID_FORMAT),
  end: z.string().refine(isValidTimeString, VIOLATION_MESSAGES.INVALID_FORMAT),
  title: z
    .string()
    .refine((v) => v.trim().length <= TITLE_MAX_LENGTH, VIOLATION_MESSAGES.TITLE_TOO_LONG),
})

export function toBookingInput(values: FormValues): BookingInput {
  const title = values.title.trim()
  return { date: values.date, start: values.start, end: values.end, ...(title ? { title } : {}) }
}

export type ValidationContext = {
  now: Date
  /** `null` while the bookings of the form date are not loaded: business rules are skipped. */
  existing: Booking[] | null
  excludeId?: string
}

export function validateForm(values: FormValues, ctx: ValidationContext): FormErrors {
  const errors: FormErrors = {}
  const parsed = formSchema.safeParse(values)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as FieldKey
      errors[key] ??= issue.message
    }
    return errors
  }
  if (ctx.existing === null) return errors

  for (const v of validateBookingInput(toBookingInput(values), {
    now: ctx.now,
    existing: ctx.existing,
    excludeId: ctx.excludeId,
  })) {
    if (v.target === 'interval')
      errors.interval = { message: v.message, conflicts: v.conflicts ?? [] }
    else errors[v.target] ??= v.message
  }
  return errors
}

export const hasErrors = (errors: FormErrors) => Object.keys(errors).length > 0

/** The field to focus first: DOM order. */
export function firstInvalidField(errors: FormErrors): FieldKey | null {
  const order: FieldKey[] = ['date', 'start', 'end', 'title']
  const found = order.find((k) => errors[k])
  if (found) return found
  return errors.interval ? 'start' : null
}
