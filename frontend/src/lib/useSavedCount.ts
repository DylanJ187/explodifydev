// frontend/src/lib/useSavedCount.ts
import { useCallback, useEffect, useState } from 'react'
import { getGalleryStats, type GalleryStats } from '../api/client'

export interface SavedCountState {
  stats: GalleryStats | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  setStats: (next: GalleryStats) => void
}

// Singleton subscriber set so any save/replace/delete event reaches every
// component showing the counter without a backend poll per component.
const subscribers = new Set<(s: GalleryStats) => void>()

export function publishSavedCount(stats: GalleryStats): void {
  subscribers.forEach(fn => fn(stats))
}

export function useSavedCount(): SavedCountState {
  const [stats, setStatsState] = useState<GalleryStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      const next = await getGalleryStats()
      setStatsState(next)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'stats failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const fn = (next: GalleryStats) => setStatsState(next)
    subscribers.add(fn)
    return () => { subscribers.delete(fn) }
  }, [refresh])

  const setStats = useCallback((next: GalleryStats) => {
    setStatsState(next)
    publishSavedCount(next)
  }, [])

  return { stats, loading, error, refresh, setStats }
}
