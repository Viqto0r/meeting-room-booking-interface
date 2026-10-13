import { Lock } from 'lucide-react'
import type { Booking } from '@/domain/booking'
import { UNTITLED } from '@/domain/messages'
import { toMinutes } from '@/domain/time'
import { getBookingStatus, STATUS_TEXT } from './bookingStatus'
import { blockRect, COMPACT_BELOW_MIN, PX_PER_MIN } from './timelineGeometry'
import { PROBLEM_TEXT, useBookingDrag, type MoveProblem } from './useBookingDrag'

type Props = {
  booking: Booking
  now: Date
  highlighted: boolean
  selected: boolean
  onSelect: (booking: Booking) => void
  /** The booking is being saved after a drop. */
  moving?: boolean
  getProblem: (booking: Booking, deltaMin: number) => MoveProblem | null
  onMove: (booking: Booking, deltaMin: number) => void
  onReject: (problem: MoveProblem) => void
}

export function TimelineBooking({
  booking,
  now,
  highlighted,
  selected,
  onSelect,
  moving = false,
  getProblem,
  onMove,
  onReject,
}: Props) {
  const startMin = toMinutes(booking.start)
  const endMin = toMinutes(booking.end)
  const { top, height } = blockRect(startMin, endMin)
  const compact = endMin - startMin < COMPACT_BELOW_MIN
  const status = getBookingStatus(booking, now)
  const locked = status !== null
  const title = booking.title || UNTITLED
  const statusText = status ? STATUS_TEXT[status] : null
  const range = `${booking.start}–${booking.end}`

  const drag = useBookingDrag({
    booking,
    enabled: !locked && !moving,
    getProblem,
    onMove,
    onReject,
  })

  const label = [
    `${range}, ${title}`,
    statusText ? `, ${statusText}` : '',
    highlighted ? ', только что занято' : '',
    locked ? '. Посмотреть' : '. Изменить',
  ].join('')

  const tone = locked
    ? 'border-slate-300 border-l-slate-500 bg-slate-200/70 text-slate-800'
    : 'border-indigo-200 border-l-indigo-600 bg-indigo-50 text-indigo-950 shadow-sm hover:bg-indigo-100 hover:shadow'
  const ring = highlighted
    ? 'outline outline-[3px] outline-offset-0 outline-amber-600'
    : selected
      ? 'ring-2 ring-indigo-600 ring-offset-1'
      : ''

  return (
    <li
      className={`pointer-events-none absolute inset-x-0 ${drag.moved ? 'z-20' : ''}`}
      style={{ top, height }}
    >
      {drag.moved && !drag.moved.settling && (
        <div
          aria-hidden="true"
          className={`absolute inset-0 rounded-lg border-2 border-dashed ${drag.moved.problem === null ? 'border-indigo-500 bg-indigo-500/10' : 'border-red-600 bg-red-600/10'}`}
          style={{ transform: `translateY(${drag.moved.delta * PX_PER_MIN}px)` }}
        >
          <span
            className={`absolute -top-7 right-2 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums text-[#fff] shadow ${drag.moved.problem === null ? 'bg-indigo-600' : 'bg-red-600'}`}
          >
            {drag.moved.problem === null
              ? drag.moved.range
              : `${drag.moved.range} — ${PROBLEM_TEXT[drag.moved.problem]}`}
          </span>
        </div>
      )}
      <button
        type="button"
        data-testid="booking-block"
        data-booking-id={booking.id}
        aria-label={label}
        aria-current={selected ? 'true' : undefined}
        title={`${range} ${title}${statusText ? ` — ${statusText}` : ''}`}
        style={{
          transform: drag.moved ? `translateY(${drag.moved.offsetPx}px)` : undefined,
          transition: drag.moved?.settling ? 'transform 120ms ease-out' : 'none',
        }}
        onPointerDown={drag.onPointerDown}
        onClick={() => {
          if (drag.suppressClick.current) return
          onSelect(booking)
        }}
        className={`pointer-events-auto flex h-full w-full ${locked ? '' : 'cursor-grab select-none'} ${drag.moved && !drag.moved.settling ? 'cursor-grabbing shadow-xl' : ''} overflow-hidden rounded-lg border border-l-4 text-left text-sm transition-shadow ${tone} ${ring} ${
          compact ? 'items-center gap-2 px-2' : 'flex-col justify-start gap-0.5 px-2 py-1'
        }`}
      >
        {compact ? (
          <>
            <span className="shrink-0 font-semibold tabular-nums">{range}</span>
            {locked && <Lock aria-hidden="true" size={14} className="shrink-0" />}
            {statusText && <span className="shrink-0 text-xs">{statusText}</span>}
            {highlighted && (
              <span className="shrink-0 rounded bg-amber-200 px-1 text-xs font-medium text-amber-950">
                Только что занято
              </span>
            )}
            <span className="min-w-0 truncate">{title}</span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-2">
              <span className="font-semibold tabular-nums">{range}</span>
              {locked && <Lock aria-hidden="true" size={14} />}
              {statusText && <span className="text-xs">{statusText}</span>}
              {highlighted && (
                <span className="rounded bg-amber-200 px-1 text-xs font-medium text-amber-950">
                  Только что занято
                </span>
              )}
            </span>
            <span className="min-w-0 truncate">{title}</span>
          </>
        )}
      </button>
    </li>
  )
}
