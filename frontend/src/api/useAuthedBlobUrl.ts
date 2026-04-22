// frontend/src/api/useAuthedBlobUrl.ts
// Media endpoints (/gallery/:id/video, /gallery/:id/thumbnail,
// /jobs/:id/base_video/...) require a Bearer token, which the browser will
// never attach to a native <video src> or <img src> request. We resolve the
// path via authFetch, convert the response into an object URL, and return
// that URL so the native element can load it without extra auth.
//
// This loses HTTP range requests on videos — seek becomes a no-op until the
// whole clip is buffered — which is acceptable for our ~3–6s render loops.
// Swap to signed URLs if clips ever get long enough for seeking to matter.
import { useEffect, useState } from 'react'
import { authFetch } from './authFetch'

export function useAuthedBlobUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!path) {
      setUrl(null)
      return
    }

    let cancelled = false
    let createdUrl: string | null = null

    ;(async () => {
      try {
        const resp = await authFetch(path)
        if (!resp.ok) {
          if (!cancelled) setUrl(null)
          return
        }
        const blob = await resp.blob()
        if (cancelled) return
        createdUrl = URL.createObjectURL(blob)
        setUrl(createdUrl)
      } catch {
        if (!cancelled) setUrl(null)
      }
    })()

    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [path])

  return url
}
