import { setupWorker } from 'msw/browser'
import { createWebStorage } from '@/shared/storage'
import { createBackend } from './backend'

const backend = createBackend({
  persistent: createWebStorage(localStorage),
  oneShot: createWebStorage(sessionStorage),
  clock: createWebStorage(localStorage),
})

export const worker = setupWorker(...backend.handlers)
