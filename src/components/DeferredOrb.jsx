import { Suspense, lazy, useEffect, useRef, useState } from 'react'

// Mounts a lazy chunk a beat after paint, so its fetch never competes with the
// page's own first load of scripts, fonts and catalog data. Shared by both page
// roots — App.jsx (homepage) and NotFound.jsx (404) — which pass their own
// `load` factory for the module that owns the fixed widget (ChatWidget).
// A fixed-position widget, so a null fallback shifts no layout while the chunk
// loads: it does not occupy a place in the document flow.
export default function DeferredOrb({ load, after = 1400 }) {
  // Create the lazy component exactly once — re-creating it on every render
  // would unmount and remount the widget each time the parent re-renders,
  // dropping the widget's state (e.g. a live recording) mid-flight.
  const [Component] = useState(() => lazy(load))
  const [ready, setReady] = useState(false)
  const done = useRef(false)

  useEffect(() => {
    // The very first user interaction — any scroll, click or keypress — is a
    // stronger signal than a timer: the visitor is looking at the page, so the
    // widget should mount then instead of a fixed beat later. The back-to-top
    // button (in the same startup bundle) appears the moment the page scrolls,
    // and the mounted widget's own scroll listener reconciles visible state on
    // the same event, so the two turn on together instead of the chat trailing.
    const mount = () => {
      if (done.current) return
      done.current = true
      setReady(true)
      teardown()
    }
    const id = window.setTimeout(mount, after)
    const teardown = () => {
      window.clearTimeout(id)
      window.removeEventListener('scroll', mount, { capture: true, passive: true })
      window.removeEventListener('pointerdown', mount, { capture: true, passive: true })
      window.removeEventListener('keydown', mount, { capture: true })
    }
    window.addEventListener('scroll', mount, { capture: true, passive: true })
    window.addEventListener('pointerdown', mount, { capture: true, passive: true })
    window.addEventListener('keydown', mount, { capture: true })
    return teardown
  }, [after])

  if (!ready) return null
  return <Suspense fallback={null}><Component /></Suspense>
}