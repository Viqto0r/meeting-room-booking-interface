import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { messages } from './messages'

type Props = {
  open: boolean
  onKeepEditing: () => void
  onDiscard: () => void
}

export function ConfirmDiscardDialog({ open, onKeepEditing, onDiscard }: Props) {
  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => !next && onKeepEditing()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-slate-900/50" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-5 shadow-xl">
          <AlertDialog.Title className="text-lg font-semibold">
            {messages.discard.title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-slate-700">
            Введённые данные будут потеряны.
          </AlertDialog.Description>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Action
              onClick={onDiscard}
              className="min-h-11 rounded-md border border-red-700 bg-red-700 px-4 py-2 text-sm font-medium text-[#fff] hover:bg-red-800"
            >
              {messages.discard.confirm}
            </AlertDialog.Action>
            <AlertDialog.Cancel className="min-h-11 rounded-md border border-slate-400 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100">
              {messages.discard.keep}
            </AlertDialog.Cancel>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
