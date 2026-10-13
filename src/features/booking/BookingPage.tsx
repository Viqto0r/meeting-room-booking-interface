import { CalendarDays, Moon } from 'lucide-react'
import { useTheme } from '@/shared/theme'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ApiError } from '@/api/errors'
import { useQueryClient } from '@tanstack/react-query'
import { bookingKeys, useBookings, useUpdateBooking } from '@/api/queries'
import type { Booking } from '@/domain/booking'
import { fromMinutes, toMinutes } from '@/domain/time'
import { PROBLEM_TEXT, type MoveProblem } from './useBookingDrag'
import type { SaveResult } from './useBookingForm'
import type { FormValues } from './formSchema'
import { getDayAvailability, isBookingLocked, validateBookingInput } from '@/domain/rules'
import { DevPanel } from '@/dev/DevPanel'
import { MOCKS_ENABLED } from '@/shared/env'
import { Alert } from '@/shared/ui/Alert'
import { Button } from '@/shared/ui/Button'
import { Spinner } from '@/shared/ui/Spinner'
import { useNow } from '@/shared/useNow'
import { useSelectedDate } from '@/shared/useSelectedDate'
import { BookingPanel, type PanelState } from './BookingPanel'
import { ConfirmDiscardDialog } from './ConfirmDiscardDialog'
import { DateNavigator } from './DateNavigator'
import { DayTimeline } from './DayTimeline'
import { messages } from './messages'
import { NewBookingButton } from './NewBookingButton'
import { EmptyState } from './states/EmptyState'
import { ErrorState } from './states/ErrorState'
import { TimelineSkeleton } from './states/TimelineSkeleton'

const NO_HIGHLIGHT: ReadonlySet<string> = new Set()

export function BookingPage() {
  const [date, setDate] = useSelectedDate()
  const { theme, toggle: toggleTheme } = useTheme()
  const now = useNow()
  const timeline = useBookings(date, { keepPrevious: true })
  const bookings = timeline.data ?? []
  const stale = timeline.isPending || timeline.isPlaceholderData

  const [panel, setPanel] = useState<PanelState>({ mode: 'closed' })
  const [dirty, setDirty] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const [highlight, setHighlight] = useState<{ date: string; ids: string[] } | null>(null)

  const panelKey = useRef(0)
  const newButtonRef = useRef<HTMLButtonElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const queryClient = useQueryClient()
  const update = useUpdateBooking()
  const [movingIds, setMovingIds] = useState<ReadonlySet<string>>(new Set())

  const shifted = (b: Booking, deltaMin: number) => ({
    date: b.date,
    start: fromMinutes(toMinutes(b.start) + deltaMin),
    end: fromMinutes(toMinutes(b.end) + deltaMin),
    ...(b.title ? { title: b.title } : {}),
  })
  const getProblem = (b: Booking, deltaMin: number): MoveProblem | null => {
    if (stale) return 'invalid'
    const violations = validateBookingInput(shifted(b, deltaMin), {
      now,
      existing: bookings,
      excludeId: b.id,
    })
    if (violations.length === 0) return null
    if (violations.some((v) => v.code === 'PAST_TIME' || v.code === 'PAST_DATE')) return 'past'
    return violations.some((v) => v.code === 'OVERLAP') ? 'busy' : 'invalid'
  }
  const rejectMove = (problem: MoveProblem) =>
    toast.error(`Нельзя переместить: ${PROBLEM_TEXT[problem]}`, { id: 'move-error' })

  const availability = stale ? 'loading' : getDayAvailability(date, bookings, now)

  /** Runs `action` at once, or after the user confirms discarding the edited form. */
  const guarded = (action: () => void) => (dirty ? setPendingAction(() => action) : action())

  const close = useCallback(() => {
    setPanel({ mode: 'closed' })
    setDirty(false)
    setHighlight(null)
  }, [])

  const openCreate = (startMin?: number) =>
    guarded(() => {
      setDirty(false)
      setHighlight(null)
      setPanel({
        mode: 'create',
        key: ++panelKey.current,
        start: startMin === undefined ? undefined : fromMinutes(startMin),
      })
    })

  const openBooking = (booking: Booking) =>
    guarded(() => {
      setDirty(false)
      setHighlight(null)
      setPanel({
        mode: isBookingLocked(booking, now) ? 'view' : 'edit',
        key: ++panelKey.current,
        booking,
      })
    })

  const changeDate = (next: string) =>
    guarded(() => {
      close()
      setDate(next)
    })

  /**
   * Focus chain after a panel closes (SPEC §7.5.5): the booking block → "Новая бронь" → heading.
   * The block may appear a moment after the refetch, so it is awaited briefly.
   */
  const requestFocus = useCallback((bookingId?: string, options?: FocusOptions) => {
    let attempts = 0
    const attempt = () => {
      const block = bookingId
        ? document.querySelector<HTMLElement>(`[data-booking-id="${bookingId}"]`)
        : null
      if (block) return block.focus(options)
      if (bookingId && attempts++ < 20) return void setTimeout(attempt, 50)
      const button = newButtonRef.current
      if (button && button.getAttribute('aria-disabled') !== 'true') button.focus()
      else headingRef.current?.focus()
    }
    attempt()
  }, [])

  /** Drag and drop: the same PATCH as the form, but only the time changes. */
  const moveBooking = (b: Booking, deltaMin: number) => {
    const { start, end } = shifted(b, deltaMin)
    // mutateAsync: every drop reports its own result (mutate's callbacks only fire for the last call)
    const run = async () => {
      setMovingIds((ids) => new Set(ids).add(b.id))
      // Optimistic UI: show the new time at once, roll back if the server refuses.
      const key = bookingKeys.byDate(b.date)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Booking[]>(key)
      queryClient.setQueryData<Booking[]>(key, (old) =>
        old
          ?.map((x) => (x.id === b.id ? { ...x, start, end } : x))
          .sort((p, q) => p.start.localeCompare(q.start)),
      )
      try {
        await update.mutateAsync({ id: b.id, patch: { start, end }, oldDate: b.date })
        toast.success(messages.toast.rescheduled(start, end))
        requestFocus(b.id, { preventScroll: true })
      } catch (e) {
        queryClient.setQueryData(key, previous)
        const status = e instanceof ApiError ? e.status : 0
        toast.error(
          status === 409
            ? messages.toast.moveBusy
            : status === 404
              ? messages.toast.moveGone
              : e instanceof ApiError && e.reason === 'BOOKING_LOCKED'
                ? messages.errors.locked
                : messages.toast.moveFailed,
          { id: 'move-error' },
        )
      } finally {
        setMovingIds((ids) => {
          const next = new Set(ids)
          next.delete(b.id)
          return next
        })
      }
    }
    // moving the booking that is open in a form invalidates that form
    if (panel.mode === 'edit' && panel.booking.id === b.id)
      guarded(() => {
        close()
        void run()
      })
    else return run()
  }

  const latestChangeDate = useRef(changeDate)
  useEffect(() => {
    latestChangeDate.current = changeDate
  })

  const onSaved = ({ kind, booking }: SaveResult) => {
    close()
    if (kind === 'created') toast.success(messages.toast.created(booking))
    else if (kind === 'updated') toast.success(messages.toast.saved)
    else {
      toast.success(messages.toast.moved(booking.date), {
        duration: Infinity,
        closeButton: true,
        action: {
          label: messages.toast.goTo,
          onClick: () => latestChangeDate.current(booking.date),
        },
      })
    }
    requestFocus(kind === 'moved' ? undefined : booking.id)
  }

  const onDeleted = ({ alreadyGone }: { alreadyGone: boolean }) => {
    close()
    toast.success(alreadyGone ? messages.toast.alreadyDeleted : messages.toast.deleted)
    requestFocus()
  }

  const onLocked = useCallback((values: FormValues) => {
    setPanel((prev) => {
      if (prev.mode !== 'edit') return prev
      const b = prev.booking
      const changed =
        values.date !== b.date ||
        values.start !== b.start ||
        values.end !== b.end ||
        values.title.trim() !== (b.title ?? '')
      return {
        mode: 'view',
        key: ++panelKey.current,
        booking: b,
        locked: { unsaved: changed ? values : undefined },
      }
    })
    setDirty(false)
    setHighlight(null)
  }, [])

  const onRecreate = (values: FormValues) => {
    setDirty(false)
    setHighlight(null)
    setDate(values.date)
    setPanel({ mode: 'create', key: ++panelKey.current, values })
  }

  // SPEC §7.5.6: closing or reloading the tab with an edited form asks for confirmation
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const selectedId = panel.mode === 'edit' || panel.mode === 'view' ? panel.booking.id : undefined
  const highlightedIds =
    highlight && highlight.date === date ? new Set(highlight.ids) : NO_HIGHLIGHT

  return (
    <div className="min-h-screen text-slate-900">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto max-w-6xl space-y-4 px-4 py-5">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-10 items-center justify-center rounded-xl bg-indigo-600 text-[#fff] shadow-sm"
            >
              <CalendarDays size={22} />
            </span>
            <h1 className="text-2xl font-bold tracking-tight">{messages.appTitle}</h1>
            <button
              type="button"
              onClick={toggleTheme}
              aria-pressed={theme === 'dark'}
              className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium shadow-sm hover:bg-slate-50"
            >
              <Moon aria-hidden="true" size={18} />
              <span className="max-sm:sr-only">Тёмная тема</span>
            </button>
          </div>
          <DateNavigator date={date} onChange={changeDate} />
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl gap-4 px-4 py-4 lg:grid-cols-[3fr_2fr]">
        {/* The panel is first in the DOM (above the timeline on mobile); on desktop it sits on the right. */}
        <div className="lg:sticky lg:top-4 lg:col-start-2 lg:row-start-1 lg:self-start">
          <BookingPanel
            state={panel}
            pageDate={date}
            onClose={() => {
              close()
              requestFocus()
            }}
            onDirtyChange={setDirty}
            onSaved={onSaved}
            onDeleted={onDeleted}
            onHighlight={setHighlight}
            onLocked={onLocked}
            onRecreate={onRecreate}
            onPageDateChange={setDate}
          />
        </div>
        <section aria-labelledby="timeline-title" className="min-w-0 lg:col-start-1 lg:row-start-1">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2
              id="timeline-title"
              ref={headingRef}
              tabIndex={-1}
              className="text-xl font-semibold tracking-tight"
            >
              {messages.timelineTitle}
            </h2>
            {timeline.isFetching && !timeline.isPending && (
              <output className="flex items-center gap-1 text-sm text-slate-700">
                <Spinner /> {messages.refreshing}
              </output>
            )}
          </div>
          <p className="mb-2 hidden text-sm text-slate-600 md:block">{messages.dragHint}</p>
          <NewBookingButton
            ref={newButtonRef}
            availability={availability}
            onClick={() => openCreate()}
          />

          {timeline.isPending ? (
            <div className="mt-3">
              <TimelineSkeleton />
            </div>
          ) : timeline.isError && !timeline.data ? (
            <div className="mt-3">
              <ErrorState onRetry={() => void timeline.refetch()} retrying={timeline.isFetching} />
            </div>
          ) : (
            <>
              {timeline.isError && (
                <Alert tone="warning" assertive className="mt-3">
                  <p>{messages.refreshError}</p>
                  <Button onClick={() => void timeline.refetch()}>{messages.retry}</Button>
                </Alert>
              )}
              {bookings.length === 0 && !stale && (
                <div className="mt-3">
                  <EmptyState
                    onBook={availability === 'available' ? () => openCreate() : undefined}
                  />
                </div>
              )}
              <DayTimeline
                date={date}
                bookings={bookings}
                now={now}
                placeholder={stale}
                highlightedIds={highlightedIds}
                selectedId={selectedId}
                onSelectBooking={openBooking}
                movingIds={movingIds}
                getProblem={getProblem}
                onRejectMove={rejectMove}
                onMoveBooking={moveBooking}
                onSelectCell={openCreate}
              />
            </>
          )}
        </section>
      </main>
      {MOCKS_ENABLED && <DevPanel />}
      <ConfirmDiscardDialog
        open={pendingAction !== null}
        onKeepEditing={() => setPendingAction(null)}
        onDiscard={() => {
          const action = pendingAction
          setPendingAction(null)
          setDirty(false)
          action?.()
        }}
      />
    </div>
  )
}
