import type { Booking } from '@/domain/booking'
import { toMinutes } from '@/domain/time'
import { FOREIGN_TITLE } from './handlers'
import { createTestBackend } from './server'

const D = '2026-10-14'
const base = 'http://localhost'

let ctx: ReturnType<typeof createTestBackend>

beforeEach(() => {
  ctx = createTestBackend()
  ctx.server.listen({ onUnhandledFrame: 'error' })
  ctx.sim.update({ latencyMs: 0 })
  ctx.clockOverride.set('2026-10-13T12:00:00.000')
  ctx.repo.reset({ seed: false })
})

afterEach(() => ctx.server.close())

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
  const text = await res.text()
  return {
    status: res.status,
    contentType: res.headers.get('content-type'),
    body: text ? (JSON.parse(text) as any) : null, // eslint-disable-line
  }
}

const seed = (start: string, end: string, extra: Partial<Booking> = {}) =>
  ctx.repo.insert({ date: D, start, end, ...extra })

function expectNoOverlaps(date = D) {
  const list = ctx.repo.listByDate(date)
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!
      const b = list[j]!
      expect(toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end)).toBe(
        false,
      )
    }
  }
}

describe('GET /api/bookings', () => {
  it('200 sorted by start', async () => {
    seed('13:00', '14:00')
    seed('10:00', '11:00')
    const r = await call('GET', `/api/bookings?date=${D}`)
    expect(r.status).toBe(200)
    expect(r.body.map((b: Booking) => b.start)).toEqual(['10:00', '13:00'])
  })
  it('400 for a missing or invalid date', async () => {
    for (const q of ['', '?date=abc', '?date=2026-02-30']) {
      const r = await call('GET', `/api/bookings${q}`)
      expect(r.status).toBe(400)
      expect(r.body.error.code).toBe('BAD_REQUEST')
      expect(r.contentType).toContain('application/json')
    }
  })
})

describe('POST /api/bookings', () => {
  it('201 with a trimmed title', async () => {
    const r = await call('POST', '/api/bookings', {
      date: D,
      start: '10:00',
      end: '11:00',
      title: '  abc ',
    })
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ date: D, start: '10:00', end: '11:00', title: 'abc' })
    expect(r.body.id).toBeTruthy()
  })
  it('drops an empty title and unknown fields', async () => {
    const r = await call('POST', '/api/bookings', {
      id: 'x',
      foo: 1,
      date: D,
      start: '10:00',
      end: '11:00',
      title: '   ',
    })
    expect(r.status).toBe(201)
    expect(r.body).not.toHaveProperty('title')
    expect(r.body).not.toHaveProperty('foo')
    expect(r.body.id).not.toBe('x')
  })
  it('400 for broken JSON, wrong types and bad format', async () => {
    expect((await call('POST', '/api/bookings', '{oops')).status).toBe(400)
    expect((await call('POST', '/api/bookings', { date: D, end: '11:00' })).status).toBe(400)
    expect(
      (await call('POST', '/api/bookings', { date: D, start: 900, end: '11:00' })).status,
    ).toBe(400)
    expect(
      (await call('POST', '/api/bookings', { date: D, start: '10:00', end: '11:00', title: null }))
        .status,
    ).toBe(400)
    const r = await call('POST', '/api/bookings', { date: D, start: '25:00', end: '11:00' })
    expect(r.status).toBe(400)
    expect(r.body.error.fieldErrors.start.code).toBe('INVALID_FORMAT')
  })
  it('422 with fieldErrors', async () => {
    const r = await call('POST', '/api/bookings', { date: D, start: '10:10', end: '11:00' })
    expect(r.status).toBe(422)
    expect(r.body.error.code).toBe('VALIDATION_ERROR')
    expect(r.body.error.fieldErrors.start.code).toBe('NOT_ALIGNED')
  })
  it('422 PAST_TIME uses the clock', async () => {
    const r = await call('POST', '/api/bookings', {
      date: '2026-10-13',
      start: '11:45',
      end: '12:30',
    })
    expect(r.body.error.fieldErrors.start.code).toBe('PAST_TIME')
    expect(
      (await call('POST', '/api/bookings', { date: '2026-10-13', start: '12:15', end: '12:45' }))
        .status,
    ).toBe(201)
  })
  it('409 with conflicts and without fieldErrors', async () => {
    const existing = seed('10:00', '11:00', { title: 'Планёрка' })
    const r = await call('POST', '/api/bookings', { date: D, start: '10:30', end: '11:30' })
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('CONFLICT')
    expect(r.body.error.conflicts).toEqual([existing])
    expect(r.body.error).not.toHaveProperty('fieldErrors')
  })
  it('422, not 409, when the interval is invalid (masking)', async () => {
    seed('09:00', '10:00')
    const r = await call('POST', '/api/bookings', { date: D, start: '08:45', end: '09:30' })
    expect(r.status).toBe(422)
    expect(r.body.error.fieldErrors.start.code).toBe('OUT_OF_WORKING_HOURS')
  })
})

describe('PATCH /api/bookings/:id', () => {
  it('200 extending its own booking (no self conflict)', async () => {
    const b = seed('10:00', '11:00')
    const r = await call('PATCH', `/api/bookings/${b.id}`, { end: '11:30' })
    expect(r.status).toBe(200)
    expect(r.body.end).toBe('11:30')
  })
  it('200 for {} and title-only patches; empty title removes it', async () => {
    const b = seed('10:00', '11:00', { title: 'A' })
    expect((await call('PATCH', `/api/bookings/${b.id}`, {})).body).toEqual(b)
    expect((await call('PATCH', `/api/bookings/${b.id}`, { title: '' })).body).not.toHaveProperty(
      'title',
    )
  })
  it('404 for an unknown id', async () => {
    const r = await call('PATCH', '/api/bookings/unknown', { title: 'x' })
    expect(r.status).toBe(404)
    expect(r.body.error.code).toBe('NOT_FOUND')
  })
  it('422 BOOKING_LOCKED without fieldErrors', async () => {
    const b = ctx.repo.insert({ date: '2026-10-13', start: '12:00', end: '13:00' })
    const r = await call('PATCH', `/api/bookings/${b.id}`, { title: 'x' })
    expect(r.status).toBe(422)
    expect(r.body.error.reason).toBe('BOOKING_LOCKED')
    expect(r.body.error).not.toHaveProperty('fieldErrors')
  })
  it('422 validates the merged booking', async () => {
    const b = seed('10:00', '11:00')
    const r = await call('PATCH', `/api/bookings/${b.id}`, { end: '13:00' })
    expect(r.status).toBe(422)
    expect(r.body.error.fieldErrors.end.code).toBe('TOO_LONG')
  })
  it('409 lists only the other booking', async () => {
    const b = seed('10:00', '11:00')
    const other = seed('11:30', '12:30')
    const r = await call('PATCH', `/api/bookings/${b.id}`, { end: '12:00' })
    expect(r.status).toBe(409)
    expect(r.body.error.conflicts).toEqual([other])
  })
  it('moves to another date', async () => {
    const b = seed('10:00', '11:00')
    expect((await call('PATCH', `/api/bookings/${b.id}`, { date: '2026-10-15' })).status).toBe(200)
    expect((await call('GET', `/api/bookings?date=${D}`)).body).toEqual([])
    expect((await call('GET', '/api/bookings?date=2026-10-15')).body).toHaveLength(1)
  })
  it('400 for a bad body', async () => {
    const b = seed('10:00', '11:00')
    expect((await call('PATCH', `/api/bookings/${b.id}`, { start: 900 })).status).toBe(400)
  })
})

describe('DELETE /api/bookings/:id', () => {
  it('204 then 404', async () => {
    const b = seed('10:00', '11:00')
    expect((await call('DELETE', `/api/bookings/${b.id}`)).status).toBe(204)
    expect((await call('DELETE', `/api/bookings/${b.id}`)).status).toBe(404)
  })
  it('422 BOOKING_LOCKED for an ongoing booking', async () => {
    const b = ctx.repo.insert({ date: '2026-10-13', start: '12:00', end: '13:00' })
    const r = await call('DELETE', `/api/bookings/${b.id}`)
    expect(r.status).toBe(422)
    expect(r.body.error.reason).toBe('BOOKING_LOCKED')
  })
})

describe('simulation', () => {
  it('failNext 500 on GET needs matching method and count', async () => {
    ctx.sim.update({ failNext: { kind: '500', method: 'GET', count: 2 } })
    expect(
      (await call('POST', '/api/bookings', { date: D, start: '10:00', end: '11:00' })).status,
    ).toBe(201)
    const r = await call('GET', `/api/bookings?date=${D}`)
    expect(r.status).toBe(500)
    expect(r.body.error.code).toBe('INTERNAL')
    expect((await call('GET', `/api/bookings?date=${D}`)).status).toBe(500)
    expect((await call('GET', `/api/bookings?date=${D}`)).status).toBe(200)
  })
  it('failNext network rejects fetch', async () => {
    ctx.sim.update({ failNext: { kind: 'network', method: 'ANY', count: 1 } })
    await expect(call('GET', `/api/bookings?date=${D}`)).rejects.toThrow(/fetch/i)
    expect((await call('GET', `/api/bookings?date=${D}`)).status).toBe(200)
  })
  it('dev endpoints do not spend failNext and are not logged', async () => {
    ctx.sim.update({ failNext: { kind: '500', method: 'ANY', count: 1 } })
    const state = await call('GET', '/api/__dev/state')
    expect(state.status).toBe(200)
    expect(state.body.simulation.failNext).not.toBeNull()
    expect(state.body.requestLog).toEqual([])
    expect((await call('GET', `/api/bookings?date=${D}`)).status).toBe(500)
  })
  it('forceConflictNext yields 409 and a real foreign booking', async () => {
    ctx.sim.update({ forceConflictNext: true })
    const r = await call('POST', '/api/bookings', { date: D, start: '10:00', end: '11:00' })
    expect(r.status).toBe(409)
    expect(r.body.error.conflicts[0].title).toBe(FOREIGN_TITLE)
    expect(ctx.repo.listByDate(D)).toHaveLength(1)
    expect(ctx.sim.get().forceConflictNext).toBe(false)
  })
  it('forceConflictNext is not spent when nothing can be inserted (title-only PATCH)', async () => {
    const b = seed('10:00', '11:00')
    ctx.sim.update({ forceConflictNext: true })
    expect((await call('PATCH', `/api/bookings/${b.id}`, { title: 'x' })).status).toBe(200)
    expect(ctx.sim.get().forceConflictNext).toBe(true)
  })
  it('race on POST keeps the no-overlap invariant', async () => {
    seed('10:30', '11:00')
    ctx.sim.update({ raceProbability: 1 })
    const r = await call('POST', '/api/bookings', { date: D, start: '10:00', end: '11:30' })
    expect(r.status).toBe(409)
    expectNoOverlaps()
  })
  it('race on PATCH inserts only into the new part', async () => {
    const b = seed('10:00', '11:00')
    ctx.sim.update({ raceProbability: 1 })
    const r = await call('PATCH', `/api/bookings/${b.id}`, { end: '11:30' })
    expect(r.status).toBe(409)
    const foreign = ctx.repo.listByDate(D).find((x) => x.title === FOREIGN_TITLE)
    expect(foreign).toMatchObject({ start: '11:00', end: '11:30' })
    expectNoOverlaps()
    // narrowing has no new part: no race
    expect((await call('PATCH', `/api/bookings/${b.id}`, { end: '10:30' })).status).toBe(200)
  })
  it('records requests in the log', async () => {
    await call('GET', `/api/bookings?date=${D}`)
    const state = await call('GET', '/api/__dev/state')
    expect(state.body.requestLog).toHaveLength(1)
    expect(state.body.requestLog[0]).toMatchObject({
      method: 'GET',
      path: `/api/bookings?date=${D}`,
    })
  })
})

describe('dev endpoints', () => {
  it('reset with seed fills today and tomorrow; without seed stays empty', async () => {
    expect((await call('POST', '/api/__dev/reset', { seed: true })).status).toBe(204)
    expect((await call('GET', '/api/bookings?date=2026-10-14')).body.length).toBeGreaterThanOrEqual(
      2,
    )
    await call('POST', '/api/__dev/reset', { seed: false })
    expect((await call('GET', '/api/bookings?date=2026-10-14')).body).toEqual([])
  })
  it('inserts raw bookings without validation', async () => {
    const r = await call('POST', '/api/__dev/bookings', [
      { date: '2026-10-12', start: '10:00', end: '11:00' },
    ])
    expect(r.status).toBe(201)
    expect(r.body[0].id).toBeTruthy()
  })
  it('sets and clears the clock', async () => {
    expect(
      (await call('PUT', '/api/__dev/clock', { now: '2026-10-13T11:59:59.999' })).body,
    ).toEqual({ now: '2026-10-13T11:59:59.999' })
    expect(
      (await call('POST', '/api/bookings', { date: '2026-10-13', start: '12:00', end: '12:30' }))
        .status,
    ).toBe(201)
    expect((await call('PUT', '/api/__dev/clock', { now: null })).body).toEqual({ now: null })
  })
  it('updates simulation settings', async () => {
    const r = await call('PUT', '/api/__dev/simulation', { latencyMs: 0, raceProbability: 0.5 })
    expect(r.body).toMatchObject({ latencyMs: 0, raceProbability: 0.5 })
    expect((await call('PUT', '/api/__dev/simulation', { latencyMs: 7 })).status).toBe(400)
  })
})
