import { delay, http, HttpResponse, type RequestHandler } from 'msw'
import { z } from 'zod'
import type { Booking, BookingInput } from '@/domain/booking'
import { VIOLATION_MESSAGES } from '@/domain/messages'
import {
  isBookingLocked,
  validateBookingInput,
  type RuleCode,
  type RuleViolation,
} from '@/domain/rules'
import { isValidDateString, isValidTimeString, fromMinutes, toMinutes } from '@/domain/time'
import type { Clock } from '@/shared/clock'
import type { Simulation } from './simulation'
import type { BookingRepository } from './store'

export const FOREIGN_TITLE = 'Занято другим сотрудником'

export type HandlerDeps = { repo: BookingRepository; sim: Simulation; clock: Clock }

type FieldName = 'date' | 'start' | 'end' | 'title'
type ErrorBody = {
  error: {
    code: 'BAD_REQUEST' | 'VALIDATION_ERROR' | 'CONFLICT' | 'NOT_FOUND' | 'INTERNAL'
    message: string
    reason?: RuleCode
    fieldErrors?: Partial<Record<FieldName, { code: RuleCode; message: string }>>
    conflicts?: Booking[]
  }
}

const errorResponse = (status: number, error: ErrorBody['error']) =>
  HttpResponse.json({ error } satisfies ErrorBody, { status })

const badRequest = (message: string, fieldErrors?: ErrorBody['error']['fieldErrors']) =>
  errorResponse(400, { code: 'BAD_REQUEST', message, fieldErrors })

const notFound = () => errorResponse(404, { code: 'NOT_FOUND', message: 'Бронь не найдена' })

const locked = () =>
  errorResponse(422, {
    code: 'VALIDATION_ERROR',
    message: VIOLATION_MESSAGES.BOOKING_LOCKED,
    reason: 'BOOKING_LOCKED',
  })

const inputSchema = z.object({
  date: z.string(),
  start: z.string(),
  end: z.string(),
  title: z.string().optional(),
})
const patchSchema = inputSchema.partial()

/** R0 on the fields that are present. Returns field errors, or null if all are well-formed. */
function formatErrors(
  body: Partial<BookingInput>,
): NonNullable<ErrorBody['error']['fieldErrors']> | null {
  const fieldErrors: NonNullable<ErrorBody['error']['fieldErrors']> = {}
  const bad = { code: 'INVALID_FORMAT', message: VIOLATION_MESSAGES.INVALID_FORMAT } as const
  if (body.date !== undefined && !isValidDateString(body.date)) fieldErrors.date = bad
  if (body.start !== undefined && !isValidTimeString(body.start)) fieldErrors.start = bad
  if (body.end !== undefined && !isValidTimeString(body.end)) fieldErrors.end = bad
  return Object.keys(fieldErrors).length > 0 ? fieldErrors : null
}

function toFieldErrors(violations: RuleViolation[]) {
  const fieldErrors: NonNullable<ErrorBody['error']['fieldErrors']> = {}
  for (const v of violations) {
    if (v.target === 'interval') continue
    fieldErrors[v.target] ??= { code: v.code, message: v.message }
  }
  return fieldErrors
}

/** Title is stored trimmed; an empty result drops the field. */
function normalize(input: BookingInput): BookingInput {
  const { title, ...rest } = input
  const trimmed = title?.trim()
  return trimmed ? { ...rest, title: trimmed } : rest
}

type Gap = { start: number; end: number }

/** `part` minus the booking intervals; returns the first remaining piece. */
function firstFreePiece(part: Gap, taken: Gap[]): Gap | null {
  let pieces: Gap[] = [part]
  for (const t of taken) {
    pieces = pieces.flatMap((p) => {
      if (t.end <= p.start || t.start >= p.end) return [p]
      const out: Gap[] = []
      if (p.start < t.start) out.push({ start: p.start, end: t.start })
      if (t.end < p.end) out.push({ start: t.end, end: p.end })
      return out
    })
  }
  return pieces[0] ?? null
}

export function createHandlers({ repo, sim, clock }: HandlerDeps): RequestHandler[] {
  /** Steps 1–3: log, latency, one-shot failure. Returns a response if the request must fail. */
  async function begin(request: Request) {
    const url = new URL(request.url)
    sim.log(request.method, url.pathname + url.search)
    const { latencyMs } = sim.get()
    if (latencyMs > 0) await delay(latencyMs)
    const fail = sim.consumeFail(request.method)
    if (fail === 'network') return HttpResponse.error()
    if (fail === '500') {
      return errorResponse(500, { code: 'INTERNAL', message: 'Внутренняя ошибка сервера' })
    }
    return null
  }

  /** Step 7: maybe inject a "foreign" booking into the new part of the requested interval. */
  function maybeRace(next: BookingInput, original?: Booking) {
    if (!sim.wantsRace()) return
    const start = toMinutes(next.start)
    const end = toMinutes(next.end)
    // Only the part that is new compared to the booking being edited can really race.
    let pieces: Gap[] = [{ start, end }]
    if (original && original.date === next.date) {
      const o = { start: toMinutes(original.start), end: toMinutes(original.end) }
      pieces = []
      if (start < o.start) pieces.push({ start, end: Math.min(end, o.start) })
      if (end > o.end) pieces.push({ start: Math.max(start, o.end), end })
    }
    const part = pieces[0]
    if (!part) return
    const taken = repo
      .listByDate(next.date)
      .map((b) => ({ start: toMinutes(b.start), end: toMinutes(b.end) }))
    const free = firstFreePiece(part, taken)
    if (!free) return
    repo.insert({
      date: next.date,
      start: fromMinutes(free.start),
      end: fromMinutes(free.end),
      title: FOREIGN_TITLE,
    })
    sim.spendForcedConflict()
  }

  /** Step 8: R5 against the stored bookings. */
  function conflictResponse(next: BookingInput, excludeId?: string) {
    const overlap = validateBookingInput(next, {
      now: clock.now(),
      existing: repo.listAll(),
      excludeId,
    }).find((v) => v.code === 'OVERLAP')
    if (!overlap) return null
    return errorResponse(409, {
      code: 'CONFLICT',
      message: overlap.message,
      conflicts: overlap.conflicts,
    })
  }

  async function readBody<T extends z.ZodType>(request: Request, schema: T) {
    try {
      const parsed = schema.safeParse(await request.json())
      return parsed.success ? (parsed.data as z.infer<T>) : null
    } catch {
      return null
    }
  }

  return [
    http.get('*/api/bookings', async ({ request }) => {
      const failed = await begin(request)
      if (failed) return failed
      const date = new URL(request.url).searchParams.get('date')
      if (!date || !isValidDateString(date)) {
        return badRequest('Параметр date обязателен и должен быть в формате YYYY-MM-DD', {
          date: { code: 'INVALID_FORMAT', message: VIOLATION_MESSAGES.INVALID_FORMAT },
        })
      }
      return HttpResponse.json(repo.listByDate(date))
    }),

    http.post('*/api/bookings', async ({ request }) => {
      const failed = await begin(request)
      if (failed) return failed
      const body = await readBody(request, inputSchema)
      if (!body) return badRequest('Некорректное тело запроса')
      const fieldErrors = formatErrors(body)
      if (fieldErrors) return badRequest('Некорректный формат даты или времени', fieldErrors)

      const input = normalize(body)
      const violations = validateBookingInput(input, { now: clock.now(), existing: [] })
      if (violations.length > 0) {
        return errorResponse(422, {
          code: 'VALIDATION_ERROR',
          message: 'Проверьте введённые данные',
          fieldErrors: toFieldErrors(violations),
        })
      }
      maybeRace(input)
      const conflict = conflictResponse(input)
      if (conflict) return conflict
      return HttpResponse.json(repo.insert(input), { status: 201 })
    }),

    http.patch('*/api/bookings/:id', async ({ request, params }) => {
      const failed = await begin(request)
      if (failed) return failed
      const id = String(params.id)
      const body = await readBody(request, patchSchema)
      if (!body) return badRequest('Некорректное тело запроса')
      const fieldErrors = formatErrors(body)
      if (fieldErrors) return badRequest('Некорректный формат даты или времени', fieldErrors)

      const stored = repo.get(id)
      if (!stored) return notFound()
      if (isBookingLocked(stored, clock.now())) return locked()

      const next = normalize({
        date: stored.date,
        start: stored.start,
        end: stored.end,
        title: stored.title,
        ...body,
      })

      const violations = validateBookingInput(next, { now: clock.now(), existing: [] })
      if (violations.length > 0) {
        return errorResponse(422, {
          code: 'VALIDATION_ERROR',
          message: 'Проверьте введённые данные',
          fieldErrors: toFieldErrors(violations),
        })
      }
      maybeRace(next, stored)
      const conflict = conflictResponse(next, id)
      if (conflict) return conflict
      const updated = repo.update(id, next)
      return updated ? HttpResponse.json(updated) : notFound()
    }),

    http.delete('*/api/bookings/:id', async ({ request, params }) => {
      const failed = await begin(request)
      if (failed) return failed
      const id = String(params.id)
      const stored = repo.get(id)
      if (!stored) return notFound()
      if (isBookingLocked(stored, clock.now())) return locked()
      repo.delete(id)
      return new HttpResponse(null, { status: 204 })
    }),
  ]
}
