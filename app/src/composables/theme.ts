export type Theme = 'system' | 'light' | 'dark'
const KEY = 'mm.theme'

export function savedTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY)
    return t === 'light' || t === 'dark' ? t : 'system'
  } catch {
    return 'system'
  }
}

/** Sets the theme on the page and remembers it; "system" follows the OS. */
export function applyTheme(t: Theme = savedTheme(), remember = false) {
  if (remember) { try { localStorage.setItem(KEY, t) } catch { /* private mode */ } }
  if (t === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = t
}
