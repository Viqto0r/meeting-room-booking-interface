import { QueryClientProvider } from '@tanstack/react-query'
import { render, renderHook } from '@testing-library/react'
import type { ComponentType, ReactElement, ReactNode } from 'react'
import { Toaster } from 'sonner'
import { ApiProvider } from '@/api/ApiProvider'
import { Providers } from '@/app/providers'
import { createQueryClient } from '@/app/queryClient'
import { BookingPage } from '@/features/booking/BookingPage'
import { createTestBackend } from '@/mocks/server'
import { ClockProvider } from '@/shared/ClockContext'

export type TestEnv = ReturnType<typeof setupTestEnv>

/** Fresh in-memory backend + MSW server + QueryClient for one test. */
export function setupTestEnv(now = '2026-10-13T12:00:00.000') {
  const backend = createTestBackend()
  backend.sim.update({ latencyMs: 0 })
  backend.clockOverride.set(now)
  backend.repo.reset({ seed: false })
  backend.server.listen({ onUnhandledFrame: 'error' })
  const queryClient = createQueryClient({ retryDelayMs: 10 })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ClockProvider clock={backend.clock}>
      <ApiProvider>
        <QueryClientProvider client={queryClient}>
          {children}
          <Toaster />
        </QueryClientProvider>
      </ApiProvider>
    </ClockProvider>
  )
  return {
    ...backend,
    queryClient,
    wrapper,
    close: () => {
      backend.server.close()
      queryClient.clear()
    },
  }
}

type Wrapped = { wrapper: ComponentType<{ children: ReactNode }> }

export const renderWithEnv = (ui: ReactElement, env: Wrapped) =>
  render(ui, { wrapper: env.wrapper })

export const renderHookWithEnv = <T,>(hook: () => T, env: Wrapped) =>
  renderHook(hook, { wrapper: env.wrapper })

/** The whole page on `?date=`, as a user would open it. */
export function renderPage(env: TestEnv, date: string) {
  window.history.replaceState(null, '', `/?date=${date}`)
  return render(
    <Providers clock={env.clock} queryClient={env.queryClient}>
      <BookingPage />
    </Providers>,
  )
}
