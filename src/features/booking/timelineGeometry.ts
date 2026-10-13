import { WORKDAY_END, WORKDAY_START } from '@/domain/constants'
import { toMinutes } from '@/domain/time'

/** 1 minute = 1.6px on every width (SPEC §7.3): a 30-minute booking is 48px tall. */
export const PX_PER_MIN = 1.6
export const DAY_START_MIN = toMinutes(WORKDAY_START)
export const DAY_END_MIN = toMinutes(WORKDAY_END)
export const TIMELINE_HEIGHT = (DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN
/** Bookings shorter than this are drawn in a compact one-line form. */
export const COMPACT_BELOW_MIN = 45
/** Gap left between neighbouring blocks. */
export const BLOCK_GAP_PX = 2

export const minToPx = (min: number) => (min - DAY_START_MIN) * PX_PER_MIN

export function blockRect(startMin: number, endMin: number) {
  return {
    top: minToPx(startMin) + BLOCK_GAP_PX / 2,
    height: (endMin - startMin) * PX_PER_MIN - BLOCK_GAP_PX,
  }
}
