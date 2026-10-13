import { useEffect, useId, useRef } from 'react'
import type { Booking } from '@/domain/booking'
import { formatBookingLabel, UNTITLED } from '@/domain/messages'
import { formatDuration, toMinutes } from '@/domain/time'
import { Alert } from '@/shared/ui/Alert'
import { Button } from '@/shared/ui/Button'
import { useNow } from '@/shared/useNow'
import { getBookingStatus } from './bookingStatus'
import type { FormValues } from './formSchema'
import { formatDayMonth, formatFullDate, messages } from './messages'

type Props = {
  booking: Booking
  /** Set when the panel switched from edit because the booking has started. */
  locked?: { unsaved?: FormValues }
  onClose: () => void
}

const d = messages.details

/** Read-only view of a booking that is past or in progress (SPEC §7.5.7). */
export function BookingDetails({ booking, locked, onClose }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const headingId = useId()
  const now = useNow()
  const status = getBookingStatus(booking, now)

  useEffect(() => {
    const el = headingRef.current
    el?.focus()
    if (
      typeof window.matchMedia === 'function' &&
      !window.matchMedia('(min-width: 1024px)').matches
    ) {
      el?.scrollIntoView?.({ block: 'start' })
    }
  }, [])

  const unsaved = locked?.unsaved
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-md"
    >
      <h2
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="mb-4 text-xl font-semibold tracking-tight"
      >
        {d.title}
      </h2>
      {locked && (
        <Alert tone="warning" assertive className="mb-4">
          <p>
            {messages.errors.locked}
            {unsaved && (
              <>
                {' '}
                {messages.errors.unsaved}{' '}
                {unsaved.date !== booking.date && `${formatDayMonth(unsaved.date)}, `}
                {formatBookingLabel({
                  start: unsaved.start,
                  end: unsaved.end,
                  title: unsaved.title.trim() || undefined,
                })}
              </>
            )}
          </p>
        </Alert>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="font-medium text-slate-700">{d.date}</dt>
        <dd>{formatFullDate(booking.date)}</dd>
        <dt className="font-medium text-slate-700">{d.time}</dt>
        <dd>
          {booking.start}–{booking.end}
        </dd>
        <dt className="font-medium text-slate-700">{d.duration}</dt>
        <dd>{formatDuration(toMinutes(booking.end) - toMinutes(booking.start))}</dd>
        <dt className="font-medium text-slate-700">{d.name}</dt>
        <dd className="break-words">{booking.title ?? UNTITLED}</dd>
        {status && (
          <>
            <dt className="font-medium text-slate-700">{d.status}</dt>
            <dd>{status === 'past' ? d.past : d.ongoing}</dd>
          </>
        )}
      </dl>
      <div className="mt-4">
        <Button onClick={onClose}>{messages.form.close}</Button>
      </div>
    </section>
  )
}
