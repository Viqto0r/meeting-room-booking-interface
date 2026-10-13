import { act, waitFor } from '@testing-library/react'
import { ApiError } from './errors'
import { useBookings, useCreateBooking, useDeleteBooking, useUpdateBooking } from './queries'
import { renderHookWithEnv, setupTestEnv, type TestEnv } from '@/test/renderWithProviders'

const D = '2026-10-14'
const D2 = '2026-10-15'

let env: TestEnv
beforeEach(() => {
  env = setupTestEnv()
})
afterEach(() => env.close())

const gets = () =>
  env.sim
    .requestLog()
    .filter((r) => r.method === 'GET')
    .map((r) => r.path)
const methods = () => env.sim.requestLog().map((r) => r.method)

describe('queries', () => {
  it('refetches the date after a failed (409) create', async () => {
    env.repo.insert({ date: D, start: '10:00', end: '11:00', title: 'Занято' })
    const { result } = renderHookWithEnv(
      () => ({ list: useBookings(D), create: useCreateBooking() }),
      env,
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))
    expect(methods()).toEqual(['GET'])

    let error: unknown
    await act(async () => {
      try {
        await result.current.create.mutateAsync({ date: D, start: '10:30', end: '11:30' })
      } catch (e) {
        error = e
      }
    })
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(409)
    // POST was followed by a GET for exactly that date; the mutation waited for it.
    expect(methods()).toEqual(['GET', 'POST', 'GET'])
    expect(gets().at(-1)).toBe(`/api/bookings?date=${D}`)
  })

  it('does not retry mutations but retries GET once', async () => {
    env.sim.update({ failNext: { kind: '500', method: 'POST', count: 5 } })
    const { result } = renderHookWithEnv(() => useCreateBooking(), env)
    await act(async () => {
      await result.current.mutateAsync({ date: D, start: '10:00', end: '11:00' }).catch(() => {})
    })
    expect(methods().filter((m) => m === 'POST')).toHaveLength(1)

    env.sim.update({ failNext: { kind: '500', method: 'GET', count: 1 } })
    const list = renderHookWithEnv(() => useBookings(D), env)
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true))
  })

  it('invalidates both the old and the new date on update', async () => {
    const b = env.repo.insert({ date: D, start: '10:00', end: '11:00' })
    const { result } = renderHookWithEnv(
      () => ({ a: useBookings(D), b: useBookings(D2), update: useUpdateBooking() }),
      env,
    )
    await waitFor(() => expect(result.current.a.isSuccess && result.current.b.isSuccess).toBe(true))
    await act(async () => {
      await result.current.update.mutateAsync({ id: b.id, patch: { date: D2 }, oldDate: D })
    })
    expect(gets().slice(-2).sort()).toEqual(
      [`/api/bookings?date=${D}`, `/api/bookings?date=${D2}`].sort(),
    )
    await waitFor(() => expect(result.current.b.data).toHaveLength(1))
    expect(result.current.a.data).toHaveLength(0)
  })

  it('refetches the date after delete, also when the booking is already gone (404)', async () => {
    const b = env.repo.insert({ date: D, start: '10:00', end: '11:00' })
    const { result } = renderHookWithEnv(
      () => ({ list: useBookings(D), del: useDeleteBooking() }),
      env,
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))
    env.repo.delete(b.id) // removed elsewhere
    await act(async () => {
      await result.current.del.mutateAsync({ id: b.id, date: D }).catch(() => {})
    })
    expect(methods()).toEqual(['GET', 'DELETE', 'GET'])
  })
})
