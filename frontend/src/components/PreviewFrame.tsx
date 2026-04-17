import { useEffect, useRef, useState } from 'react'
import { fetchPreviewFrame } from '../api/client'
import type { Vec3 } from './orientation/createViewer'

interface Props {
  previewId: string
  cameraDirection: Vec3
}

const DEBOUNCE_MS = 280

export function PreviewFrame({ previewId, cameraDirection }: Props) {
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  const abortRef  = useRef<AbortController | null>(null)
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevSrc   = useRef<string | null>(null)

  // Memoize camera direction as a stable key to avoid unnecessary refetches.
  const dirKey = `${cameraDirection[0].toFixed(3)},${cameraDirection[1].toFixed(3)},${cameraDirection[2].toFixed(3)}`

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)
      setError(false)

      try {
        const url = await fetchPreviewFrame(
          { previewId, cameraDirection },
          controller.signal,
        )
        if (controller.signal.aborted) return
        if (prevSrc.current) URL.revokeObjectURL(prevSrc.current)
        prevSrc.current = url
        setSrc(url)
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        setError(true)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  // dirKey is the stable dependency — avoid rerunning on each render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewId, dirKey])

  // Revoke blob URL on unmount to avoid memory leaks.
  useEffect(() => {
    return () => {
      if (prevSrc.current) URL.revokeObjectURL(prevSrc.current)
    }
  }, [])

  return (
    <div className="pf-box">
      <div className="pf-label">FIRST FRAME</div>
      {src && (
        <img
          src={src}
          alt="First frame preview"
          className="pf-img"
          draggable={false}
        />
      )}

      {!src && !loading && !error && (
        <div className="pf-placeholder">Frame Preview</div>
      )}

      {error && !loading && (
        <div className="pf-placeholder pf-placeholder--error">Preview unavailable</div>
      )}

      {loading && (
        <div className="pf-spinner-wrap">
          <div className="pf-spinner" />
        </div>
      )}
    </div>
  )
}
