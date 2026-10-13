import { createContext, useContext, type ReactNode } from 'react'
import { httpBookingsApi, type BookingsApi } from './bookingsApi'

const ApiContext = createContext<BookingsApi>(httpBookingsApi)

export function ApiProvider({
  api = httpBookingsApi,
  children,
}: {
  api?: BookingsApi
  children: ReactNode
}) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>
}

// eslint-disable-next-line react/only-export-components
export function useBookingsApi(): BookingsApi {
  return useContext(ApiContext)
}
