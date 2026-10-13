import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { useState } from 'react'
import { ApiError } from '@/api/errors'
import { useDeleteBooking } from '@/api/queries'
import type { Booking } from '@/domain/booking'
import { formatBookingLabel } from '@/domain/messages'
import { Spinner } from '@/shared/ui/Spinner'
import { messages } from './messages'

type Props = {
  booking: Booking
  open: boolean
  onClose: () => void
  /** `alreadyGone`: the server answered 404, which is treated as success. */
  onDeleted: (result: { alreadyGone: boolean }) => void
}

const t = messages.deleteDialog

export function DeleteBookingDialog({ booking, open, onClose, onDeleted }: Props) {
  const [error, setError] = useState<string | null>(null)
  const remove = useDeleteBooking({
    onError: (e) => {
      if (e instanceof ApiError && e.status === 404) return
      setError(e instanceof ApiError && e.reason === 'BOOKING_LOCKED' ? t.locked : t.failed)
    },
  })
  const pending = remove.isPending

  const confirm = async () => {
    setError(null)
    try {
      await remove.mutateAsync({ id: booking.id, date: booking.date })
      onDeleted({ alreadyGone: false })
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) onDeleted({ alreadyGone: true })
    }
  }

  const cancel = () => {
    if (pending) return
    setError(null)
    onClose()
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => !next && cancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-slate-900/50" />
        <AlertDialog.Content
          onEscapeKeyDown={(e) => pending && e.preventDefault()}
          onCloseAutoFocus={(e) => {
            // back to the button that opened the dialog (it is still in the form unless the booking was deleted)
            const trigger = document.getElementById('delete-booking-button')
            if (trigger) {
              e.preventDefault()
              trigger.focus()
            }
          }}
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-5 shadow-xl"
        >
          <AlertDialog.Title className="text-lg font-semibold">
            {t.title(formatBookingLabel(booking))}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-slate-700">
            Это действие нельзя отменить.
          </AlertDialog.Description>
          {error && (
            <p
              role="alert"
              className="mt-3 rounded border-l-4 border-red-600 bg-red-50 p-2 text-sm text-red-950"
            >
              {error}
            </p>
          )}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel
              disabled={pending}
              className="min-h-11 rounded-md border border-slate-400 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60"
            >
              {t.cancel}
            </AlertDialog.Cancel>
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={pending}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-red-700 bg-red-700 px-4 py-2 text-sm font-medium text-[#fff] hover:bg-red-800 disabled:opacity-60"
            >
              {pending && <Spinner />}
              {t.confirm}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
