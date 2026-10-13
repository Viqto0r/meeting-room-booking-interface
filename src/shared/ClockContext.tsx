import { createContext, useContext, type ReactNode } from 'react'
import { createClock, type Clock } from './clock'

const systemClock = createClock(() => null)
const ClockContext = createContext<Clock>(systemClock)

export function ClockProvider({ clock, children }: { clock: Clock; children: ReactNode }) {
  return <ClockContext.Provider value={clock}>{children}</ClockContext.Provider>
}

// eslint-disable-next-line react/only-export-components
export const useClock = (): Clock => useContext(ClockContext)
