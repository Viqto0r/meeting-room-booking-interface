import type { KeyValueStorage } from './storage'

export const CLOCK_OVERRIDE_KEY = 'room-booking:clock:v1'

export interface ClockOverride {
  /** Local ISO string (YYYY-MM-DDTHH:mm:ss.sss) or null when the system clock is used. */
  get(): string | null
  set(value: string | null): void
}

/** Shared by the UI clock and the mock handlers (same storage, so both see the same time). */
export function createClockOverride(storage: KeyValueStorage): ClockOverride {
  return {
    get: () => storage.get(CLOCK_OVERRIDE_KEY) || null,
    set: (value) => storage.set(CLOCK_OVERRIDE_KEY, value ?? ''),
  }
}

/** Fired on `window` after the pinned time changes, so `useNow` can pick it up at once. */
export const CLOCK_CHANGED_EVENT = 'room-booking:clock-changed'
