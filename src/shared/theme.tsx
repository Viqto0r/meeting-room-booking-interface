import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type Theme = 'light' | 'dark'
const KEY = 'room-booking:theme'

function initialTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(KEY)
    if (stored === 'light' || stored === 'dark') return stored
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      return 'dark'
    }
  } catch {
    // storage blocked: fall back to light
  }
  return 'light'
}

type ThemeContextValue = { theme: Theme; toggle: () => void }
const ThemeContext = createContext<ThemeContextValue>({ theme: 'light', toggle: () => {} })

/** Light/dark theme: the `dark` class on <html> remaps the palette (see index.css). */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      try {
        window.localStorage.setItem(KEY, next)
      } catch {
        // the choice just does not persist
      }
      return next
    })
  }, [])

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react/only-export-components
export const useTheme = (): ThemeContextValue => useContext(ThemeContext)
