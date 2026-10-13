import { Loader2 } from 'lucide-react'

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 aria-hidden="true" className={`animate-spin ${className}`} size={16} />
}
