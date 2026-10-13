import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays, formatLocalDate, isValidDateString } from '@/domain/time'
import { useNow } from '@/shared/useNow'
import { Button } from '@/shared/ui/Button'
import { formatFullDate, messages } from './messages'

type Props = {
  date: string
  onChange: (date: string) => void
}

export function DateNavigator({ date, onChange }: Props) {
  const today = formatLocalDate(useNow())
  const isPast = date < today

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button aria-label={messages.prevDay} onClick={() => onChange(addDays(date, -1))}>
        <ChevronLeft aria-hidden="true" size={18} />
      </Button>
      <Button onClick={() => onChange(today)}>{messages.today}</Button>
      <Button aria-label={messages.nextDay} onClick={() => onChange(addDays(date, 1))}>
        <ChevronRight aria-hidden="true" size={18} />
      </Button>
      <p className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight text-slate-800">
        <span data-testid="current-date">{formatFullDate(date)}</span>
        {isPast && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">
            {messages.pastDateBadge}
          </span>
        )}
      </p>
      <label className="flex items-center gap-2 text-sm md:ml-auto">
        <span>{messages.showDate}</span>
        <input
          type="date"
          value={date}
          // typing a year yields intermediate values (0002, 0020, …): only complete real dates count
          onChange={(e) => {
            const next = e.target.value
            if (isValidDateString(next) && next >= '1970-01-01' && next <= '2100-12-31')
              onChange(next)
          }}
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-2 shadow-sm"
        />
      </label>
    </div>
  )
}
