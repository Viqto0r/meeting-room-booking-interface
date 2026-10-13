import { createClock } from './clock'

describe('createClock', () => {
  it('uses the override when set', () => {
    const clock = createClock(() => '2026-10-13T10:07:00.000')
    const now = clock.now()
    expect([now.getFullYear(), now.getMonth(), now.getDate()]).toEqual([2026, 9, 13])
    expect([now.getHours(), now.getMinutes(), now.getSeconds()]).toEqual([10, 7, 0])
  })

  it('keeps milliseconds', () => {
    expect(
      createClock(() => '2026-10-13T11:59:59.999')
        .now()
        .getMilliseconds(),
    ).toBe(999)
  })

  it('falls back to the system date', () => {
    const before = Date.now()
    const t = createClock(() => null)
      .now()
      .getTime()
    expect(t).toBeGreaterThanOrEqual(before)
    expect(t).toBeLessThanOrEqual(Date.now())
  })

  it('falls back on an unparsable override', () => {
    const t = createClock(() => 'garbage')
      .now()
      .getTime()
    expect(Math.abs(t - Date.now())).toBeLessThan(1000)
  })
})
