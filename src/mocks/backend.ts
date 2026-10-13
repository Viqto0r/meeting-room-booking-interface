import type { RequestHandler } from 'msw'
import { createClock, type Clock } from '@/shared/clock'
import { createClockOverride, type ClockOverride } from '@/shared/clockOverride'
import type { KeyValueStorage } from '@/shared/storage'
import { createDevHandlers } from './devHandlers'
import { createHandlers } from './handlers'
import { createSimulation, type Simulation } from './simulation'
import { createRepository, type BookingRepository } from './store'

export type BackendStorages = {
  /** Bookings and persistent settings. */
  persistent: KeyValueStorage
  /** One-shot flags (own tab in the browser). */
  oneShot: KeyValueStorage
  /** Clock override shared with the UI. */
  clock: KeyValueStorage
}

export type Backend = {
  handlers: RequestHandler[]
  repo: BookingRepository
  sim: Simulation
  clock: Clock
  clockOverride: ClockOverride
}

/** Wires storages, repository, simulation and handlers. All dependencies are explicit. */
export function createBackend(storages: BackendStorages, random?: () => number): Backend {
  const clockOverride = createClockOverride(storages.clock)
  const clock = createClock(() => clockOverride.get())
  const repo = createRepository(storages.persistent, clock)
  const sim = createSimulation(storages.persistent, storages.oneShot, random)
  return {
    handlers: [
      ...createHandlers({ repo, sim, clock }),
      ...createDevHandlers({ repo, sim, clockOverride }),
    ],
    repo,
    sim,
    clock,
    clockOverride,
  }
}
