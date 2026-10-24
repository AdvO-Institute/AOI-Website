/* Compact (one row per item) or comfortable (cards), remembered on this device.
 * Phones always get the cards, so `compact` is false on narrow screens. */
import { useEffect, useState } from 'react'

export type Density = 'compact' | 'comfortable'

/** True on phone-width screens; follows the window as it is resized. */
export function useNarrow(): boolean {
  const q = '(max-width: 860px)'
  const [n, setN] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => { const m = window.matchMedia(q); const f = () => setN(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f) }, [])
  return n
}

export function useDensity(key: string, fallback: Density) {
  const narrow = useNarrow()
  const [density, setState] = useState<Density>(() => {
    try { const v = localStorage.getItem(key); if (v === 'compact' || v === 'comfortable') return v } catch { /* no storage */ }
    return fallback
  })
  const setDensity = (v: Density) => { setState(v); try { localStorage.setItem(key, v) } catch { /* no storage */ } }
  return { compact: density === 'compact' && !narrow, narrow, setDensity }
}
