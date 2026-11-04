import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
} from "react"
import type { ReactNode } from "react"

export const THEME_STORAGE_KEY = "universal-erp-theme"

export type ThemePreference = "light" | "dark"

type ThemeContextValue = {
  theme: ThemePreference
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function getInitialTheme(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === "dark" || stored === "light") return stored
  } catch (error) {
    console.error("Could not read the saved theme preference.", error)
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemePreference>(getInitialTheme)

  useLayoutEffect(() => {
    const root = document.documentElement
    root.classList.toggle("dark", theme === "dark")
    root.style.colorScheme = theme
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch (error) {
      console.error("Could not persist the theme preference.", error)
    }
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((current) => current === "dark" ? "light" : "dark")
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error("useTheme must be used within ThemeProvider.")
  return context
}
