import { http, HttpResponse, type RequestHandler } from 'msw'
import { z } from 'zod'
import type { ClockOverride } from '@/shared/clockOverride'
import type { Simulation } from './simulation'
import type { BookingRepository } from './store'

export type DevHandlerDeps = {
  repo: BookingRepository
  sim: Simulation
  clockOverride: ClockOverride
}

const resetSchema = z.object({ seed: z.boolean().optional() })
const bookingsSchema = z.array(
  z.object({
    id: z.string().optional(),
    date: z.string(),
    start: z.string(),
    end: z.string(),
    title: z.string().optional(),
  }),
)
const simulationSchema = z
  .object({
    latencyMs: z.union([z.literal(0), z.literal(400), z.literal(1500)]),
    raceProbability: z.number().min(0).max(1),
    forceConflictNext: z.boolean(),
    failNext: z
      .object({
        kind: z.enum(['500', 'network']),
        method: z.enum(['GET', 'POST', 'PATCH', 'DELETE', 'ANY']),
        count: z.number().int().min(1).default(1),
      })
      .nullable(),
  })
  .partial()
const clockSchema = z.object({
  now: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/)
    .nullable(),
})

const bad = (message: string) =>
  HttpResponse.json({ error: { code: 'BAD_REQUEST', message } }, { status: 400 })

async function parse<T extends z.ZodType>(request: Request, schema: T, allowEmpty = false) {
  try {
    const text = await request.text()
    const json: unknown = text === '' && allowEmpty ? {} : JSON.parse(text)
    const result = schema.safeParse(json)
    return result.success ? (result.data as z.infer<T>) : null
  } catch {
    return null
  }
}

/**
 * Service endpoints for demos and tests. They are not logged, not delayed
 * and never spend one-shot flags.
 */
export function createDevHandlers({ repo, sim, clockOverride }: DevHandlerDeps): RequestHandler[] {
  return [
    http.post('*/api/__dev/reset', async ({ request }) => {
      const body = await parse(request, resetSchema, true)
      if (!body) return bad('Invalid body')
      sim.reset()
      repo.reset({ seed: body.seed ?? true })
      return new HttpResponse(null, { status: 204 })
    }),

    http.post('*/api/__dev/bookings', async ({ request }) => {
      const body = await parse(request, bookingsSchema)
      if (!body) return bad('Invalid body')
      return HttpResponse.json(
        body.map((b) => repo.insert(b)),
        { status: 201 },
      )
    }),

    http.put('*/api/__dev/simulation', async ({ request }) => {
      const body = await parse(request, simulationSchema)
      if (!body) return bad('Invalid body')
      return HttpResponse.json(sim.update(body))
    }),

    http.put('*/api/__dev/clock', async ({ request }) => {
      const body = await parse(request, clockSchema)
      if (!body) return bad('Invalid body')
      clockOverride.set(body.now)
      return HttpResponse.json({ now: clockOverride.get() })
    }),

    http.get('*/api/__dev/state', () =>
      HttpResponse.json({
        simulation: sim.get(),
        now: clockOverride.get(),
        requestLog: sim.requestLog(),
      }),
    ),
  ]
}
