import { useId, type Ref } from 'react'
import type { DayAvailability } from '@/domain/rules'
import { Button } from '@/shared/ui/Button'
import { messages } from './messages'

type Props = {
  availability: DayAvailability | 'loading'
  onClick: () => void
  ref?: Ref<HTMLButtonElement>
}

/** `aria-disabled` keeps the button focusable; the reason is visible and linked via aria-describedby. */
export function NewBookingButton({ availability, onClick, ref }: Props) {
  const reasonId = useId()
  const reason =
    availability === 'available'
      ? null
      : availability === 'loading'
        ? 'Загрузка…'
        : messages.availability[availability]
  const disabled = reason !== null
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        ref={ref}
        variant="primary"
        aria-disabled={disabled || undefined}
        aria-describedby={disabled ? reasonId : undefined}
        onClick={disabled ? undefined : onClick}
      >
        {messages.newBooking}
      </Button>
      {reason && (
        <p id={reasonId} className="text-sm text-slate-700">
          {reason}
        </p>
      )}
    </div>
  )
}
