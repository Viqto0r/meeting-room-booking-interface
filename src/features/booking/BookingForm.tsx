import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Controller } from 'react-hook-form'
import { useBookings } from '@/api/queries'
import type { Booking } from '@/domain/booking'
import { TITLE_MAX_LENGTH } from '@/domain/constants'
import { formatConflicts } from '@/domain/messages'
import {
  canStartAt,
  getDefaultEnd,
  getStartOptions,
  type EndOption,
  type StartOption,
} from '@/domain/rules'
import { formatLocalDate, formatDuration, toMinutes } from '@/domain/time'
import { useClock } from '@/shared/ClockContext'
import { Alert } from '@/shared/ui/Alert'
import { Button } from '@/shared/ui/Button'
import { useNow } from '@/shared/useNow'
import type { FormValues } from './formSchema'
import { messages } from './messages'
import { useBookingForm, type FormCallbacks } from './useBookingForm'

const f = messages.form
const inputClass =
  'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base shadow-sm transition-colors hover:border-slate-400 aria-[invalid=true]:border-red-700 aria-[invalid=true]:bg-red-50'

export type BookingFormProps = FormCallbacks & {
  mode: 'create' | 'edit'
  pageDate: string
  onCancel: () => void
  /** Edit mode: opens the delete dialog. */
  onDelete?: () => void
  booking?: Booking
  /** Create mode: preselected start (click on a timeline cell). */
  start?: string
  /** Create mode: complete starting values (after a 404 on edit). */
  values?: FormValues
}

const bookingToValues = (b: Booking): FormValues => ({
  date: b.date,
  start: b.start,
  end: b.end,
  title: b.title ?? '',
})

/** Panel heading (takes focus when the panel opens) + form body. */
export function BookingForm(props: BookingFormProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const headingId = useId()
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
        {props.mode === 'create' ? f.createTitle : f.editTitle}
      </h2>
      {props.mode === 'edit' && props.booking ? (
        <FormBody {...props} initial={bookingToValues(props.booking)} />
      ) : props.values ? (
        <FormBody {...props} initial={props.values} />
      ) : (
        <CreateLoader {...props} />
      )}
    </section>
  )
}

/** Create mode needs the day's bookings to choose the first available start. */
function CreateLoader(props: BookingFormProps) {
  // pinned to the date the form was opened on: the date field later moves the page date,
  // and that must not tear the form down
  const [openedOn] = useState(props.pageDate)
  const query = useBookings(openedOn)
  if (query.data !== undefined && !query.isPlaceholderData) {
    return <CreateInit {...props} openedOn={openedOn} existing={query.data} />
  }
  if (query.isError) {
    return (
      <Alert tone="error" assertive>
        <p>{f.loadTimesFailed}</p>
        <Button onClick={() => void query.refetch()}>{messages.retry}</Button>
      </Alert>
    )
  }
  return <output className="block">{f.loadingTimes}</output>
}

function CreateInit(props: BookingFormProps & { existing: Booking[]; openedOn: string }) {
  const clock = useClock()
  // Initial values are computed once, when the form opens, and are not "changes" (isDirty = false).
  const [initial] = useState(() => computeInitial(props, props.existing, clock.now()))
  if (!initial) {
    return (
      <div className="space-y-3">
        <Alert tone="warning">
          <p>{f.noFreeTime}</p>
        </Alert>
        <Button onClick={props.onCancel}>{f.close}</Button>
      </div>
    )
  }
  return <FormBody {...props} initial={initial} />
}

function computeInitial(
  props: BookingFormProps & { openedOn: string },
  existing: Booking[],
  now: Date,
): FormValues | null {
  const date = props.openedOn
  const requested = props.start
  const start =
    requested && canStartAt(date, toMinutes(requested), existing, now) === 'ok'
      ? requested
      : getStartOptions(date, existing, now).find((o) => o.availability === 'ok')?.time
  if (!start) return null
  return { date, start, end: getDefaultEnd(date, start, existing), title: '' }
}

function FormBody(props: BookingFormProps & { initial: FormValues }) {
  const { mode, booking, initial, onCancel, onDelete } = props
  const now = useNow()
  const ids = {
    interval: useId(),
    free: useId(),
    adjusted: useId(),
    date: useId(),
    start: useId(),
    end: useId(),
    title: useId(),
    titleCount: useId(),
    move: useId(),
  }
  const h = useBookingForm({
    mode,
    booking,
    initial,
    pageDate: props.pageDate,
    onDirtyChange: props.onDirtyChange,
    onSaved: props.onSaved,
    onHighlight: props.onHighlight,
    onLocked: props.onLocked,
    onRecreate: props.onRecreate,
    onPageDateChange: props.onPageDateChange,
  })
  const { values, errors, failure } = h
  const today = formatLocalDate(now)
  const movedTo = mode === 'edit' && booking && values.date !== booking.date ? values.date : null

  const describe = (...parts: Array<string | false | null | undefined>) =>
    parts.filter(Boolean).join(' ') || undefined
  const intervalProblem = Boolean(errors.interval)

  const freeText = h.freeIntervals.length
    ? f.free(h.freeIntervals.map((i) => `${i.start}–${i.end}`).join(', '))
    : f.nothingFree

  const showOnTimeline = (id?: string) => {
    if (!id) return
    document.querySelector(`[data-booking-id="${id}"]`)?.scrollIntoView({ block: 'center' })
  }

  return (
    <form onSubmit={(e) => void h.submit(e)} noValidate aria-busy={h.submitting}>
      <div className="space-y-4">
        {failure?.kind === 'conflict' && (
          <Alert tone="warning" assertive>
            <p>
              {messages.errors.conflictLead} {formatConflicts(failure.conflicts)}.{' '}
              {failure.phase === 'refreshing' && messages.errors.conflictRefreshing}
              {failure.phase === 'done' && messages.errors.conflictDone}
              {failure.phase === 'failed' && messages.errors.conflictFailed}
            </p>
            <div className="flex flex-wrap gap-2">
              {failure.phase === 'failed' && (
                <Button onClick={() => void h.retryRefresh()}>{messages.retry}</Button>
              )}
              <button
                type="button"
                className="min-h-11 text-sm font-medium text-indigo-800 underline lg:hidden"
                onClick={() => showOnTimeline(failure.conflicts[0]?.id)}
              >
                {messages.errors.showOnTimeline}
              </button>
            </div>
          </Alert>
        )}
        {failure?.kind === 'notFound' && (
          <Alert tone="error" assertive>
            <p>{messages.errors.notFound}</p>
            <Button onClick={h.recreate}>{messages.errors.recreate}</Button>
          </Alert>
        )}
        {failure?.kind === 'server' && (
          <Alert tone="error" assertive>
            <p>{messages.errors.server}</p>
          </Alert>
        )}
        {failure?.kind === 'badRequest' && (
          <Alert tone="error" assertive>
            <p>{messages.errors.badRequest}</p>
          </Alert>
        )}
        {h.loadFailed && (
          <Alert tone="error" assertive>
            <p>{f.loadTimesFailed}</p>
            <Button onClick={h.retryLoad}>{messages.retry}</Button>
          </Alert>
        )}
        {!h.ready && !h.loadFailed && <output className="block">{f.loadingTimes}</output>}

        <fieldset disabled={h.submitting} className="mx-0 min-w-0 space-y-4 border-0 p-0">
          {/* Date */}
          <div className="space-y-1">
            <label htmlFor={ids.date} className="block text-sm font-medium">
              {f.date}
            </label>
            <Controller
              control={h.form.control}
              name="date"
              render={({ field }) => (
                <input
                  id={ids.date}
                  ref={h.fieldRefs.date}
                  type="date"
                  min={today}
                  value={field.value}
                  onChange={(e) => h.onDateChange(e.target.value)}
                  onBlur={field.onBlur}
                  aria-invalid={errors.date ? true : undefined}
                  aria-describedby={describe(
                    errors.date && `${ids.date}-error`,
                    movedTo && ids.move,
                  )}
                  className={inputClass}
                />
              )}
            />
            {movedTo && (
              <p id={ids.move} className="text-sm text-slate-700">
                {f.moveTo(movedTo)}
              </p>
            )}
            <FieldError id={`${ids.date}-error`}>{errors.date}</FieldError>
          </div>

          {/* Time */}
          <fieldset className="mx-0 min-w-0 space-y-3 border-0 p-0">
            <legend className="mb-1 text-sm font-medium">{f.time}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor={ids.start} className="block text-sm font-medium">
                  {f.start}
                </label>
                <Controller
                  control={h.form.control}
                  name="start"
                  render={({ field }) => (
                    <select
                      id={ids.start}
                      ref={h.fieldRefs.start}
                      value={field.value}
                      onChange={(e) => h.onStartChange(e.target.value)}
                      onBlur={field.onBlur}
                      disabled={!h.ready}
                      aria-invalid={errors.start || intervalProblem ? true : undefined}
                      aria-describedby={describe(
                        errors.start && `${ids.start}-error`,
                        intervalProblem && ids.interval,
                        h.ready && ids.free,
                      )}
                      className={inputClass}
                    >
                      <StartOptions
                        options={h.startOptions}
                        current={field.value}
                        ready={h.ready}
                        showPast={mode === 'edit' || values.date === today}
                      />
                    </select>
                  )}
                />
                <FieldError id={`${ids.start}-error`}>{errors.start}</FieldError>
              </div>
              <div className="space-y-1">
                <label htmlFor={ids.end} className="block text-sm font-medium">
                  {f.end}
                </label>
                <Controller
                  control={h.form.control}
                  name="end"
                  render={({ field }) => (
                    <select
                      id={ids.end}
                      ref={h.fieldRefs.end}
                      value={field.value}
                      onChange={(e) => h.onEndChange(e.target.value)}
                      onBlur={field.onBlur}
                      disabled={!h.ready}
                      aria-invalid={errors.end || intervalProblem ? true : undefined}
                      aria-describedby={describe(
                        errors.end && `${ids.end}-error`,
                        intervalProblem && ids.interval,
                        h.adjustedEnd && ids.adjusted,
                        h.ready && ids.free,
                      )}
                      className={inputClass}
                    >
                      <EndOptions options={h.endOptions} current={field.value} ready={h.ready} />
                    </select>
                  )}
                />
                <FieldError id={`${ids.end}-error`}>{errors.end}</FieldError>
                <p id={ids.adjusted} aria-live="polite" className="text-sm text-slate-700">
                  {h.adjustedEnd ? f.endAdjusted(h.adjustedEnd) : null}
                </p>
              </div>
            </div>
            {h.ready && (
              <p id={ids.free} className="text-sm text-slate-700">
                {freeText}
              </p>
            )}
            <FieldError id={ids.interval}>{errors.interval?.message}</FieldError>
          </fieldset>

          {/* Title */}
          <div className="space-y-1">
            <label htmlFor={ids.title} className="block text-sm font-medium">
              {f.title} <span className="font-normal text-slate-700">{f.titleHint}</span>
            </label>
            <Controller
              control={h.form.control}
              name="title"
              render={({ field }) => (
                <input
                  id={ids.title}
                  ref={h.fieldRefs.title}
                  type="text"
                  maxLength={TITLE_MAX_LENGTH}
                  value={field.value}
                  onChange={(e) => h.onTitleChange(e.target.value)}
                  onBlur={field.onBlur}
                  aria-invalid={errors.title ? true : undefined}
                  aria-describedby={describe(errors.title && `${ids.title}-error`, ids.titleCount)}
                  className={inputClass}
                />
              )}
            />
            <p id={ids.titleCount} className="text-right text-xs tabular-nums text-slate-700">
              {values.title.length}/{TITLE_MAX_LENGTH}
            </p>
            <FieldError id={`${ids.title}-error`}>{errors.title}</FieldError>
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            variant="primary"
            disabled={h.busy}
            aria-disabled={!h.ready || undefined}
            loading={h.submitting}
          >
            {h.submitting ? f.saving : mode === 'create' ? f.create : f.save}
          </Button>
          <Button onClick={onCancel} disabled={h.submitting}>
            {f.cancel}
          </Button>
          {mode === 'edit' && onDelete && (
            <Button
              id="delete-booking-button"
              variant="danger"
              className="ml-auto"
              onClick={onDelete}
              disabled={h.submitting}
            >
              {f.delete}
            </Button>
          )}
        </div>
      </div>
    </form>
  )
}

function FieldError({ id, children }: { id: string; children?: ReactNode }) {
  if (!children) return null
  return (
    <p id={id} className="text-sm font-medium text-red-800">
      {children}
    </p>
  )
}

function StartOptions({
  options,
  current,
  ready,
  showPast,
}: {
  options: StartOption[]
  current: string
  ready: boolean
  showPast: boolean
}) {
  if (!ready) return <option value={current}>{current}</option>
  const known = options.some((o) => o.time === current)
  const groups = new Map<string, StartOption[]>()
  for (const o of options) {
    const hour = `${o.time.slice(0, 2)}:00`
    groups.set(hour, [...(groups.get(hour) ?? []), o])
  }
  return (
    <>
      {!known && showPast && (
        <option value={current} disabled>
          {current} — {f.optionPast}
        </option>
      )}
      {[...groups].map(([hour, list]) => (
        <optgroup key={hour} label={hour}>
          {list.map((o) => (
            <option key={o.time} value={o.time} disabled={o.availability !== 'ok'}>
              {o.availability === 'ok'
                ? o.time
                : `${o.time} — ${o.availability === 'busy' ? f.optionBusy : f.optionShort}`}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  )
}

function EndOptions({
  options,
  current,
  ready,
}: {
  options: EndOption[]
  current: string
  ready: boolean
}) {
  if (!ready) return <option value={current}>{current}</option>
  const known = options.some((o) => o.time === current)
  return (
    <>
      {!known && <option value={current}>{current}</option>}
      {options.map((o) => (
        <option key={o.time} value={o.time} disabled={!o.free}>
          {o.time} ({formatDuration(o.durationMin)}){o.free ? '' : ` — ${f.optionBusy}`}
        </option>
      ))}
    </>
  )
}
