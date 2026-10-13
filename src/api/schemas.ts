import { z } from 'zod'

export const bookingSchema = z.object({
  id: z.string(),
  date: z.string(),
  start: z.string(),
  end: z.string(),
  title: z.string().optional(),
})

export const bookingsSchema = z.array(bookingSchema)

const ruleCodeSchema = z.enum([
  'INVALID_FORMAT',
  'NOT_ALIGNED',
  'OUT_OF_WORKING_HOURS',
  'START_NOT_BEFORE_END',
  'TOO_SHORT',
  'TOO_LONG',
  'PAST_DATE',
  'PAST_TIME',
  'TITLE_TOO_LONG',
  'OVERLAP',
  'BOOKING_LOCKED',
])

const fieldErrorSchema = z.object({ code: ruleCodeSchema, message: z.string() })

export const apiErrorBodySchema = z.object({
  error: z.object({
    code: z.enum(['BAD_REQUEST', 'VALIDATION_ERROR', 'CONFLICT', 'NOT_FOUND', 'INTERNAL']),
    message: z.string(),
    reason: ruleCodeSchema.optional(),
    fieldErrors: z
      .object({
        date: fieldErrorSchema.optional(),
        start: fieldErrorSchema.optional(),
        end: fieldErrorSchema.optional(),
        title: fieldErrorSchema.optional(),
      })
      .optional(),
    conflicts: bookingsSchema.optional(),
  }),
})
