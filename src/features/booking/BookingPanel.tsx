import { useState } from 'react'
import type { Booking } from '@/domain/booking'
import { BookingDetails } from './BookingDetails'
import { BookingForm } from './BookingForm'
import { DeleteBookingDialog } from './DeleteBookingDialog'
import type { FormValues } from './formSchema'
import { messages } from './messages'
import type { FormCallbacks } from './useBookingForm'

export type PanelState =
  | { mode: 'closed' }
  | { mode: 'create'; key: number; start?: string; values?: FormValues }
  | { mode: 'edit'; key: number; booking: Booking }
  | { mode: 'view'; key: number; booking: Booking; locked?: { unsaved?: FormValues } }

export type PanelHandlers = FormCallbacks & {
  onClose: () => void
  onDeleted: (result: { alreadyGone: boolean }) => void
}

type Props = PanelHandlers & {
  state: PanelState
  pageDate: string
}

/** Right column on desktop; on mobile it renders only when something is open. */
export function BookingPanel({ state, pageDate, ...handlers }: Props) {
  switch (state.mode) {
    case 'closed':
      return (
        <div className="hidden rounded-2xl border border-dashed border-slate-300 bg-white/70 p-8 text-center text-slate-600 lg:block">
          {messages.panelPlaceholder}
        </div>
      )
    case 'create':
      return (
        <BookingForm
          key={state.key}
          mode="create"
          pageDate={pageDate}
          start={state.start}
          values={state.values}
          onCancel={handlers.onClose}
          {...handlers}
        />
      )
    case 'edit':
      return <EditPanel key={state.key} booking={state.booking} pageDate={pageDate} {...handlers} />
    case 'view':
      return (
        <BookingDetails
          key={state.key}
          booking={state.booking}
          locked={state.locked}
          onClose={handlers.onClose}
        />
      )
  }
}

function EditPanel({
  booking,
  pageDate,
  ...handlers
}: PanelHandlers & { booking: Booking; pageDate: string }) {
  const [deleting, setDeleting] = useState(false)
  return (
    <>
      <BookingForm
        mode="edit"
        booking={booking}
        pageDate={pageDate}
        onCancel={handlers.onClose}
        onDelete={() => setDeleting(true)}
        {...handlers}
      />
      <DeleteBookingDialog
        booking={booking}
        open={deleting}
        onClose={() => setDeleting(false)}
        onDeleted={handlers.onDeleted}
      />
    </>
  )
}
