import type { Booking } from '@/domain/booking'
import { firstInvalidField, hasErrors, toBookingInput, validateForm } from './formSchema'

const NOW = new Date(2026, 9, 13, 12, 0)
const base = { date: '2026-10-14', start: '10:00', end: '11:00', title: '' }
const existing: Booking[] = [
  { id: 'a', date: '2026-10-14', start: '10:30', end: '11:30', title: 'Занято' },
]

describe('toBookingInput', () => {
  it('trims the title and drops it when empty', () => {
    expect(toBookingInput({ ...base, title: '  abc ' }).title).toBe('abc')
    expect(toBookingInput({ ...base, title: '   ' })).not.toHaveProperty('title')
  })
})

describe('validateForm', () => {
  it('is empty for a valid form', () => {
    expect(hasErrors(validateForm(base, { now: NOW, existing: [] }))).toBe(false)
  })
  it('stops at format errors', () => {
    expect(
      validateForm({ ...base, date: '', start: '9:00' }, { now: NOW, existing: [] }),
    ).toMatchObject({
      date: expect.any(String),
      start: expect.any(String),
    })
  })
  it('flags a too long title (after trim) only above 100', () => {
    expect(
      validateForm({ ...base, title: 'x'.repeat(101) }, { now: NOW, existing: [] }).title,
    ).toBeDefined()
    expect(
      validateForm({ ...base, title: ` ${'x'.repeat(100)} ` }, { now: NOW, existing: [] }).title,
    ).toBeUndefined()
  })
  it('reports an overlap as an interval error with conflicts', () => {
    const errors = validateForm(base, { now: NOW, existing })
    expect(errors.interval?.conflicts).toEqual(existing)
    expect(firstInvalidField(errors)).toBe('start')
  })
  it('skips business rules while the bookings are not loaded', () => {
    expect(hasErrors(validateForm(base, { now: NOW, existing: null }))).toBe(false)
    expect(hasErrors(validateForm({ ...base, start: '08:00' }, { now: NOW, existing: null }))).toBe(
      false,
    )
  })
  it('ignores the edited booking', () => {
    expect(validateForm(base, { now: NOW, existing, excludeId: 'a' }).interval).toBeUndefined()
  })
  it('picks the first invalid field in DOM order', () => {
    expect(firstInvalidField({ end: 'x', title: 'y' })).toBe('end')
    expect(firstInvalidField({})).toBeNull()
  })
})
