// The dev panel talks to the mock server only over HTTP (SPEC §5.6).
export type FailMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'ANY'
export type FailKind = '500' | 'network'

export type SimulationState = {
  latencyMs: 0 | 400 | 1500
  raceProbability: number
  forceConflictNext: boolean
  failNext: { kind: FailKind; method: FailMethod; count: number } | null
}

export type DevState = {
  simulation: SimulationState
  /** Pinned "now" (local ISO) or null for the system clock. */
  now: string | null
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = new URL(`/api/__dev${path}`, window.location.origin)
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`dev API ${method} ${path}: ${res.status}`)
  return (res.status === 204 ? undefined : await res.json()) as T
}

export const devApi = {
  getState: () => call<DevState>('GET', '/state'),
  setSimulation: (patch: Partial<SimulationState>) =>
    call<SimulationState>('PUT', '/simulation', patch),
  reset: (seed = true) => call<void>('POST', '/reset', { seed }),
  setClock: (now: string | null) => call<{ now: string | null }>('PUT', '/clock', { now }),
}
