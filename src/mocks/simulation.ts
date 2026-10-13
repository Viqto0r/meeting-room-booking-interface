import type { KeyValueStorage } from '@/shared/storage'

export type FailKind = '500' | 'network'
export type FailMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'ANY'
export type FailNext = { kind: FailKind; method: FailMethod; count: number }
export type LatencyMs = 0 | 400 | 1500

export type SimulationSettings = {
  latencyMs: LatencyMs
  raceProbability: number
  forceConflictNext: boolean
  failNext: FailNext | null
}

export type RequestLogEntry = { seq: number; method: string; path: string; at: string }

export const SIM_KEY = 'room-booking:sim:v1'
export const FLAGS_KEY = 'room-booking:flags:v1'
const LOG_LIMIT = 100

export interface Simulation {
  get(): SimulationSettings
  update(patch: Partial<SimulationSettings>): SimulationSettings
  /** Spends one `failNext` unit if the method matches. */
  consumeFail(method: string): FailKind | null
  /** Whether a conflicting booking should be injected (does not spend the flag). */
  wantsRace(): boolean
  /** Spends `forceConflictNext`; called only after a real insertion. */
  spendForcedConflict(): void
  /** Clears one-shot flags and the request log. */
  reset(): void
  log(method: string, path: string): void
  requestLog(): RequestLogEntry[]
}

const LATENCIES: readonly number[] = [0, 400, 1500]

function readJson(storage: KeyValueStorage, key: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(storage.get(key) ?? 'null')
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function parseFailNext(value: unknown): FailNext | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const kinds = ['500', 'network']
  const methods = ['GET', 'POST', 'PATCH', 'DELETE', 'ANY']
  if (
    typeof v.kind === 'string' &&
    kinds.includes(v.kind) &&
    typeof v.method === 'string' &&
    methods.includes(v.method) &&
    typeof v.count === 'number' &&
    v.count > 0
  ) {
    return { kind: v.kind as FailKind, method: v.method as FailMethod, count: v.count }
  }
  return null
}

export function createSimulation(
  persistent: KeyValueStorage,
  oneShot: KeyValueStorage,
  random: () => number = Math.random,
): Simulation {
  let seq = 0
  let entries: RequestLogEntry[] = []

  const get = (): SimulationSettings => {
    const p = readJson(persistent, SIM_KEY)
    const o = readJson(oneShot, FLAGS_KEY)
    return {
      latencyMs: LATENCIES.includes(p.latencyMs as number) ? (p.latencyMs as LatencyMs) : 400,
      raceProbability:
        typeof p.raceProbability === 'number' ? Math.min(1, Math.max(0, p.raceProbability)) : 0,
      forceConflictNext: o.forceConflictNext === true,
      failNext: parseFailNext(o.failNext),
    }
  }

  const write = (s: SimulationSettings) => {
    persistent.set(
      SIM_KEY,
      JSON.stringify({ latencyMs: s.latencyMs, raceProbability: s.raceProbability }),
    )
    oneShot.set(
      FLAGS_KEY,
      JSON.stringify({ forceConflictNext: s.forceConflictNext, failNext: s.failNext }),
    )
  }

  return {
    get,
    update(patch) {
      const next = { ...get(), ...patch }
      write(next)
      return get()
    },
    consumeFail(method) {
      const s = get()
      const f = s.failNext
      if (!f || (f.method !== 'ANY' && f.method !== method)) return null
      const left = f.count - 1
      oneShot.set(
        FLAGS_KEY,
        JSON.stringify({
          forceConflictNext: s.forceConflictNext,
          failNext: left > 0 ? { ...f, count: left } : null,
        }),
      )
      return f.kind
    },
    wantsRace() {
      const s = get()
      return s.forceConflictNext || (s.raceProbability > 0 && random() < s.raceProbability)
    },
    spendForcedConflict() {
      const s = get()
      if (s.forceConflictNext) write({ ...s, forceConflictNext: false })
    },
    reset() {
      write({ ...get(), forceConflictNext: false, failNext: null })
      entries = []
    },
    log(method, path) {
      entries.push({ seq: ++seq, method, path, at: new Date().toISOString() })
      if (entries.length > LOG_LIMIT) entries = entries.slice(-LOG_LIMIT)
    },
    requestLog: () => [...entries],
  }
}
