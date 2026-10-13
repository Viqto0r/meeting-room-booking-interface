const KEY = 'room-booking:refetch-on-focus'

/** SPEC D12: refetch the list when the tab becomes visible again. On by default. */
export function readRefetchOnFocus(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== 'false'
  } catch {
    return true
  }
}

export function writeRefetchOnFocus(enabled: boolean): void {
  try {
    window.localStorage.setItem(KEY, String(enabled))
  } catch {
    // storage unavailable: the setting just does not persist
  }
}
