import type { Booking } from '@/domain/booking'
import type { RuleCode } from '@/domain/rules'

export type ApiErrorCode =
  'BAD_REQUEST' | 'VALIDATION_ERROR' | 'CONFLICT' | 'NOT_FOUND' | 'INTERNAL' | 'NETWORK'

export type FieldName = 'date' | 'start' | 'end' | 'title'
export type FieldErrors = Partial<Record<FieldName, { code: RuleCode; message: string }>>

export type ApiErrorInit = {
  status: number
  code: ApiErrorCode
  message: string
  reason?: RuleCode
  fieldErrors?: FieldErrors
  conflicts?: Booking[]
}

export class ApiError extends Error {
  status: number // 0 = network
  code: ApiErrorCode
  reason?: RuleCode
  fieldErrors?: FieldErrors
  conflicts?: Booking[]

  constructor(init: ApiErrorInit) {
    super(init.message)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.reason = init.reason
    this.fieldErrors = init.fieldErrors
    this.conflicts = init.conflicts
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError
