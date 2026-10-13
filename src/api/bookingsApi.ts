import type { Booking, BookingInput } from '@/domain/booking'
import { createHttpClient, type HttpClientOptions } from './http'
import { bookingSchema, bookingsSchema } from './schemas'

export interface BookingsApi {
  list(date: string, signal?: AbortSignal): Promise<Booking[]>
  create(input: BookingInput): Promise<Booking>
  update(id: string, patch: Partial<BookingInput>): Promise<Booking>
  remove(id: string): Promise<void>
}

export function createHttpBookingsApi(options?: HttpClientOptions): BookingsApi {
  const { request } = createHttpClient(options)
  return {
    list: (date, signal) =>
      request({
        method: 'GET',
        path: '/api/bookings',
        query: { date },
        signal,
        schema: bookingsSchema,
      }),
    create: (input) =>
      request({ method: 'POST', path: '/api/bookings', body: input, schema: bookingSchema }),
    update: (id, patch) =>
      request({
        method: 'PATCH',
        path: `/api/bookings/${encodeURIComponent(id)}`,
        body: patch,
        schema: bookingSchema,
      }),
    remove: (id) => request({ method: 'DELETE', path: `/api/bookings/${encodeURIComponent(id)}` }),
  }
}

export const httpBookingsApi: BookingsApi = createHttpBookingsApi()
