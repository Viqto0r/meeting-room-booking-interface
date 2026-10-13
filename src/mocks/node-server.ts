// Standalone mock API for curl-based checks (SPEC §5.5). Not part of the browser bundle.
import type { ServerResponse } from 'node:http'
import { createServer } from '@msw/serve'
import { createMemoryStorage } from '../shared/storage'
import { createBackend } from './backend'

const port = Number(process.env.MOCK_PORT ?? 3001)

const backend = createBackend({
  persistent: createMemoryStorage(),
  oneShot: createMemoryStorage(),
  clock: createMemoryStorage(),
})

const server = createServer(...backend.handlers)

// `HttpResponse.error()` is a Response with status 0. The adapter would turn it into a 500,
// so a status of 0 is intercepted here and the socket is dropped instead (a real network error).
const [listener] = server.listeners('request') as Array<(req: unknown, res: ServerResponse) => void>
server.removeAllListeners('request')
server.on('request', (req, res: ServerResponse) => {
  let status = 200
  Object.defineProperty(res, 'statusCode', {
    configurable: true,
    get: () => status,
    set(value: number) {
      if (res.socket?.destroyed) return
      if (value === 0) {
        res.socket?.destroy()
        return
      }
      status = value
    },
  })
  listener?.(req, res)
})

server.listen(port, () => {
  console.info(`Mock API listening on http://localhost:${port}`)
})
