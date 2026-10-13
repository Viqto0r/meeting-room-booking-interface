import { AlertTriangle, Info, XCircle } from 'lucide-react'
import type { ReactNode, Ref } from 'react'

type Tone = 'warning' | 'error' | 'info'

const tones: Record<Tone, { box: string; Icon: typeof Info }> = {
  warning: { box: 'border-amber-500 bg-amber-50 text-amber-950', Icon: AlertTriangle },
  error: { box: 'border-red-600 bg-red-50 text-red-950', Icon: XCircle },
  info: { box: 'border-indigo-600 bg-indigo-50 text-indigo-950', Icon: Info },
}

type AlertProps = {
  tone?: Tone
  children: ReactNode
  /** Announce immediately (`role="alert"`). */
  assertive?: boolean
  className?: string
  id?: string
  ref?: Ref<HTMLDivElement>
}

export function Alert({
  tone = 'info',
  assertive = false,
  className = '',
  children,
  id,
  ref,
}: AlertProps) {
  const { box, Icon } = tones[tone]
  return (
    <div
      ref={ref}
      id={id}
      role={assertive ? 'alert' : 'status'}
      className={`flex gap-3 rounded-lg border-l-4 p-3.5 text-sm shadow-sm ${box} ${className}`}
    >
      <Icon aria-hidden="true" size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2">{children}</div>
    </div>
  )
}
