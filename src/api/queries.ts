import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import type { Booking, BookingInput } from '@/domain/booking'
import { useBookingsApi } from './ApiProvider'

export const bookingKeys = {
  all: ['bookings'] as const,
  byDate: (date: string) => ['bookings', date] as const,
}

/**
 * `keepPrevious` is for the timeline only: while a new date loads it shows the previous
 * one dimmed. The form must not use it (placeholder data would be validated as real).
 */
export function useBookings(
  date: string,
  { keepPrevious = false }: { keepPrevious?: boolean } = {},
) {
  const api = useBookingsApi()
  return useQuery({
    queryKey: bookingKeys.byDate(date),
    queryFn: ({ signal }) => api.list(date, signal),
    staleTime: 10_000,
    retry: 1,
    placeholderData: keepPrevious ? keepPreviousData : undefined,
  })
}

type MutationCallbacks = {
  /** Called as soon as the request fails, before the list refetch has finished. */
  onError?: (error: Error) => void
}

const invalidateDates = (client: QueryClient, ...dates: string[]) =>
  Promise.all(
    [...new Set(dates)].map((d) => client.invalidateQueries({ queryKey: bookingKeys.byDate(d) })),
  )

// `onSettled` returns the invalidation promise: the mutation stays "pending"
// until the list is refetched, and refetching also happens after errors (409/404/422/500).

export function useCreateBooking({ onError }: MutationCallbacks = {}) {
  const api = useBookingsApi()
  const client = useQueryClient()
  return useMutation<Booking, Error, BookingInput>({
    mutationFn: (input) => api.create(input),
    onError,
    onSettled: (_data, _error, input) => invalidateDates(client, input.date),
  })
}

export type UpdateVariables = { id: string; patch: Partial<BookingInput>; oldDate: string }

export function useUpdateBooking({ onError }: MutationCallbacks = {}) {
  const api = useBookingsApi()
  const client = useQueryClient()
  return useMutation<Booking, Error, UpdateVariables>({
    mutationFn: ({ id, patch }) => api.update(id, patch),
    onError,
    onSettled: (_data, _error, { patch, oldDate }) =>
      invalidateDates(client, oldDate, patch.date ?? oldDate),
  })
}

export type DeleteVariables = { id: string; date: string }

export function useDeleteBooking({ onError }: MutationCallbacks = {}) {
  const api = useBookingsApi()
  const client = useQueryClient()
  return useMutation<void, Error, DeleteVariables>({
    mutationFn: ({ id }) => api.remove(id),
    onError,
    onSettled: (_data, _error, { date }) => invalidateDates(client, date),
  })
}
