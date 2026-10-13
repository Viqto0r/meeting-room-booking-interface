import { useCallback, useEffect, useState } from 'react'
import { formatLocalDate, isValidDateString } from '@/domain/time'
import { useClock } from './ClockContext'

/** Page date, synchronised with `?date=` (invalid or missing value falls back to today). */
export function useSelectedDate(): [string, (date: string) => void] {
  const clock = useClock()
  const [date, setDateState] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('date')
    return fromUrl !== null &&
      isValidDateString(fromUrl) &&
      fromUrl >= '1970-01-01' &&
      fromUrl <= '2100-12-31'
      ? fromUrl
      : formatLocalDate(clock.now())
  })

  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('date') !== date) {
      url.searchParams.set('date', date)
      window.history.replaceState(null, '', url)
    }
  }, [date])

  const setDate = useCallback((next: string) => setDateState(next), [])
  return [date, setDate]
}
