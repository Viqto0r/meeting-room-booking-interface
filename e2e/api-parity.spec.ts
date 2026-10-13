import { spawn, type ChildProcess } from 'node:child_process'
import { expect, test, type Page } from '@playwright/test'

// E65 (P2): the browser mock (MSW) and the Node mock server must answer identically.
const MOCK_URL = process.env.MOCK_URL ?? `http://localhost:${process.env.MOCK_PORT ?? 3001}`

type Call = (
  method: string,
  path: string,
  body?: unknown,
) => Promise<{ status: number; body: unknown }>

const pad = (n: number) => String(n).padStart(2, '0')
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const shift = (days: number) => fmt(new Date(Date.now() + days * 86_400_000))
const T = fmt(new Date())
const D = shift(1)
const Y = shift(-1)

/** Ids differ between servers: replace them with stable placeholders. */
const normalize = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(normalize)
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v).map(([k, val]) => [k, k === 'id' ? '<id>' : normalize(val)]),
    )
  }
  return v
}

const browserCall =
  (page: Page): Call =>
  (method, path, body) =>
    page.evaluate(
      async ([m, p, b]) => {
        const res = await fetch(p as string, {
          method: m as string,
          headers: { 'Content-Type': 'application/json' },
          body: b === undefined ? undefined : JSON.stringify(b),
        })
        const text = await res.text()
        return { status: res.status, body: text ? JSON.parse(text) : null }
      },
      [method, path, body],
    )

const nodeCall: Call = async (method, path, body) => {
  const res = await fetch(MOCK_URL + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

async function prepare(call: Call) {
  await call('PUT', '/api/__dev/clock', { now: `${T}T12:00:00.000` })
  await call('PUT', '/api/__dev/simulation', {
    latencyMs: 0,
    raceProbability: 0,
    forceConflictNext: false,
    failNext: null,
  })
  await call('POST', '/api/__dev/reset', { seed: false })
}

const bk = (date: string, start: string, end: string, title?: string) => ({
  date,
  start,
  end,
  ...(title ? { title } : {}),
})
type Log = Array<{ status: number; body: unknown }>
const cases: Record<string, (call: Call) => Promise<Log>> = {
  A01: async (call) => {
    await call('POST', '/api/__dev/bookings', [
      bk(D, '13:00', '14:00', 'Позже'),
      bk(D, '10:00', '11:00', 'Раньше'),
    ])
    return [await call('GET', `/api/bookings?date=${D}`)]
  },
  A13: async (call) => {
    const log: Log = [await call('POST', '/api/bookings', bk(D, '10:00', '11:00', 'Планёрка'))]
    for (const [s, e] of [
      ['10:30', '11:30'],
      ['09:30', '10:30'],
      ['10:15', '10:45'],
      ['10:00', '11:00'],
      ['09:30', '11:30'],
    ]) {
      log.push(await call('POST', '/api/bookings', bk(D, s!, e!)))
    }
    return log
  },
  A15: async (call) => {
    const created = await call('POST', '/api/bookings', bk(D, '10:00', '11:00', 'Планёрка'))
    const id = (created.body as { id: string }).id
    return [created, await call('PATCH', `/api/bookings/${id}`, { end: '11:30' })]
  },
  A17: async (call) => {
    const first = await call('POST', '/api/bookings', bk(D, '10:00', '11:00'))
    const second = await call('POST', '/api/bookings', bk(D, '11:30', '12:30'))
    const id = (first.body as { id: string }).id
    return [first, second, await call('PATCH', `/api/bookings/${id}`, { end: '12:00' })]
  },
  A23: async (call) => {
    const inserted = await call('POST', '/api/__dev/bookings', [
      bk(T, '12:00', '13:00', 'Идёт'),
      bk(Y, '10:00', '11:00', 'Прошла'),
    ])
    const log: Log = []
    for (const b of inserted.body as Array<{ id: string }>) {
      log.push(await call('PATCH', `/api/bookings/${b.id}`, { title: 'x' }))
      log.push(await call('DELETE', `/api/bookings/${b.id}`))
    }
    return log
  },
}

// both cases share one Node server
test.describe.configure({ mode: 'serial' })

let server: ChildProcess | undefined

test.beforeAll(async () => {
  const up = () =>
    fetch(`${MOCK_URL}/api/__dev/state`).then(
      (r) => r.ok,
      () => false,
    )
  if (await up()) return
  server = spawn('npm', ['run', '-s', 'mock:server'], {
    stdio: 'ignore',
    detached: true,
    env: { ...process.env, MOCK_PORT: new URL(MOCK_URL).port },
  })
  for (let i = 0; i < 100 && !(await up()); i++) await new Promise((r) => setTimeout(r, 100))
})
test.afterAll(() => {
  if (server?.pid) process.kill(-server.pid)
})

for (const [id, run] of Object.entries(cases)) {
  test(`E65 ${id}: MSW и Node-сервер отвечают одинаково`, async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/`)
    await page.waitForFunction(
      () => (window as unknown as { __mswReady?: boolean }).__mswReady === true,
    )
    const inBrowser = browserCall(page)
    await prepare(inBrowser)
    await prepare(nodeCall)
    const [a, b] = [normalize(await run(inBrowser)), normalize(await run(nodeCall))]
    expect(a).toEqual(b)
    expect((a as Log).length).toBeGreaterThan(0)
  })
}
