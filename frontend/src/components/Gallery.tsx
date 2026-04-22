// frontend/src/components/Gallery.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  listGallery, deleteGalleryItem, renameGalleryItem,
  stitchGalleryItems, galleryVideoUrl, galleryThumbnailUrl,
  toggleFavorite, createGalleryLoop, listPendingRenders,
} from '../api/client'
import { authFetch } from '../api/authFetch'
import type { GalleryItem, GalleryKind, PendingRender } from '../api/client'
import { CustomVideoPlayer } from './CustomVideoPlayer'
import { AuthedImg } from './AuthedImg'
import { useAuthedBlobUrl } from '../api/useAuthedBlobUrl'
import { ConfirmModal, PromptModal } from './shell/Modal'
import { PricingModal } from './shell/PricingModal'

type FilterKey = 'all' | 'recent' | 'favorites' | GalleryKind

interface FilterDef {
  key: FilterKey
  label: string
  section: 'library' | 'type'
}

const FILTERS: FilterDef[] = [
  { key: 'all',       label: 'All',          section: 'library' },
  { key: 'recent',    label: 'Recent',       section: 'library' },
  { key: 'favorites', label: 'Favorites',    section: 'library' },
  { key: 'base',      label: 'Unstyled',     section: 'type' },
  { key: 'styled',    label: 'Styled',       section: 'type' },
  { key: 'loop',      label: '6s Loops',     section: 'type' },
  { key: 'stitched',  label: 'Stitched',     section: 'type' },
]

const KIND_LABEL: Record<GalleryKind, string> = {
  base: 'UNSTYLED',
  styled: 'STYLED',
  loop: '6S LOOP',
  stitched: 'STITCHED',
}

const RECENT_WINDOW_S = 7 * 24 * 60 * 60 // 7 days

function isFavorite(it: GalleryItem) {
  return it.metadata?.favorite === true
}

function isRecent(it: GalleryItem, now: number) {
  return it.created_at >= now - RECENT_WINDOW_S
}

function formatShortDate(unixSec: number) {
  const d = new Date(unixSec * 1000)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}.${dd}`
}

function canStyleInStudio(item: GalleryItem): boolean {
  return item.kind === 'base' || item.kind === 'stitched' || item.kind === 'loop'
}

function formatRemaining(seconds: number | null): string {
  if (seconds == null) return '—'
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rest = s % 60
  return rest === 0 ? `${m}m` : `${m}m ${rest}s`
}

export function Gallery() {
  const navigate = useNavigate()
  const [items, setItems] = useState<GalleryItem[]>([])
  const [pending, setPending] = useState<PendingRender[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [error, setError] = useState<string | null>(null)
  const [previewItem, setPreviewItem] = useState<GalleryItem | null>(null)
  const [selection, setSelection] = useState<string[]>([])
  const [stitchTitle, setStitchTitle] = useState('')
  const [stitching, setStitching] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<GalleryItem | null>(null)
  const [renameTarget, setRenameTarget] = useState<GalleryItem | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [loopingId, setLoopingId] = useState<string | null>(null)
  const [clockTick, setClockTick] = useState(0)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [data, pendingData] = await Promise.all([
        listGallery(),
        listPendingRenders().catch(() => [] as PendingRender[]),
      ])
      setItems(data)
      setPending(pendingData)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load gallery')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Poll pending-render list while any placeholders are in flight. When the
  // list empties (all jobs completed), refresh items once more to pick up
  // the autosaved rows, then stop polling.
  useEffect(() => {
    if (pending.length === 0) return
    let cancelled = false
    const interval = setInterval(async () => {
      try {
        const next = await listPendingRenders()
        if (cancelled) return
        setPending(next)
        if (next.length < pending.length) {
          const data = await listGallery()
          if (!cancelled) setItems(data)
        }
      } catch {
        // keep polling on transient errors
      }
    }, 3000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [pending.length])

  // Countdown tick (1Hz) just to re-render pending cards with live remaining.
  useEffect(() => {
    if (pending.length === 0) return
    const t = setInterval(() => setClockTick(c => c + 1), 1000)
    return () => clearInterval(t)
  }, [pending.length])

  const now = useMemo(() => Math.floor(Date.now() / 1000), [])

  const counts: Record<FilterKey, number> = useMemo(() => ({
    all:       items.length,
    recent:    items.filter(it => isRecent(it, now)).length,
    favorites: items.filter(isFavorite).length,
    base:      items.filter(it => it.kind === 'base').length,
    styled:    items.filter(it => it.kind === 'styled').length,
    loop:      items.filter(it => it.kind === 'loop').length,
    stitched:  items.filter(it => it.kind === 'stitched').length,
  }), [items, now])

  const filtered = useMemo(() => {
    const sorted = [...items].sort((a, b) => b.created_at - a.created_at)
    switch (filter) {
      case 'all':       return sorted
      case 'recent':    return sorted.filter(it => isRecent(it, now))
      case 'favorites': return sorted.filter(isFavorite)
      default:          return sorted.filter(it => it.kind === filter)
    }
  }, [items, filter, now])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tgt = e.target as HTMLElement | null
      const inField =
        tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)

      if (e.key === 'Escape') {
        if (previewItem) { setPreviewItem(null); return }
        if (renameTarget) { setRenameTarget(null); return }
        if (deleteTarget) { setDeleteTarget(null); return }
        if (bulkDeleteOpen) { setBulkDeleteOpen(false); return }
        if (selection.length > 0) { setSelection([]); return }
      }

      if (inField) return

      if ((e.key === 'Delete' || e.key === 'Backspace') && selection.length > 0 && !previewItem) {
        e.preventDefault()
        setBulkDeleteOpen(true)
        return
      }

      if (e.key === 'a' && (e.metaKey || e.ctrlKey) && !previewItem) {
        e.preventDefault()
        setSelection(filtered.map(it => it.id))
        return
      }

      if (e.key === 'g' && !previewItem) { setViewMode('grid'); return }
      if (e.key === 'l' && !previewItem) { setViewMode('list'); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewItem, renameTarget, deleteTarget, bulkDeleteOpen, selection.length, filtered])

  const activeFilter = FILTERS.find(f => f.key === filter) ?? FILTERS[0]

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

  async function confirmBulkDelete() {
    if (selection.length === 0) return
    setBulkDeleting(true)
    const ids = [...selection]
    try {
      await Promise.all(ids.map(id => deleteGalleryItem(id)))
      setSelection([])
      setBulkDeleteOpen(false)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk delete failed')
    } finally {
      setBulkDeleting(false)
    }
  }

  async function confirmDelete() {
    const item = deleteTarget
    if (!item) return
    setDeleteTarget(null)
    try {
      await deleteGalleryItem(item.id)
      setSelection(prev => prev.filter(id => id !== item.id))
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  async function handleToggleFavorite(item: GalleryItem) {
    const nextFav = !isFavorite(item)
    // Optimistic update
    setItems(prev => prev.map(it => it.id === item.id
      ? { ...it, metadata: { ...it.metadata, favorite: nextFav } }
      : it))
    try {
      await toggleFavorite(item.id, nextFav)
    } catch (e) {
      // Revert on failure
      setItems(prev => prev.map(it => it.id === item.id
        ? { ...it, metadata: { ...it.metadata, favorite: !nextFav } }
        : it))
      setError(e instanceof Error ? e.message : 'Favorite failed')
    }
  }

  function handleStyleInStudio(item: GalleryItem) {
    if (!canStyleInStudio(item)) return
    const variant = item.variant === 'x' || item.variant === 'y' || item.variant === 'z'
      ? item.variant
      : 'x'
    navigate('/studio', {
      state: {
        styleFromGallery: {
          galleryId: item.id,
          variant,
          title: item.title,
        },
      },
    })
  }

  async function handleCreateLoop(item: GalleryItem) {
    if (loopingId) return
    setLoopingId(item.id)
    try {
      await createGalleryLoop(item.id)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Loop creation failed')
    } finally {
      setLoopingId(null)
    }
  }

  async function submitRename(next: string) {
    const item = renameTarget
    if (!item) return
    const clean = next.trim()
    setRenameTarget(null)
    if (!clean || clean === item.title) return
    try {
      await renameGalleryItem(item.id, clean)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rename failed')
    }
  }

  const librarySection = FILTERS.filter(f => f.section === 'library')
  const typeSection    = FILTERS.filter(f => f.section === 'type')

  const isEmptyLibrary = !loading && items.length === 0

  return (
    <div className="gallery-root">

      {/* Sidebar */}
      <aside className="gallery-sidebar" aria-label="Gallery filters">
        <div className="gallery-sidebar-section">
          <div className="gallery-sidebar-heading">Library</div>
          <ul className="gallery-sidebar-list">
            {librarySection.map(f => (
              <SidebarItem
                key={f.key}
                label={f.label}
                count={counts[f.key]}
                active={filter === f.key}
                onClick={() => setFilter(f.key)}
              />
            ))}
          </ul>
        </div>

        <div className="gallery-sidebar-section">
          <div className="gallery-sidebar-heading">By Type</div>
          <ul className="gallery-sidebar-list">
            {typeSection.map(f => (
              <SidebarItem
                key={f.key}
                label={f.label}
                count={counts[f.key]}
                active={filter === f.key}
                onClick={() => setFilter(f.key)}
              />
            ))}
          </ul>
        </div>
      </aside>

      {/* Main */}
      <section className="gallery-main">
        <header className="gallery-main-header">
          <div className="gallery-main-headings">
            <h1 className="gallery-main-title">{activeFilter.label.toUpperCase()}</h1>
            <div className="gallery-main-sub">
              {loading
                ? 'Loading…'
                : `${filtered.length} ${filtered.length === 1 ? 'clip' : 'clips'} · sorted newest first`}
            </div>
          </div>
          <div className="gallery-view-toggle" role="group" aria-label="View mode">
            <button
              type="button"
              className={`gallery-view-btn ${viewMode === 'grid' ? 'gallery-view-btn--active' : ''}`}
              onClick={() => setViewMode('grid')}
              aria-pressed={viewMode === 'grid'}
            >
              Grid
            </button>
            <button
              type="button"
              className={`gallery-view-btn ${viewMode === 'list' ? 'gallery-view-btn--active' : ''}`}
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
            >
              List
            </button>
          </div>
        </header>

        {error && <div className="gallery-error">{error}</div>}

        {isEmptyLibrary ? (
          <EmptyState onStart={() => navigate('/studio')} />
        ) : !loading && filtered.length === 0 ? (
          <div className="gallery-empty-small">
            No clips in <strong>{activeFilter.label}</strong> yet.
          </div>
        ) : (
          <div className={viewMode === 'grid' ? 'gallery-grid' : 'gallery-list'}>
            {filter === 'all' || filter === 'recent' || filter === 'favorites'
              ? pending.map(p => (
                  <PendingCard key={p.job_id} render={p} mode={viewMode} tick={clockTick} />
                ))
              : null}
            {filtered.map(item => (
              <ProjectCard
                key={item.id}
                item={item}
                mode={viewMode}
                selected={selection.includes(item.id)}
                selectionIndex={selection.indexOf(item.id)}
                looping={loopingId === item.id}
                onToggleSelect={() => toggleSelect(item.id)}
                onPreview={() => setPreviewItem(item)}
                onDelete={() => setDeleteTarget(item)}
                onRename={() => setRenameTarget(item)}
                onToggleFavorite={() => handleToggleFavorite(item)}
                onCreateLoop={() => handleCreateLoop(item)}
                onStyleInStudio={() => handleStyleInStudio(item)}
              />
            ))}
          </div>
        )}
      </section>

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
          onBulkDelete={() => setBulkDeleteOpen(true)}
          bulkDeleting={bulkDeleting}
        />
      )}

      {previewItem && (
        <PreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
      )}

      <ConfirmModal
        open={bulkDeleteOpen}
        title={`Delete ${selection.length} ${selection.length === 1 ? 'video' : 'videos'}`}
        destructive
        confirmLabel={bulkDeleting ? 'Deleting…' : `Delete ${selection.length}`}
        message={
          <>Permanently remove <strong>{selection.length}</strong> {selection.length === 1 ? 'clip' : 'clips'} from your gallery? This frees up {selection.length} {selection.length === 1 ? 'slot' : 'slots'}.</>
        }
        onConfirm={confirmBulkDelete}
        onCancel={() => setBulkDeleteOpen(false)}
      />

      <ConfirmModal
        open={deleteTarget !== null}
        title="Delete video"
        destructive
        confirmLabel="Delete"
        message={
          deleteTarget
            ? <>Remove <strong>{deleteTarget.title}</strong> from your gallery? This frees up one slot.</>
            : null
        }
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <PromptModal
        open={renameTarget !== null}
        title="Rename video"
        label="Title"
        initialValue={renameTarget?.title ?? ''}
        placeholder="e.g. Gearbox · exploded · v2"
        confirmLabel="Rename"
        onSubmit={submitRename}
        onCancel={() => setRenameTarget(null)}
      />

    </div>
  )
}

// ─── Sidebar item ───────────────────────────────────────────────────────────

function SidebarItem({
  label, count, active, onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        className={`gallery-sidebar-item ${active ? 'gallery-sidebar-item--active' : ''}`}
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
      >
        <span className="gallery-sidebar-item-label">{label}</span>
        <span className="gallery-sidebar-item-count">{String(count).padStart(2, '0')}</span>
      </button>
    </li>
  )
}

// ─── Empty state ────────────────────────────────────────────────────────────

const EMPTY_QUIPS = [
  'This place is a bit empty — like a physicist\'s fridge.',
  'Nothing to see here. Your GPU is on a coffee break.',
  'The void stares back. Let\'s fill it with something glorious.',
  'No clips yet. The render queue is suspiciously peaceful.',
]

function EmptyState({ onStart }: { onStart: () => void }) {
  const quip = useMemo(() => EMPTY_QUIPS[Math.floor(Math.random() * EMPTY_QUIPS.length)], [])
  return (
    <div className="gallery-empty">
      <svg
        className="gallery-empty-icon"
        viewBox="0 0 32 32"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M16 7 L24.5 11.5 L24.5 20.5 L16 25 L7.5 20.5 L7.5 11.5 Z" />
        <path d="M16 16 L16 25 M7.5 11.5 L16 16 M24.5 11.5 L16 16" />
      </svg>
      <div className="gallery-empty-headline">Nothing saved yet</div>
      <div className="gallery-empty-quip">{quip}</div>
      <button type="button" className="gallery-empty-cta" onClick={onStart}>
        Start creating →
      </button>
    </div>
  )
}

// ─── Card ───────────────────────────────────────────────────────────────────

function ProjectCard({
  item, mode, selected, selectionIndex, looping,
  onToggleSelect, onPreview, onDelete, onRename, onToggleFavorite, onCreateLoop,
  onStyleInStudio,
}: {
  item: GalleryItem
  mode: 'grid' | 'list'
  selected: boolean
  selectionIndex: number
  looping: boolean
  onToggleSelect: () => void
  onPreview: () => void
  onDelete: () => void
  onRename: () => void
  onToggleFavorite: () => void
  onCreateLoop: () => void
  onStyleInStudio: () => void
}) {
  const showStyle = canStyleInStudio(item)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [hovering, setHovering] = useState(false)
  // Hover-preview video fetch is gated on hover — we don't want to pull 11
  // full clips upfront just to populate the grid. The trade-off is a small
  // first-hover delay while the blob downloads.
  const hoverVideoSrc = useAuthedBlobUrl(hovering ? galleryVideoUrl(item.id) : null)
  const favorite = isFavorite(item)

  async function onDownload() {
    const resp = await authFetch(galleryVideoUrl(item.id))
    if (!resp.ok) return
    const blob = await resp.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${item.title.replace(/\s+/g, '_')}.mp4`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }
  const cls = `project-card project-card--${mode}
    ${selected ? 'project-card--selected' : ''}
    ${hovering ? 'project-card--hovering' : ''}`

  function onEnter() {
    setHovering(true)
    const v = videoRef.current
    if (v) {
      v.currentTime = 0
      v.play().catch(() => { /* autoplay block */ })
    }
  }
  function onLeave() {
    setHovering(false)
    const v = videoRef.current
    if (v) {
      v.pause()
      v.currentTime = 0
    }
  }

  return (
    <div
      className={cls}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <button
        className="project-card-thumb"
        onClick={onPreview}
        aria-label={`Preview ${item.title}`}
      >
        {item.thumbnail_path
          ? <AuthedImg src={galleryThumbnailUrl(item.id)} loading="lazy" />
          : <div className="project-card-thumb-empty" />}
        <video
          ref={videoRef}
          className="project-card-hover-video"
          src={hoverVideoSrc ?? undefined}
          muted
          loop
          playsInline
          preload="none"
          aria-hidden
        />
        <span className={`project-card-kind project-card-kind--${item.kind}`}>
          {KIND_LABEL[item.kind]}
        </span>
        {item.duration_s != null && (
          <span className="project-card-duration">{item.duration_s.toFixed(1)}s</span>
        )}
        {selected && (
          <span className="project-card-selmark">{selectionIndex + 1}</span>
        )}
        <button
          type="button"
          className={`project-card-fav ${favorite ? 'project-card-fav--on' : ''}`}
          onClick={e => { e.stopPropagation(); onToggleFavorite() }}
          aria-label={favorite ? 'Unfavorite' : 'Favorite'}
          aria-pressed={favorite}
          data-tip={favorite ? 'Unfavorite' : 'Favorite'}
          data-tip-place="below"
        >
          <IconStar filled={favorite} />
        </button>
      </button>

      <div className="project-card-meta">
        <div className="project-card-title" title={item.title}>{item.title}</div>
        <div className="project-card-date">{formatShortDate(item.created_at)}</div>
      </div>

      <div className="project-card-actions">
        <div className="project-card-actions-left">
          <button
            className={`project-card-btn project-card-btn--stitch ${selected ? 'project-card-btn--active' : ''}`}
            onClick={onToggleSelect}
            data-tip={selected ? 'Remove from stitch' : 'Add to stitch'}
          >
            <IconStitch />
            <span>{selected ? 'Stitching' : 'Stitch'}</span>
          </button>
          {showStyle && (
            <button
              type="button"
              className="project-card-btn project-card-btn--style"
              onClick={onStyleInStudio}
              data-tip="Send to studio for styling"
            >
              <IconSparkle />
              <span>Style</span>
            </button>
          )}
        </div>
        <div className="project-card-icon-group">
          {item.kind !== 'loop' && (
            <button
              type="button"
              className={`project-card-icon-btn ${looping ? 'project-card-icon-btn--busy' : ''}`}
              onClick={onCreateLoop}
              disabled={looping}
              aria-label="Create 6s loop"
              data-tip={looping ? 'Generating loop…' : 'Create 6s loop'}
            >
              <IconLoop />
            </button>
          )}
          <button
            type="button"
            className="project-card-icon-btn"
            aria-label="Download"
            data-tip="Download MP4"
            onClick={e => { e.stopPropagation(); onDownload() }}
          >
            <IconDownload />
          </button>
          <button
            type="button"
            className="project-card-icon-btn"
            onClick={onRename}
            aria-label="Rename"
            data-tip="Rename"
          >
            <IconPencil />
          </button>
          <button
            type="button"
            className="project-card-icon-btn project-card-icon-btn--danger"
            onClick={onDelete}
            aria-label="Delete"
            data-tip="Delete"
          >
            <IconTrash />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Pending placeholder card ───────────────────────────────────────────────

function PendingCard({
  render, mode, tick,
}: {
  render: PendingRender
  mode: 'grid' | 'list'
  tick: number
}) {
  // Recompute the client-side countdown each tick. Backend provides a hint
  // with each poll; we subtract elapsed time between polls so the number
  // ticks smoothly instead of jumping in 3-second steps.
  void tick
  const now = Date.now() / 1000
  const elapsed = Math.max(0, now - render.started_at)
  const liveRemaining = render.eta_seconds != null
    ? render.eta_seconds - elapsed
    : null

  const kindLabel = render.kind === 'loop' ? 'LOOPING' : 'STYLING'
  const phaseLabel = render.phase >= 4 ? 'Kling v2v' : 'Preparing…'

  return (
    <div className={`project-card project-card--${mode} project-card--pending`}>
      <div className="project-card-thumb project-card-thumb--pending">
        {render.thumbnail_path && render.source_id
          ? <AuthedImg src={galleryThumbnailUrl(render.source_id)} loading="lazy" />
          : <div className="project-card-thumb-empty" />}
        <div className="pending-shimmer" aria-hidden />
        <div className="pending-overlay">
          <div className="pending-spinner" aria-hidden />
          <div className="pending-label">{kindLabel}</div>
          <div className="pending-eta">
            {liveRemaining != null && liveRemaining > 0
              ? <>est. <strong>{formatRemaining(liveRemaining)}</strong> remaining</>
              : 'finishing up…'}
          </div>
        </div>
        <span className="project-card-kind project-card-kind--pending">QUEUED</span>
      </div>
      <div className="project-card-meta">
        <div className="project-card-title" title={render.title}>{render.title}</div>
        <div className="project-card-date">{phaseLabel}</div>
      </div>
      <div className="project-card-actions project-card-actions--pending">
        <span className="pending-foot">
          {render.model_tier ? render.model_tier.replace('_', ' ').toUpperCase() : 'RENDER'} · auto-save on
        </span>
      </div>
    </div>
  )
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function IconStar({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <path
        d="M8 1.6l1.95 4.1 4.5.5-3.35 3.1.96 4.45L8 11.55 3.94 13.75l.96-4.45L1.55 6.2l4.5-.5L8 1.6z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconPencil() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden>
      <path
        d="M2.5 13.5l.8-3 7.5-7.5a1.4 1.4 0 012 2l-7.5 7.5-3 .8z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M9.5 4l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function IconDownload() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden>
      <path
        d="M8 1.75v9M4.5 7.5L8 11l3.5-3.5M2.5 13.25h11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden>
      <path
        d="M3 4.5h10M6 4.5V3a1 1 0 011-1h2a1 1 0 011 1v1.5M4.5 4.5l.6 8.1a1 1 0 001 .9h3.8a1 1 0 001-.9l.6-8.1M6.8 7.5v4M9.2 7.5v4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

function IconStitch() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
      <rect x="1.25" y="4.5" width="5" height="7" rx="0.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9.75" y="4.5" width="5" height="7" rx="0.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6.5 8h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function IconSparkle() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
      <path
        d="M8 1.5 L9.3 6.7 L14.5 8 L9.3 9.3 L8 14.5 L6.7 9.3 L1.5 8 L6.7 6.7 Z"
        fill="currentColor"
      />
    </svg>
  )
}

function IconLoop() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
      <path
        d="M3 5.5 A4.5 4.5 0 0 1 12.5 5.5 M13 10.5 A4.5 4.5 0 0 1 3.5 10.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path d="M11 3.5 L12.5 5.5 L14 3.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 12.5 L3.5 10.5 L2 12.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── Stitcher drawer ────────────────────────────────────────────────────────

function StitchBar({
  items, title, onTitleChange, onMove, onRemove, onClear, onStitch, stitching,
  onBulkDelete, bulkDeleting,
}: {
  items: GalleryItem[]
  title: string
  onTitleChange: (v: string) => void
  onMove: (id: string, delta: -1 | 1) => void
  onRemove: (id: string) => void
  onClear: () => void
  onStitch: () => void
  stitching: boolean
  onBulkDelete: () => void
  bulkDeleting: boolean
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
          className="stitch-bar-delete"
          disabled={items.length < 1 || bulkDeleting || stitching}
          onClick={onBulkDelete}
        >
          {bulkDeleting ? 'Deleting…' : `Delete ${items.length}`}
        </button>
        <button
          className="stitch-bar-submit"
          disabled={items.length < 2 || stitching || bulkDeleting}
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
  const [pricingOpen, setPricingOpen] = useState(false)
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
            onUpgradeClick={() => setPricingOpen(true)}
          />
        </div>
      </div>
      <PricingModal open={pricingOpen} onClose={() => setPricingOpen(false)} />
    </div>
  )
}
