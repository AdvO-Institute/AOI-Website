/* ----------------------------------------------------------------------------
 * Live catalog context.
 *
 * Components never call Supabase directly — they read this. Fetching happens
 * once per page load, after hydration, so the prerendered HTML is what a
 * crawler sees and the live overlay is what a visitor sees.
 * -------------------------------------------------------------------------- */
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { fetchCatalog } from './events'
import type { EventCatalog } from './events'
import { zoomDates, zoomSeason } from '@/content/calendar'

const EMPTY: EventCatalog = { synced: false, byKey: {} }

const CatalogContext = createContext<EventCatalog>(EMPTY)

export function useCatalog() {
  return useContext(CatalogContext)
}

/** The sign-up window's key for a live event, found by its slug, so the
 *  members area can open the same window as the public page. Null when the
 *  event is not open on the public site. The Monthly Huddle sits behind all
 *  three Fundamentals pages; it opens as the part being taught next. */
export function useRegKey() {
  const { byKey } = useCatalog()
  return useCallback((slug?: string | null): string | null => {
    if (!slug) return null
    const keys = Object.keys(byKey).filter((k) => byKey[k]!.open && byKey[k]!.event?.slug === slug)
    if (keys.length < 2) return keys[0] ?? null
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const next = (k: string) => Math.min(Infinity, ...zoomDates(k, zoomSeason()).filter((d) => d >= today).map((d) => d.getTime()))
    return [...keys].sort((a, b) => next(a) - next(b))[0]!
  }, [byKey])
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<EventCatalog>(EMPTY)

  useEffect(() => {
    let cancelled = false
    void fetchCatalog().then((next) => {
      if (!cancelled) setCatalog(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return <CatalogContext.Provider value={catalog}>{children}</CatalogContext.Provider>
}
