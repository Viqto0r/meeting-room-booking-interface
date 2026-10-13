// Helpers for the interactive QA pass (T15): Playwright scripts against a running app.
import { chromium } from '@playwright/test'

export const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:4173'
export const SHOTS = new URL('../../docs/qa/screenshots/', import.meta.url).pathname

export const pad = (n) => String(n).padStart(2, '0')
export const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const addDays = (s, n) => {
  const [y, m, d] = s.split('-').map(Number)
  return fmt(new Date(y, m - 1, d + n))
}
export const TODAY = fmt(new Date())
export const D = addDays(TODAY, 1)

export async function launch() {
  return chromium.launch()
}

/** Collects console errors / page errors for a page. */
export function watch(page, sink = []) {
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') sink.push(`[${m.type()}] ${m.text()}`)
  })
  page.on('pageerror', (e) => sink.push(`[pageerror] ${e.message}`))
  return sink
}

export const devFetch = (page, method, path, body) =>
  page.evaluate(
    async ([m, p, b]) => {
      const res = await fetch(p, {
        method: m,
        headers: { 'Content-Type': 'application/json' },
        body: b === undefined ? undefined : JSON.stringify(b),
      })
      const text = await res.text()
      return { status: res.status, body: text ? JSON.parse(text) : null }
    },
    [method, path, body],
  )

/**
 * Fixture order (SPEC §9.2): goto -> __mswReady -> __dev/* -> reload.
 * opts: { path, bookings, simulation, clock, seed }
 */
export async function setup(page, opts = {}) {
  const { path = '/', bookings = [], simulation, clock, seed = false } = opts
  await page.goto(BASE + '/')
  await page.waitForFunction(() => window.__mswReady === true)
  await devFetch(page, 'PUT', '/api/__dev/simulation', {
    latencyMs: 0,
    raceProbability: 0,
    forceConflictNext: false,
    failNext: null,
  })
  await devFetch(page, 'PUT', '/api/__dev/clock', { now: clock ?? null })
  await devFetch(page, 'POST', '/api/__dev/reset', { seed })
  if (bookings.length) await devFetch(page, 'POST', '/api/__dev/bookings', bookings)
  if (simulation) await devFetch(page, 'PUT', '/api/__dev/simulation', simulation)
  await page.goto(BASE + path)
  await page.waitForFunction(() => window.__mswReady === true)
}

export const state = async (page) => (await devFetch(page, 'GET', '/api/__dev/state')).body

export async function shot(page, name) {
  const file = `${SHOTS}${name}.png`
  await page.screenshot({ path: file, fullPage: true })
  return file
}
