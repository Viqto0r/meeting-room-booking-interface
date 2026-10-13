import type { Booking, BookingInput } from '@/domain/booking'
import type { Clock } from '@/shared/clock'
import type { KeyValueStorage } from '@/shared/storage'
import { createSeed } from './seed'

export const DB_KEY = 'room-booking:db:v1'

export interface BookingRepository {
  listAll(): Booking[]
  listByDate(date: string): Booking[]
  get(id: string): Booking | undefined
  insert(input: BookingInput & { id?: string }): Booking
  /** Replaces the stored booking with `next` (the id is kept). */
  update(id: string, next: BookingInput): Booking | undefined
  delete(id: string): boolean
  /** Replaces all bookings: seed data or an empty list. */
  reset(options?: { seed?: boolean }): void
}

const byStart = (a: Booking, b: Booking) => a.start.localeCompare(b.start)

export function createRepository(storage: KeyValueStorage, clock: Clock): BookingRepository {
  const save = (list: Booking[]) => storage.set(DB_KEY, JSON.stringify(list))

  // Re-read on every call: another tab may have changed the data.
  function load(): Booking[] {
    const raw = storage.get(DB_KEY)
    if (raw === null) {
      const seed = createSeed(clock.now())
      save(seed)
      return seed
    }
    try {
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as Booking[]) : []
    } catch {
      return []
    }
  }

  return {
    listAll: load,
    listByDate: (date) =>
      load()
        .filter((b) => b.date === date)
        .sort(byStart),
    get: (id) => load().find((b) => b.id === id),
    insert(input) {
      const booking: Booking = { ...input, id: input.id ?? crypto.randomUUID() }
      save([...load(), booking])
      return booking
    },
    update(id, next) {
      const list = load()
      const index = list.findIndex((b) => b.id === id)
      if (index === -1) return undefined
      const updated: Booking = { ...next, id }
      list[index] = updated
      save(list)
      return updated
    },
    delete(id) {
      const list = load()
      const next = list.filter((b) => b.id !== id)
      if (next.length === list.length) return false
      save(next)
      return true
    },
    reset({ seed = true } = {}) {
      save(seed ? createSeed(clock.now()) : [])
    },
  }
}
