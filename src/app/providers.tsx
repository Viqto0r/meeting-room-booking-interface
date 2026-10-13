import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Toaster } from 'sonner'
import { ThemeProvider, useTheme } from '@/shared/theme'
import { ApiProvider } from '@/api/ApiProvider'
import type { BookingsApi } from '@/api/bookingsApi'
import type { Clock } from '@/shared/clock'
import { ClockProvider } from '@/shared/ClockContext'
import { readRefetchOnFocus } from '@/shared/refetchSetting'
import { createQueryClient } from './queryClient'

type Props = {
  children: ReactNode
  clock?: Clock
  api?: BookingsApi
  queryClient?: QueryClient
}

export function Providers({ children, clock, api, queryClient }: Props) {
  const [client] = useState(
    () => queryClient ?? createQueryClient({ refetchOnFocus: readRefetchOnFocus() }),
  )
  const inner = (
    <ApiProvider api={api}>
      <QueryClientProvider client={client}>
        {children}
        <ThemedToaster />
      </QueryClientProvider>
    </ApiProvider>
  )
  const themed = <ThemeProvider>{inner}</ThemeProvider>
  return clock ? <ClockProvider clock={clock}>{themed}</ClockProvider> : themed
}

function ThemedToaster() {
  const { theme } = useTheme()
  return <Toaster position="bottom-right" theme={theme} />
}
