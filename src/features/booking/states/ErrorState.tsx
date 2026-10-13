import { Button } from '@/shared/ui/Button'
import { messages } from '../messages'

export function ErrorState({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-red-950"
    >
      <p className="font-medium">{messages.loadError}</p>
      <Button variant="secondary" onClick={onRetry} loading={retrying}>
        {messages.retry}
      </Button>
    </div>
  )
}
