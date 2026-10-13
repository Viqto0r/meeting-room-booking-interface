import { render, screen } from '@testing-library/react'
import { Providers } from './providers'
import { BookingPage } from '@/features/booking/BookingPage'
import type { BookingsApi } from '@/api/bookingsApi'

test('renders heading and the empty state', async () => {
  const api: BookingsApi = {
    list: async () => [],
    create: async () => {
      throw new Error('unused')
    },
    update: async () => {
      throw new Error('unused')
    },
    remove: async () => {},
  }
  render(
    <Providers api={api}>
      <BookingPage />
    </Providers>,
  )
  expect(screen.getByRole('heading', { name: 'Бронирование переговорной' })).toBeInTheDocument()
  expect(await screen.findByText('На эту дату бронирований нет')).toBeInTheDocument()
})
