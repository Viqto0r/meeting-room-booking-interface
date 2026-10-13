import { BookingPage } from '@/features/booking/BookingPage'
import { createClock } from '@/shared/clock'
import { createClockOverride } from '@/shared/clockOverride'
import { createWebStorage } from '@/shared/storage'
import { Providers } from './providers'

// With mocks on, the dev panel can pin "now" (SPEC D14); the mock handlers read the same key.
const clock =
  import.meta.env.VITE_USE_MOCKS !== 'false'
    ? createClock(() => createClockOverride(createWebStorage(localStorage)).get())
    : createClock(() => null)

export function App() {
  return (
    <Providers clock={clock}>
      <BookingPage />
    </Providers>
  )
}
