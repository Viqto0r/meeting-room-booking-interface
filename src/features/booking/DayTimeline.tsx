import type { Booking } from '@/domain/booking'
import { canStartAt } from '@/domain/rules'
import { formatLocalDate, fromMinutes } from '@/domain/time'
import { formatFullDate, messages } from './messages'
import type { MoveProblem } from './useBookingDrag'
import { TimelineBooking } from './TimelineBooking'
import {
  DAY_END_MIN,
  DAY_START_MIN,
  minToPx,
  PX_PER_MIN,
  TIMELINE_HEIGHT,
} from './timelineGeometry'

type Props = {
  date: string
  bookings: Booking[]
  now: Date
  /** Data is a placeholder of another date: dimmed, clicks disabled. */
  placeholder: boolean
  highlightedIds: ReadonlySet<string>
  selectedId?: string
  onSelectBooking: (booking: Booking) => void
  movingIds: ReadonlySet<string>
  getProblem: (booking: Booking, deltaMin: number) => MoveProblem | null
  onMoveBooking: (booking: Booking, deltaMin: number) => void
  onRejectMove: (problem: MoveProblem) => void
  onSelectCell: (startMin: number) => void
}

const SLOT_MIN = 15
const CELLS = Array.from(
  { length: (DAY_END_MIN - DAY_START_MIN) / SLOT_MIN },
  (_, i) => DAY_START_MIN + i * SLOT_MIN,
)
const HOURS = Array.from({ length: (DAY_END_MIN - DAY_START_MIN) / 60 + 1 }, (_, i) => 9 + i)

const HATCH =
  'repeating-linear-gradient(135deg, rgba(100,116,139,0.18) 0 6px, rgba(100,116,139,0.05) 6px 12px)'

export function DayTimeline({
  date,
  bookings,
  now,
  placeholder,
  highlightedIds,
  selectedId,
  onSelectBooking,
  movingIds,
  getProblem,
  onMoveBooking,
  onRejectMove,
  onSelectCell,
}: Props) {
  const today = formatLocalDate(now)
  const isToday = date === today
  const isPast = date < today
  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
  const pastHeightPx = isPast
    ? TIMELINE_HEIGHT
    : isToday
      ? Math.min(Math.max(minToPx(nowMin), 0), TIMELINE_HEIGHT)
      : 0
  const showNowLine = isToday && nowMin >= DAY_START_MIN && nowMin <= DAY_END_MIN

  return (
    <div
      className={`relative my-3 ml-14 rounded-xl border border-slate-200 bg-white shadow-sm ${placeholder ? 'opacity-50' : ''}`}
      style={{ height: TIMELINE_HEIGHT }}
      data-testid="timeline-grid"
    >
      {/* Scale: hour labels and 15-minute lines */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {CELLS.map((min) => (
          <div
            key={min}
            className={`absolute inset-x-0 border-t ${min % 60 === 0 ? 'border-slate-300' : 'border-slate-100'}`}
            style={{ top: minToPx(min) }}
          />
        ))}
        {HOURS.filter((h) => !showNowLine || Math.abs(nowMin - h * 60) >= 12).map((h) => (
          <span
            key={h}
            className="absolute -left-14 w-12 -translate-y-1/2 text-right text-xs tabular-nums text-slate-600"
            style={{ top: minToPx(h * 60) }}
          >
            {String(h).padStart(2, '0')}:00
          </span>
        ))}
      </div>

      {/* Click layer: mouse and touch only, the keyboard path is the "Новая бронь" button */}
      <div aria-hidden="true" className="absolute inset-0">
        {CELLS.map((min) => {
          const availability = placeholder ? 'loading' : canStartAt(date, min, bookings, now)
          const ok = availability === 'ok'
          const reason =
            availability === 'loading'
              ? 'Загрузка…'
              : availability === 'ok'
                ? undefined
                : messages.cellReason[availability]
          return (
            // Mouse/touch-only shortcut inside an aria-hidden layer; the keyboard path is the "Новая бронь" button.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
            <div
              key={min}
              data-testid="timeline-cell"
              data-start={fromMinutes(min)}
              title={reason}
              onClick={ok ? () => onSelectCell(min) : undefined}
              className={`absolute inset-x-0 ${ok ? 'cursor-pointer hover:bg-indigo-50' : 'cursor-not-allowed'}`}
              style={{ top: minToPx(min), height: SLOT_MIN * PX_PER_MIN }}
            />
          )
        })}
      </div>

      {/* Past time */}
      {pastHeightPx > 0 && (
        <div
          aria-hidden="true"
          data-testid="past-hatch"
          className="pointer-events-none absolute inset-x-0 top-0 rounded-t-md"
          style={{ height: pastHeightPx, backgroundImage: HATCH }}
        />
      )}

      {/* Under the blocks so that it never strikes through their text; locked blocks are translucent */}
      {showNowLine && (
        <div
          data-testid="now-line"
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 border-t-2 border-red-600"
          style={{ top: minToPx(nowMin) }}
        >
          <span className="absolute -left-14 -top-2.5 w-12 rounded bg-red-600 py-px text-center text-xs font-medium tabular-nums text-[#fff]">
            {fromMinutes(Math.floor(nowMin))}
          </span>
        </div>
      )}

      <ol
        aria-label={
          placeholder
            ? 'Брони предыдущей даты, загружается новая'
            : `Брони на ${formatFullDate(date)}`
        }
        aria-busy={placeholder || undefined}
        className="pointer-events-none absolute inset-0 list-none"
      >
        {bookings.map((b) => (
          <TimelineBooking
            key={b.id}
            booking={b}
            now={now}
            highlighted={highlightedIds.has(b.id)}
            selected={b.id === selectedId}
            onSelect={onSelectBooking}
            moving={movingIds.has(b.id)}
            getProblem={getProblem}
            onMove={onMoveBooking}
            onReject={onRejectMove}
          />
        ))}
      </ol>
    </div>
  )
}
