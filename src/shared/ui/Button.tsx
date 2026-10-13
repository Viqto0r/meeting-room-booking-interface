import type { ButtonHTMLAttributes, Ref } from 'react'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const variants: Record<Variant, string> = {
  primary: 'bg-indigo-600 text-[#fff] shadow-sm hover:bg-indigo-700 border-indigo-600',
  secondary: 'bg-white text-slate-800 shadow-sm hover:bg-slate-50 border-slate-300',
  danger: 'bg-red-600 text-[#fff] shadow-sm hover:bg-red-700 border-red-600',
  ghost: 'bg-transparent text-slate-900 hover:bg-slate-200 border-transparent',
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  loading?: boolean
  ref?: Ref<HTMLButtonElement>
}

export function Button({
  variant = 'secondary',
  loading = false,
  className = '',
  children,
  type = 'button',
  ref,
  ...rest
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors aria-disabled:cursor-not-allowed aria-disabled:opacity-60 disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}
