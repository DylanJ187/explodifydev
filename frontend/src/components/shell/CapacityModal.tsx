// frontend/src/components/shell/CapacityModal.tsx
import { useEffect, useState } from 'react'
import {
  listGallery, galleryThumbnailUrl,
  type GalleryItem, type GalleryTier,
} from '../../api/client'
import { Modal } from './Modal'

interface Props {
  open: boolean
  tier: GalleryTier
  cap: number
  savedCount: number
  busy?: boolean
  onReplace: (replaceId: string) => void
  onDiscard: () => void
  onBackToPreview: () => void
  onClose: () => void
}

function kindBadge(k: GalleryItem['kind']): string {
  switch (k) {
    case 'base':     return 'UNSTYLED'
    case 'styled':   return 'STYLED'
    case 'loop':     return '6S LOOP'
    case 'stitched': return 'STITCHED'
  }
}

export function CapacityModal({
  open, tier, cap, savedCount, busy,
  onReplace, onDiscard, onBackToPreview, onClose,
}: Props) {
  const [items, setItems] = useState<GalleryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setSelectedId(null)
    setLoading(true)
    listGallery()
      .then(data => setItems([...data].sort((a, b) => b.created_at - a.created_at)))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [open])

  return (
    <Modal open={open} onClose={onClose} title="Gallery at capacity" size="lg">
      <div className="cap-modal-lead">
        You've saved <strong>{savedCount}</strong> of <strong>{cap}</strong> videos
        on your <strong>{tier}</strong> plan. Pick an existing clip to
        replace, discard the new render, or jump back to the preview.
      </div>

      <div className="cap-modal-gridwrap">
        {loading ? (
          <div className="cap-modal-loading">Loading gallery…</div>
        ) : items.length === 0 ? (
          <div className="cap-modal-loading">Gallery is empty.</div>
        ) : (
          <div className="cap-modal-grid">
            {items.map(it => {
              const sel = selectedId === it.id
              return (
                <button
                  key={it.id}
                  type="button"
                  className={`cap-modal-tile ${sel ? 'cap-modal-tile--selected' : ''}`}
                  onClick={() => setSelectedId(it.id)}
                  aria-pressed={sel}
                >
                  <div className="cap-modal-tile-thumb">
                    {it.thumbnail_path
                      ? <img src={galleryThumbnailUrl(it.id)} alt="" loading="lazy" />
                      : <div className="cap-modal-tile-empty" />}
                    <span className="cap-modal-tile-kind">{kindBadge(it.kind)}</span>
                  </div>
                  <div className="cap-modal-tile-title" title={it.title}>{it.title}</div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="cap-modal-actions">
        <button type="button" className="ex-modal-btn" onClick={onBackToPreview} disabled={busy}>
          Back to preview
        </button>
        <button type="button" className="ex-modal-btn ex-modal-btn--danger" onClick={onDiscard} disabled={busy}>
          Discard new render
        </button>
        <button
          type="button"
          className="ex-modal-btn ex-modal-btn--primary"
          onClick={() => selectedId && onReplace(selectedId)}
          disabled={!selectedId || busy}
        >
          {busy ? 'Replacing…' : 'Replace selected'}
        </button>
      </div>
    </Modal>
  )
}
