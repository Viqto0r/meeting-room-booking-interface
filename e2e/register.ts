import { test, expect } from '@playwright/test'
// The scenarios are shared with the interactive QA pass (scripts/qa) — one source of truth.
// @ts-expect-error plain .mjs module without types
import { setRunner, execute } from '../scripts/qa/harness.mjs'

export const SMOKE = new Set(['E01', 'E10', 'E41', 'E50', 'E53', 'E63'])

type Scenario = (t: unknown) => Promise<void>
type Opts = {
  viewport?: { width: number; height: number }
  expectErrors?: RegExp[]
  reducedMotion?: string
}

/** Registers the scenarios of one group as Playwright tests. `smoke`: true = only @smoke ones, false = the rest. */
export async function registerGroup(group: string, smoke: boolean) {
  setRunner((id: string, title: string, fn: Scenario, opts: Opts = {}) => {
    const isSmoke = SMOKE.has(id)
    if (isSmoke !== smoke) return
    const name = `${id} ${title}${isSmoke ? ' @smoke' : ''}`
    test(name, async ({ browser }, testInfo) => {
      const viewport = opts.viewport ??
        testInfo.project.use.viewport ?? { width: 1280, height: 800 }
      const result = await execute(browser, id, title, fn, opts, { viewport, shots: false })
      expect(result.failures, 'scenario checks').toEqual([])
      expect(result.consoleErrors, 'console errors').toEqual([])
    })
  })
  await import(`../scripts/qa/groups/${group}.mjs?mode=${smoke ? 'smoke' : 'rest'}`)
}
