export interface Clock {
  now(): Date
}

/** `getOverride` returns a local ISO string (YYYY-MM-DDTHH:mm:ss.sss) or null. */
export function createClock(getOverride: () => string | null): Clock {
  return {
    now() {
      const override = getOverride()
      if (override) {
        const parsed = parseLocalIso(override)
        if (parsed) return parsed
      }
      return new Date()
    },
  }
}

function parseLocalIso(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value)
  if (!m) return null
  const [, y, mo, d, h, mi, s = '0', ms = '0'] = m
  return new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s),
    Number(ms.padEnd(3, '0')),
  )
}
