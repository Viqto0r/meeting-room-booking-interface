import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { ApiError } from '@/api/errors'
import { bookingKeys, useBookings, useCreateBooking, useUpdateBooking } from '@/api/queries'
import type { Booking } from '@/domain/booking'
import {
  getDefaultEnd,
  getEndOptions,
  getFreeIntervals,
  getStartOptions,
  isBookingLocked,
} from '@/domain/rules'
import { isValidDateString } from '@/domain/time'
import { useClock } from '@/shared/ClockContext'
import { useNow } from '@/shared/useNow'
import {
  firstInvalidField,
  hasErrors,
  toBookingInput,
  validateForm,
  type FieldKey,
  type FormErrors,
  type FormValues,
} from './formSchema'

export type SaveResult = { kind: 'created' | 'updated' | 'moved'; booking: Booking }

export type FormCallbacks = {
  onDirtyChange: (dirty: boolean) => void
  onSaved: (result: SaveResult) => void
  onHighlight: (highlight: { date: string; ids: string[] } | null) => void
  /** The booking started while it was being edited (or the server says it is locked). */
  onLocked: (values: FormValues) => void
  /** 404 on edit: continue as a new booking with the same values. */
  onRecreate: (values: FormValues) => void
  /** Create mode: the date field drives the page date. */
  onPageDateChange: (date: string) => void
}

export type SubmitFailure =
  | { kind: 'conflict'; conflicts: Booking[]; phase: 'refreshing' | 'done' | 'failed' }
  | { kind: 'notFound' }
  | { kind: 'server' }
  | { kind: 'badRequest' }

type Params = FormCallbacks & {
  mode: 'create' | 'edit'
  booking?: Booking
  initial: FormValues
  pageDate: string
}

type ServerErrors = Partial<Record<FieldKey, string>>

export function useBookingForm({
  mode,
  booking,
  initial,
  pageDate,
  onDirtyChange,
  onSaved,
  onHighlight,
  onLocked,
  onRecreate,
  onPageDateChange,
}: Params) {
  const clock = useClock()
  const now = useNow()
  const queryClient = useQueryClient()
  const form = useForm<FormValues>({ defaultValues: initial })
  const values = useWatch({ control: form.control }) as FormValues
  const { isDirty } = form.formState

  const [serverErrors, setServerErrors] = useState<ServerErrors>({})
  const [failure, setFailure] = useState<SubmitFailure | null>(null)
  const [adjustedEnd, setAdjustedEnd] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const inFlight = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const pendingFocus = useRef<FieldKey | null>(null)
  const fieldRefs = {
    date: useRef<HTMLInputElement>(null),
    start: useRef<HTMLSelectElement>(null),
    end: useRef<HTMLSelectElement>(null),
    title: useRef<HTMLInputElement>(null),
  }

  const formDate = isValidDateString(values.date) ? values.date : (booking?.date ?? pageDate)
  const excludeId = booking?.id

  // The form never uses placeholder data: it validates only real bookings of its own date.
  const bookingsQuery = useBookings(formDate)
  const existing =
    bookingsQuery.data !== undefined && !bookingsQuery.isPlaceholderData ? bookingsQuery.data : null
  const ready = existing !== null
  const loadFailed = bookingsQuery.isError && existing === null

  const create = useCreateBooking({ onError: (e) => handleError(e) })
  const update = useUpdateBooking({ onError: (e) => handleError(e) })

  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange])

  // Create mode: the page date follows the form date and vice versa.
  useEffect(() => {
    if (mode === 'create' && isValidDateString(pageDate) && pageDate !== form.getValues('date')) {
      form.setValue('date', pageDate, { shouldDirty: true })
    }
  }, [mode, pageDate, form])

  // SPEC §7.5.4: a booking that has started can no longer be edited.
  useEffect(() => {
    if (mode === 'edit' && booking && isBookingLocked(booking, now)) onLocked(form.getValues())
  }, [mode, booking, now, form, onLocked])

  const errors: FormErrors = useMemo(
    () => ({ ...validateForm(values, { now, existing, excludeId }), ...serverErrors }),
    [values, now, existing, excludeId, serverErrors],
  )

  const startOptions = useMemo(
    () => (ready ? getStartOptions(formDate, existing, now, excludeId) : []),
    [ready, formDate, existing, now, excludeId],
  )
  const endOptions = useMemo(
    () => (ready && values.start ? getEndOptions(formDate, values.start, existing, excludeId) : []),
    [ready, formDate, existing, values.start, excludeId],
  )
  const freeIntervals = useMemo(
    () => (ready ? getFreeIntervals(formDate, existing, now, excludeId) : []),
    [ready, formDate, existing, now, excludeId],
  )

  const focusField = (field: FieldKey) => fieldRefs[field].current?.focus()
  // Focus requests wait until the fieldset is enabled again.
  useEffect(() => {
    if (!submitting && pendingFocus.current) {
      const field = pendingFocus.current
      pendingFocus.current = null
      fieldRefs[field].current?.focus()
    }
  })

  const clearServerError = (field: FieldKey) =>
    setServerErrors((prev) => {
      if (!(field in prev)) return prev
      const { [field]: _removed, ...rest } = prev
      return rest
    })

  const setField = (field: FieldKey, value: string) => {
    form.setValue(field, value, { shouldDirty: true, shouldTouch: true })
    clearServerError(field)
  }

  const onStartChange = (start: string) => {
    setField('start', start)
    if (!ready) return
    const ends = getEndOptions(formDate, start, existing, excludeId)
    const keep = ends.some((o) => o.time === values.end && o.free)
    if (keep) return
    const end = getDefaultEnd(formDate, start, existing, excludeId)
    setField('end', end)
    setAdjustedEnd(end)
  }

  const onEndChange = (end: string) => {
    setField('end', end)
    setAdjustedEnd(null)
  }

  const onDateChange = (date: string) => {
    setField('date', date)
    setFailure(null)
    onHighlight(null)
    if (mode === 'create' && isValidDateString(date)) onPageDateChange(date)
  }

  function handleError(error: Error) {
    if (!mounted.current) return // the form was closed meanwhile: do not touch the page
    const current = form.getValues()
    setSubmitting(false)
    inFlight.current = false
    if (!(error instanceof ApiError)) {
      setFailure({ kind: 'server' })
      return
    }
    if (error.status === 409) {
      const conflicts = error.conflicts ?? []
      setFailure({ kind: 'conflict', conflicts, phase: 'refreshing' })
      onHighlight({ date: current.date, ids: conflicts.map((c) => c.id) })
      pendingFocus.current = 'start'
    } else if (error.status === 422 && error.reason === 'BOOKING_LOCKED') {
      onLocked(current)
    } else if (error.status === 422 && error.fieldErrors) {
      const next: ServerErrors = {}
      for (const [field, detail] of Object.entries(error.fieldErrors)) {
        next[field as FieldKey] = detail.message
      }
      setServerErrors(next)
      const first = (['date', 'start', 'end', 'title'] as const).find((f) => next[f])
      if (first) pendingFocus.current = first
    } else if (error.status === 404) {
      setFailure({ kind: 'notFound' })
    } else if (error.status === 400) {
      console.error('Bad request', error)
      setFailure({ kind: 'badRequest' })
    } else {
      setFailure({ kind: 'server' })
    }
  }

  /** After a 409 the mutation has already refetched the list; report whether that succeeded. */
  const reportRefresh = (date: string) => {
    const failed = queryClient.getQueryState(bookingKeys.byDate(date))?.status === 'error'
    setFailure((prev) =>
      prev?.kind === 'conflict' ? { ...prev, phase: failed ? 'failed' : 'done' } : prev,
    )
  }

  const retryRefresh = async () => {
    setFailure((prev) => (prev?.kind === 'conflict' ? { ...prev, phase: 'refreshing' } : prev))
    await bookingsQuery.refetch()
    reportRefresh(formDate)
  }

  const onValid = async (v: FormValues) => {
    if (inFlight.current || create.isPending || update.isPending) return
    const freshNow = clock.now()
    if (mode === 'edit' && booking && isBookingLocked(booking, freshNow)) {
      onLocked(v)
      return
    }
    const found = validateForm(v, { now: freshNow, existing, excludeId })
    if (!ready || hasErrors(found)) {
      const field = firstInvalidField(found)
      if (field) focusField(field)
      return
    }

    inFlight.current = true
    setSubmitting(true)
    setFailure(null)
    setServerErrors({})
    onHighlight(null)
    try {
      const input = toBookingInput(v)
      if (mode === 'create') {
        const created = await create.mutateAsync(input)
        if (mounted.current) onSaved({ kind: 'created', booking: created })
      } else if (booking) {
        const updated = await update.mutateAsync({
          id: booking.id,
          // `title: ''` removes the title on the server
          patch: { ...input, title: v.title.trim() },
          oldDate: booking.date,
        })
        if (mounted.current) {
          onSaved({ kind: updated.date !== booking.date ? 'moved' : 'updated', booking: updated })
        }
      }
    } catch (e) {
      // handleError already ran (hook-level onError) before the refetch finished
      if (e instanceof ApiError && e.status === 409) reportRefresh(v.date)
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }
  const submit = (event?: FormEvent) => form.handleSubmit(onValid)(event)

  return {
    form,
    values,
    errors,
    ready,
    loadFailed,
    retryLoad: () => void bookingsQuery.refetch(),
    startOptions,
    endOptions,
    freeIntervals,
    submitting,
    busy: submitting || create.isPending || update.isPending,
    submit,
    failure,
    adjustedEnd,
    fieldRefs,
    onStartChange,
    onEndChange,
    onDateChange,
    onTitleChange: (title: string) => setField('title', title),
    retryRefresh,
    recreate: () => onRecreate(form.getValues()),
  }
}
