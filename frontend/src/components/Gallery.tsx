// frontend/src/components/Gallery.tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  listGallery, deleteGalleryItem, renameGalleryItem,
  stitchGalleryItems, galleryVideoUrl, galleryThumbnailUrl,
} from '../api/client'
import type { GalleryItem, GalleryKind } from '../api/client'
import { CustomVideoPlayer } from './CustomVideoPlayer'

type FilterKind = 'all' | GalleryKind

const FILTERS: { value: FilterKind; label: string }[] = [
  { value: 'all',       label: 'All' },
  { value: 'base',      label: 'Unstyled' },
  { value: 'styled',    label: 'Styled' },
  { value: 'loop',      label: '6s Loops' },
  { value: 'stitched',  label: 'Stitched' },
]

export function Gallery() {
  const [items, setItems] = useState<GalleryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterKind>('all')
  const [error, setError] = useState<string | null>(null)
  const [previewItem, setPreviewItem] = useState<GalleryItem | null>(null)
  const [selection, setSelection] = useState<string[]>([])
  const [stitchTitle, setStitchTitle] = useState('')
  const [stitching, setStitching] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listGallery()
      setItems(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load gallery')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const filtered = useMemo(() => {
    if (filter === 'all') return items
    return items.filter(it => it.kind === filter)
  }, [items, filter])

  const selectedItems = useMemo(
    () => selection.map(id => items.find(it => it.id === id)).filter((v): v is GalleryItem => !!v),
    [selection, items],
  )

  function toggleSelect(id: string) {
    setSelection(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function moveSelection(id: string, delta: -1 | 1) {
    setSelection(prev => {
      const idx = prev.indexOf(id)
      if (idx < 0) return prev
      const next = [...prev]
      const target = idx + delta
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  async function handleStitch() {
    if (selection.length < 2) return
    setStitching(true)
    try {
      await stitchGalleryItems(selection, stitchTitle.trim() || undefined)
      setSelection([])
      setStitchTitle('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Stitch failed')
    } finally {
      setStitching(false)
    }
  }

  async function handleDelete(item: GalleryItem) {
    if (!confirm(`Delete "${item.title}"?`)) return
    try {
      await deleteGalleryItem(item.id)
      setSelection(prev => prev.filter(id => id !== item.id))
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  async function handleRename(item: GalleryItem) {
    const next = prompt('Rename video:', item.title)
    if (next === null) return
    const clean = next.trim()
    if (!clean || clean === item.title) return
    try {
      await renameGalleryItem(item.id, clean)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rename failed')
    }
  }

  return (
    <div className="gallery-root">

      <div className="gallery-header">
        <div className="gallery-header-left">
          <h2 className="gallery-title">Gallery</h2>
          <span className="gallery-count">{items.length} videos</span>
        </div>
        <div className="gallery-filters">
          {FILTERS.map(f => (
            <button
              key={f.value}
              className={`gallery-filter ${filter === f.value ? 'gallery-filter--active' : ''}`}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="gallery-error">{error}</div>}

      {loading && items.length === 0 && (
        <div className="gallery-empty">Loading…</div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="gallery-empty">
          {items.length === 0
            ? 'No videos saved yet. Generate a render to see it here.'
            : 'No videos match this filter.'}
        </div>
      )}

      <div className="gallery-grid">
        {filtered.map(item => (
          <GalleryCard
            key={item.id}
            item={item}
            selected={selection.includes(item.id)}
            selectionIndex={selection.indexOf(item.id)}
            onToggleSelect={() => toggleSelect(item.id)}
            onPreview={() => setPreviewItem(item)}
            onDelete={() => handleDelete(item)}
            onRename={() => handleRename(item)}
          />
        ))}
      </div>

      {selection.length > 0 && (
        <StitchBar
          items={selectedItems}
          title={stitchTitle}
          onTitleChange={setStitchTitle}
          onMove={moveSelection}
          onRemove={(id) => setSelection(prev => prev.filter(x => x !== id))}
          onClear={() => setSelection([])}
          onStitch={handleStitch}
          stitching={stitching}
        />
      )}

      {previewItem && (
        <PreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
      )}

    </div>
  )
}

// ─── Card ───────────────────────────────────────────────────────────────────

function GalleryCard({
  item, selected, selectionIndex, onToggleSelect, onPreview, onDelete, onRename,
}: {
  item: GalleryItem
  selected: boolean
  selectionIndex: number
  onToggleSelect: () => void
  onPreview: () => void
  onDelete: () => void
  onRename: () => void
}) {
  const kindLabel: Record<GalleryKind, string> = {
    base: 'UNSTYLED',
    styled: 'STYLED',
    loop: '6S LOOP',
    stitched: 'STITCHED',
  }
  return (
    <div
      className={`gallery-card ${selected ? 'gallery-card--selected' : ''}`}
    >
      <button
        className="gallery-card-thumb"
        onClick={onPreview}
        aria-label={`Preview ${item.title}`}
      >
        {item.thumbnail_path
          ? <img src={galleryThumbnailUrl(item.id)} alt="" loading="lazy" />
          : <div className="gallery-thumb-empty" />}
        <span className={`gallery-card-kind gallery-card-kind--${item.kind}`}>
          {kindLabel[item.kind]}
        </span>
        {selected && (
          <span className="gallery-card-selmark">{selectionIndex + 1}</span>
        )}
      </button>
      <div className="gallery-card-meta">
        <div className="gallery-card-title" title={item.title}>{item.title}</div>
        {item.duration_s != null && (
          <div className="gallery-card-duration">{item.duration_s.toFixed(1)}s</div>
        )}
      </div>
      <div className="gallery-card-actions">
        <button
          className={`gallery-card-btn ${selected ? 'gallery-card-btn--active' : ''}`}
          onClick={onToggleSelect}
        >
          {selected ? '✓ Stitch' : '+ Stitch'}
        </button>
        <a
          className="gallery-card-btn"
          href={galleryVideoUrl(item.id)}
          download={`${item.title.replace(/\s+/g, '_')}.mp4`}
        >
          ↓
        </a>
        <button className="gallery-card-btn" onClick={onRename}>✎</button>
        <button className="gallery-card-btn gallery-card-btn--danger" onClick={onDelete}>×</button>
      </div>
    </div>
  )
}

// ─── Stitcher drawer ────────────────────────────────────────────────────────

function StitchBar({
  items, title, onTitleChange, onMove, onRemove, onClear, onStitch, stitching,
}: {
  items: GalleryItem[]
  title: string
  onTitleChange: (v: string) => void
  onMove: (id: string, delta: -1 | 1) => void
  onRemove: (id: string) => void
  onClear: () => void
  onStitch: () => void
  stitching: boolean
}) {
  return (
    <div className="stitch-bar animate-fade-in">
      <div className="stitch-bar-header">
        <span className="stitch-bar-title">Stitch order</span>
        <span className="stitch-bar-count">{items.length} clips</span>
        <button className="stitch-bar-clear" onClick={onClear}>Clear</button>
      </div>
      <div className="stitch-bar-list">
        {items.map((it, idx) => (
          <div key={it.id} className="stitch-bar-item">
            <span className="stitch-bar-idx">{idx + 1}</span>
            <span className="stitch-bar-name">{it.title}</span>
            <div className="stitch-bar-item-actions">
              <button
                className="stitch-bar-nudge"
                disabled={idx === 0}
                onClick={() => onMove(it.id, -1)}
              >↑</button>
              <button
                className="stitch-bar-nudge"
                disabled={idx === items.length - 1}
                onClick={() => onMove(it.id, 1)}
              >↓</button>
              <button
                className="stitch-bar-nudge stitch-bar-nudge--danger"
                onClick={() => onRemove(it.id)}
              >×</button>
            </div>
          </div>
        ))}
      </div>
      <div className="stitch-bar-footer">
        <input
          className="stitch-bar-input"
          placeholder="Title for stitched video (optional)"
          value={title}
          onChange={e => onTitleChange(e.target.value)}
        />
        <button
          className="stitch-bar-submit"
          disabled={items.length < 2 || stitching}
          onClick={onStitch}
        >
          {stitching ? 'Stitching…' : `Stitch ${items.length} clips →`}
        </button>
      </div>
    </div>
  )
}

// ─── Preview modal ──────────────────────────────────────────────────────────

function PreviewModal({ item, onClose }: { item: GalleryItem; onClose: () => void }) {
  return (
    <div className="gallery-modal" onClick={onClose}>
      <div className="gallery-modal-content" onClick={e => e.stopPropagation()}>
        <div className="gallery-modal-header">
          <span className="gallery-modal-title">{item.title}</span>
          <button className="gallery-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="gallery-modal-player">
          <CustomVideoPlayer
            src={galleryVideoUrl(item.id)}
            downloadName={`${item.title.replace(/\s+/g, '_')}.mp4`}
            canDownload={false}
            autoPlay={true}
            loop={true}
          />
        </div>
      </div>
    </div>
  )
}
