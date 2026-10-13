export interface KeyValueStorage {
  get(key: string): string | null
  set(key: string, value: string): void
}

export function createMemoryStorage(): KeyValueStorage {
  const map = new Map<string, string>()
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => void map.set(key, value),
  }
}

/** Wraps a Web Storage; falls back to memory if the storage is unavailable or full. */
export function createWebStorage(storage: Storage): KeyValueStorage {
  const fallback = createMemoryStorage()
  let degraded = false
  return {
    get(key) {
      if (degraded) return fallback.get(key)
      try {
        return storage.getItem(key)
      } catch {
        degraded = true
        return fallback.get(key)
      }
    },
    set(key, value) {
      if (!degraded) {
        try {
          storage.setItem(key, value)
          return
        } catch {
          degraded = true
        }
      }
      fallback.set(key, value)
    },
  }
}
