import { Button } from '@/shared/ui/Button'
import { messages } from '../messages'

type Props = {
  /** CTA is shown only when booking is possible; it shares the handler with "Новая бронь". */
  onBook?: () => void
}

export function EmptyState({ onBook }: Props) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-4">
      <p className="text-slate-800">{messages.empty}</p>
      {onBook && (
        <Button variant="primary" onClick={onBook}>
          {messages.book}
        </Button>
      )}
    </div>
  )
}
