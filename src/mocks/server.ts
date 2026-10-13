import { setupServer } from 'msw/node'
import { createMemoryStorage } from '@/shared/storage'
import { createBackend } from './backend'

/** A fresh in-memory backend with its own MSW server (Vitest). */
export function createTestBackend(random?: () => number) {
  const backend = createBackend(
    {
      persistent: createMemoryStorage(),
      oneShot: createMemoryStorage(),
      clock: createMemoryStorage(),
    },
    random,
  )
  return { ...backend, server: setupServer(...backend.handlers) }
}
