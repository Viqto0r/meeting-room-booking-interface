import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './index.css'

async function bootstrap() {
  if (import.meta.env.VITE_USE_MOCKS !== 'false') {
    // Dynamic import keeps msw and the handlers out of the bundle when mocks are off.
    const { worker } = await import('./mocks/browser')
    await worker.start({ onUnhandledFrame: 'bypass', quiet: true })
    window.__mswReady = true
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
