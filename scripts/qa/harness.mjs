// Scenario runner for the interactive QA pass (T15).
// Usage: QA_VIEWPORT=desktop|mobile node scripts/qa/run.mjs [E-id filter]
import fs from 'node:fs'
import { chromium } from '@playwright/test'
import { BASE, SHOTS, devFetch, pad, fmt, addDays } from './lib.mjs'

export const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 375, height: 812 },
}
export const VP = process.env.QA_VIEWPORT === 'mobile' ? 'mobile' : 'desktop'
const FILTER = process.argv[2] ? new RegExp(process.argv[2]) : null
const RESULTS_DIR = new URL('../../docs/qa/results/', import.meta.url).pathname

export const TODAY = fmt(new Date())
export const D = addDays(TODAY, 1)
export const D2 = addDays(TODAY, 2)
export const D3 = addDays(TODAY, 3)
export const Y = addDays(TODAY, -1)
export { addDays, pad, fmt, BASE }

let browser
export const results = []

export async function startBrowser() {
  browser = await chromium.launch()
}
export async function stopBrowser() {
  await browser?.close()
}

const accessibleName = () => {
  const el = document.activeElement
  if (!el) return 'none'
  const label = el.getAttribute('aria-label')
  const labelled = el.labels?.[0]?.textContent?.trim()
  return `${el.tagName.toLowerCase()}[${label ?? labelled ?? el.textContent?.trim().slice(0, 40) ?? ''}]`
}

let runner = null
/** The Playwright Test adapter (e2e/) registers tests instead of running scenarios in place. */
export function setRunner(fn) {
  runner = fn
}

/** Runs one scenario in a fresh browser context. `fn` receives helper object `t`. */
export async function scenario(id, title, fn, opts = {}) {
  if (runner) return runner(id, title, fn, opts)
  if (FILTER && !FILTER.test(id)) return
  const res = await execute(browser, id, title, fn, opts, {
    viewport: opts.viewport ?? VIEWPORTS[VP],
    shots: true,
  })
  results.push(res)
  console.log(
    `${res.status} ${id} [${VP}] ${title}${res.failures.length ? '\n   ' + res.failures.join('\n   ') : ''}${res.consoleErrors.length ? '\n   console: ' + res.consoleErrors.join(' | ') : ''}`,
  )
}

export async function execute(pwBrowser, id, title, fn, opts, { viewport, shots: saveShots }) {
  const ctx = await pwBrowser.newContext({
    viewport,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    reducedMotion: opts.reducedMotion ?? 'no-preference',
    serviceWorkers: 'allow',
  })
  const failures = []
  const notes = []
  const shots = []
  const consoleErrors = []
  const pages = []
  const allowed = opts.expectErrors ?? []
  const watch = (page) => {
    pages.push(page)
    page.on('console', (m) => {
      if (m.type() !== 'error' && m.type() !== 'warning') return
      const text = m.text()
      if (allowed.some((re) => re.test(text))) return
      consoleErrors.push(`[${m.type()}] ${text}`)
    })
    page.on('pageerror', (e) => consoleErrors.push(`[pageerror] ${e.message}`))
  }
  const page = await ctx.newPage()
  watch(page)

  const t = {
    page,
    ctx,
    viewport,
    newPage: async () => {
      const p = await ctx.newPage()
      watch(p)
      return p
    },
    check(cond, message) {
      if (!cond) failures.push(message)
      return cond
    },
    eq(actual, expected, message) {
      const ok = JSON.stringify(actual) === JSON.stringify(expected)
      if (!ok)
        failures.push(
          `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
        )
      return ok
    },
    note: (text) => notes.push(text),
    async shot(name, { p = page, fullPage = true } = {}) {
      const file = `${id}-${name}-${viewport.width}.png`
      if (saveShots) await p.screenshot({ path: SHOTS + file, fullPage })
      shots.push(file)
      return file
    },
    focused: (p = page) => p.evaluate(accessibleName),
    dev: (method, path, body, p = page) => devFetch(p, method, path, body),
    state: async (p = page) => (await devFetch(p, 'GET', '/api/__dev/state')).body,
    /** Fixture order from SPEC §9.2: goto -> __mswReady -> __dev/* -> reload. */
    async open(options = {}, p = page) {
      const { path = '/', bookings = [], simulation, clock, seed = false } = options
      await p.goto(BASE + '/')
      await p.waitForFunction(() => window.__mswReady === true)
      await devFetch(p, 'PUT', '/api/__dev/simulation', {
        latencyMs: 0,
        raceProbability: 0,
        forceConflictNext: false,
        failNext: null,
      })
      await devFetch(p, 'PUT', '/api/__dev/clock', { now: clock ?? null })
      await devFetch(p, 'POST', '/api/__dev/reset', { seed })
      if (bookings.length) await devFetch(p, 'POST', '/api/__dev/bookings', bookings)
      if (simulation) await devFetch(p, 'PUT', '/api/__dev/simulation', simulation)
      await p.goto(BASE + path)
      await p.waitForFunction(() => window.__mswReady === true)
    },
  }

  const started = Date.now()
  try {
    await fn(t)
  } catch (e) {
    failures.push(`exception: ${String(e.message).split('\n')[0]}`)
  }
  const status = failures.length || consoleErrors.length ? '❌' : '✅'
  await ctx.close()
  return {
    id,
    title,
    viewport: VP,
    status,
    failures,
    notes,
    shots,
    consoleErrors,
    seconds: Math.round((Date.now() - started) / 100) / 10,
  }
}

export function saveResults(group) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true })
  const file = `${RESULTS_DIR}${VP}-${group}.json`
  const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : []
  const merged = [
    ...existing.filter((r) => !results.some((n) => n.id === r.id && n.title === r.title)),
    ...results,
  ]
  fs.writeFileSync(file, JSON.stringify(merged, null, 2))
  results.length = 0
}

// ---- common UI helpers -----------------------------------------------------------------
export const ui = (page) => ({
  newBooking: () => page.getByRole('button', { name: 'Новая бронь' }),
  start: () => page.getByLabel('Начало'),
  end: () => page.getByLabel('Окончание'),
  title: () => page.getByLabel(/Название/),
  date: () => page.getByLabel('Дата брони'),
  create: () => page.getByRole('button', { name: 'Создать' }),
  save: () => page.getByRole('button', { name: 'Сохранить' }),
  block: (re) => page.getByRole('button', { name: re }),
  toast: () => page.locator('[data-sonner-toast]'),
  heading: (name) => page.getByRole('heading', { name, level: 2 }),
  cell: (time) => page.locator(`[data-testid="timeline-cell"][data-start="${time}"]`),
  current: () => page.getByTestId('current-date'),
})

export const bk = (date, start, end, title) => ({ date, start, end, ...(title ? { title } : {}) })

export async function posts(t, p = t.page) {
  const s = await t.state(p)
  return s.requestLog.filter((r) => r.method === 'POST').length
}
export async function requestLog(t, p = t.page) {
  return (await t.state(p)).requestLog
}
/** True if a GET for `date` follows the last mutation in the request log (E58). */
export async function refetchedAfterMutation(t, date, p = t.page) {
  const log = await requestLog(t, p)
  const lastMutation = log.map((r) => r.method).findLastIndex((m) => m !== 'GET')
  if (lastMutation === -1) return false
  return log
    .slice(lastMutation + 1)
    .some((r) => r.method === 'GET' && r.path.includes(`date=${date}`))
}
