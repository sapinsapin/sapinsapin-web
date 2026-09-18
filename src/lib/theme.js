import { useCallback, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'

/* Theme state for a page root.
   The site ships two documents — the homepage and 404.html — and each mounts
   its own React root, so this lives here rather than inside App.jsx. Two copies
   of the view-transition dance would drift apart the first time either one was
   tuned, and the two pages sharing a palette but not a wipe would be worse than
   having no wipe at all.

   The initial value is whatever the inline script in the document head already
   resolved before first paint, so mounting never flashes the other palette. */
export function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark')

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    // The head script writes this as an inline style, and an inline style beats
    // the `color-scheme` declarations in index.css — so without this line a
    // toggled page keeps the *initial* theme's native scrollbars and form
    // controls for the rest of the visit.
    root.style.colorScheme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0D0C0B' : '#FBF7F0')
    try { localStorage.setItem('sapinsapin-theme', theme) } catch { /* Theme still works when storage is unavailable. */ }
  }, [theme])

  // Circular wipe out of the toggle where View Transitions exist; a short
  // colour-only crossfade everywhere else, removed once it has run so the
  // page is never left with global transitions attached.
  const toggleTheme = useCallback((event) => {
    const root = document.documentElement
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark'
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const target = event?.currentTarget
    if (target?.getBoundingClientRect) {
      const rect = target.getBoundingClientRect()
      root.style.setProperty('--wipe-x', `${rect.left + rect.width / 2}px`)
      root.style.setProperty('--wipe-y', `${rect.top + rect.height / 2}px`)
    }

    if (reduceMotion || typeof document.startViewTransition !== 'function') {
      root.classList.add('theme-sweep')
      window.setTimeout(() => root.classList.remove('theme-sweep'), 520)
      setTheme(next)
      return
    }
    // A view transition's promises reject when the wipe is skipped — a
    // backgrounded tab, or a second toggle landing mid-wipe. `ready` is the one
    // that rejects in practice, but both are settled here: the theme has
    // already changed by then, so an unhandled rejection would be logging a
    // failure for something that is not one.
    const transition = document.startViewTransition(() => flushSync(() => setTheme(next)))
    transition.ready.catch(() => {})
    transition.finished.catch(() => {})
  }, [])

  return [theme, toggleTheme]
}
