import { ApiError } from './errors'
import { createHttpBookingsApi } from './bookingsApi'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const apiWith = (impl: () => Promise<Response>) =>
  createHttpBookingsApi({ baseUrl: '', fetchImpl: impl as unknown as typeof fetch })

const catchError = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e
  }
  throw new Error('expected rejection')
}

describe('http client', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('builds an absolute URL with the date query and parses the list', async () => {
    const fetchImpl = vi.fn<(url: URL) => Promise<Response>>(async () =>
      json(200, [{ id: '1', date: '2026-10-14', start: '10:00', end: '11:00' }]),
    )
    const api = createHttpBookingsApi({
      baseUrl: '',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const list = await api.list('2026-10-14')
    expect(list).toHaveLength(1)
    const url = fetchImpl.mock.calls[0]![0]
    expect(url.href).toBe(`${window.location.origin}/api/bookings?date=2026-10-14`)
  })

  it('parses a 409 into ApiError with conflicts', async () => {
    const conflict = { id: 'x', date: '2026-10-14', start: '10:00', end: '11:00', title: 'Занято' }
    const api = apiWith(async () =>
      json(409, { error: { code: 'CONFLICT', message: 'Занято', conflicts: [conflict] } }),
    )
    const e = await catchError(api.create({ date: '2026-10-14', start: '10:00', end: '11:00' }))
    expect(e).toBeInstanceOf(ApiError)
    expect(e).toMatchObject({ status: 409, code: 'CONFLICT', conflicts: [conflict] })
  })

  it('parses 422 field errors and reason', async () => {
    const api = apiWith(async () =>
      json(422, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'm',
          fieldErrors: { start: { code: 'NOT_ALIGNED', message: 'x' } },
        },
      }),
    )
    const e = await catchError(api.update('1', { start: '10:10' }))
    expect(e).toMatchObject({ status: 422, fieldErrors: { start: { code: 'NOT_ALIGNED' } } })
    const locked = apiWith(async () =>
      json(422, { error: { code: 'VALIDATION_ERROR', message: 'm', reason: 'BOOKING_LOCKED' } }),
    )
    expect(await catchError(locked.remove('1'))).toMatchObject({ reason: 'BOOKING_LOCKED' })
  })

  it('maps a fetch TypeError to NETWORK', async () => {
    const api = apiWith(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await catchError(api.list('2026-10-14'))).toMatchObject({ status: 0, code: 'NETWORK' })
  })

  it('maps HTML instead of JSON to INTERNAL and logs', async () => {
    const html = () =>
      Promise.resolve(
        new Response('<html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
      )
    expect(await catchError(apiWith(html).list('2026-10-14'))).toMatchObject({ code: 'INTERNAL' })
    const html404 = () => Promise.resolve(new Response('<html></html>', { status: 404 }))
    expect(await catchError(apiWith(html404).list('2026-10-14'))).toMatchObject({
      status: 404,
      code: 'INTERNAL',
    })
    expect(console.error).toHaveBeenCalled()
  })

  it('resolves remove on 204', async () => {
    const api = apiWith(async () => new Response(null, { status: 204 }))
    await expect(api.remove('1')).resolves.toBeUndefined()
  })

  it('rethrows aborts untouched', async () => {
    const abort = new DOMException('aborted', 'AbortError')
    const api = apiWith(async () => {
      throw abort
    })
    expect(await catchError(api.list('2026-10-14'))).toBe(abort)
  })
})
