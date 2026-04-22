// frontend/src/components/ReplaceGalleryModal.tsx
import { useEffect, useState } from 'react'
import { galleryThumbnailUrl, listGallery } from '../api/client'
import type { GalleryItem } from '../api/client'
import { AuthedImg } from './AuthedImg'

interface Props {
  open: boolean
  savedCount: number
  cap: number
  onCancel: () => void
  onConfirm: (victimId: string) => void
}

export function ReplaceGalleryModal({ open, savedCount, cap, onCancel, onConfirm }: Props) {
  const [items, setItems] = useState<GalleryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setSelected(null)
      setError(null)
      return
    }
    setLoading(true)
    listGallery()
      .then(data => {
        setItems([...data].sort((a, b) => a.created_at - b.created_at))
        setError(null)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="replace-modal-backdrop" onClick={onCancel}>
      <div
        className="replace-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Replace a gallery clip"
        onClick={e => e.stopPropagation()}
      >
        <header className="replace-modal-head">
          <div>
            <div className="replace-modal-title">Gallery is full</div>
            <div className="replace-modal-sub">
              {savedCount}/{cap} clips saved · pick one to replace with your new render
            </div>
          </div>
          <button className="replace-modal-close" onClick={onCancel} aria-label="Close">×</button>
        </header>

        {error && <div className="replace-modal-error">{error}</div>}

        <div className="replace-modal-grid">
          {loading && <div className="replace-modal-loading">Loading your gallery…</div>}
          {!loading && items.length === 0 && (
            <div className="replace-modal-loading">No items to replace.</div>
          )}
          {items.map(it => (
            <button
              key={it.id}
              type="button"
              className={`replace-card ${selected === it.id ? 'replace-card--selected' : ''}`}
              onClick={() => setSelected(it.id)}
              aria-pressed={selected === it.id}
            >
              {it.thumbnail_path
                ? <AuthedImg src={galleryThumbnailUrl(it.id)} loading="lazy" />
                : <div className="replace-card-empty" />}
              <div className="replace-card-meta">
                <span className="replace-card-title" title={it.title}>{it.title}</span>
                <span className="replace-card-kind">{it.kind.toUpperCase()}</span>
              </div>
            </button>
          ))}
        </div>

        <footer className="replace-modal-foot">
          <button className="replace-modal-cancel" onClick={onCancel}>Cancel</button>
          <button
            className="replace-modal-confirm"
            disabled={!selected}
            onClick={() => selected && onConfirm(selected)}
          >
            Replace selected
          </button>
        </footer>
      </div>
    </div>
  )
}
