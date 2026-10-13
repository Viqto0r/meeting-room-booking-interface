import { useEffect, useState } from 'react'
import { useClock } from './ClockContext'
import { CLOCK_CHANGED_EVENT } from './clockOverride'

const DEFAULT_TICK_MS = 30_000

/** Current time from the app clock, refreshed every `tickMs` (30 s by default). */
export function useNow(tickMs = DEFAULT_TICK_MS): Date {
  const clock = useClock()
  const [now, setNow] = useState(() => clock.now())
  useEffect(() => {
    const id = setInterval(() => setNow(clock.now()), tickMs)
    const sync = () => setNow(clock.now())
    window.addEventListener(CLOCK_CHANGED_EVENT, sync)
    window.addEventListener('storage', sync) // pinned in another tab
    window.addEventListener('focus', sync) // timers are throttled in background tabs
    document.addEventListener('visibilitychange', sync)
    return () => {
      clearInterval(id)
      window.removeEventListener(CLOCK_CHANGED_EVENT, sync)
      window.removeEventListener('storage', sync)
      window.removeEventListener('focus', sync)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [clock, tickMs])
  return now
}
