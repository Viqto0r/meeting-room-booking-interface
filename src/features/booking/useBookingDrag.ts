import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { Booking } from '@/domain/booking'
import { fromMinutes, toMinutes } from '@/domain/time'
import { DAY_END_MIN, DAY_START_MIN, PX_PER_MIN } from './timelineGeometry'

const STEP_MIN = 15
const THRESHOLD_PX = 5
const SETTLE_MS = 120

export type MoveProblem = 'past' | 'busy' | 'invalid'
export const PROBLEM_TEXT: Record<MoveProblem, string> = {
  past: 'время уже прошло',
  busy: 'занято',
  invalid: 'недоступно',
}

export type DragParams = {
  booking: Booking
  /** Locked and busy bookings cannot be dragged. */
  enabled: boolean
  /** Why the booking cannot be moved by `deltaMin`, or null when it can. */
  getProblem: (booking: Booking, deltaMin: number) => MoveProblem | null
  /** May return a promise: the dropped block stays on its slot until it settles. */
  onMove: (booking: Booking, deltaMin: number) => void | Promise<void>
  /** The booking was dropped on a position that is not allowed. */
  onReject: (problem: MoveProblem) => void
}

/**
 * Vertical drag of a booking block with a mouse or pen, snapped to 15 minutes.
 * Touch is not handled: it would fight with scrolling, and the form is always available.
 * Esc cancels. A drag never counts as a click.
 */
export function useBookingDrag({ booking, enabled, getProblem, onMove, onReject }: DragParams) {
  type DragState = { delta: number; offsetPx: number; baseStart: string; settling: boolean }
  const [drag, setDrag] = useState<DragState | null>(null)
  const suppressClick = useRef(false)
  // the gesture outlives renders: it must see the latest rules and callbacks, and stop on unmount
  const latest = useRef({ booking, getProblem, onMove, onReject })
  const cancelDrag = useRef<(() => void) | null>(null)
  useEffect(() => {
    latest.current = { booking, getProblem, onMove, onReject }
  })
  useEffect(() => () => cancelDrag.current?.(), [])

  const onPointerDown = (e: PointerEvent) => {
    if (!enabled || e.button !== 0 || e.pointerType === 'touch' || cancelDrag.current) return
    const startY = e.pageY
    const baseStart = booking.start
    const startMin = toMinutes(booking.start)
    const endMin = toMinutes(booking.end)
    const minDelta = DAY_START_MIN - startMin
    const maxDelta = DAY_END_MIN - endMin
    let dragging = false
    let current = 0

    const move = (ev: globalThis.PointerEvent) => {
      const dy = ev.pageY - startY
      if (!dragging && Math.abs(dy) < THRESHOLD_PX) return
      dragging = true
      const snapped = Math.round(dy / PX_PER_MIN / STEP_MIN) * STEP_MIN
      current = Math.min(Math.max(snapped, minDelta), maxDelta)
      // the block follows the cursor smoothly; the dashed ghost shows the snapped target
      const offsetPx = Math.min(Math.max(dy, minDelta * PX_PER_MIN), maxDelta * PX_PER_MIN)
      setDrag({ delta: current, offsetPx, baseStart, settling: false })
    }
    /** Ease the block back where it was (rejected or cancelled drop). */
    const settleBack = () => {
      setDrag({ delta: 0, offsetPx: 0, baseStart, settling: true })
      setTimeout(() => setDrag(null), SETTLE_MS)
    }
    const finish = (commit: boolean) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key)
      cancelDrag.current = null
      if (!dragging) return
      suppressClick.current = true
      setTimeout(() => (suppressClick.current = false), 0)
      const {
        booking: b,
        getProblem: problemOf,
        onMove: commitMove,
        onReject: reject,
      } = latest.current
      if (!commit || current === 0) return settleBack()
      const problem = problemOf(b, current)
      if (problem) {
        reject(problem)
        return settleBack()
      }
      // Hold the block on the snapped slot until the (optimistic) data arrives: no flash, no jump.
      setDrag({ delta: current, offsetPx: current * PX_PER_MIN, baseStart, settling: true })
      void Promise.resolve(commitMove(b, current)).finally(() => setDrag(null))
    }
    const up = () => finish(true)
    const cancel = () => finish(false)
    const key = (ev: KeyboardEvent) => ev.key === 'Escape' && finish(false)

    cancelDrag.current = () => finish(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key)
  }

  // once the booking itself has moved (optimistic update), the drag visuals expire on their own
  const active = drag && drag.baseStart === booking.start ? drag : null
  const moved = active && {
    ...active,
    problem: active.delta === 0 ? null : getProblem(booking, active.delta),
    range: `${fromMinutes(toMinutes(booking.start) + active.delta)}–${fromMinutes(toMinutes(booking.end) + active.delta)}`,
  }

  return { onPointerDown, suppressClick, moved }
}
