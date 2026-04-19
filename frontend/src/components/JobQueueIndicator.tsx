// frontend/src/components/JobQueueIndicator.tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { useJobQueue } from '../contexts/JobQueueContext'
import type { QueueEntry } from '../contexts/JobQueueContext'

const PHASE_LABEL: Record<QueueEntry['phase'], string> = {
  rendering: 'Rendering',
  styling:   'Styling',
  awaiting:  'Review',
  done:      'Done',
  error:     'Error',
}

type Corner = 'tl' | 'tr' | 'bl' | 'br'

const CORNER_STORAGE_KEY = 'explodify.queueIndicator.corner'
const EDGE_MARGIN = 20
const DRAG_THRESHOLD_PX = 4

function loadCorner(): Corner {
  try {
    const v = localStorage.getItem(CORNER_STORAGE_KEY)
    if (v === 'tl' || v === 'tr' || v === 'bl' || v === 'br') return v
  } catch { /* ignore */ }
  return 'br'
}

function saveCorner(c: Corner) {
  try { localStorage.setItem(CORNER_STORAGE_KEY, c) } catch { /* ignore */ }
}

function nearestCorner(centerX: number, centerY: number): Corner {
  const w = window.innerWidth
  const h = window.innerHeight
  const left = centerX < w / 2
  const top = centerY < h / 2
  if (top && left) return 'tl'
  if (top && !left) return 'tr'
  if (!top && left) return 'bl'
  return 'br'
}

export function JobQueueIndicator() {
  const { entries, activeCount, remove, clearCompleted } = useJobQueue()
  const [open, setOpen] = useState(false)
  const [corner, setCorner] = useState<Corner>(() => loadCorner())
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    offsetX: number
    offsetY: number
    moved: boolean
  } | null>(null)

  useEffect(() => { saveCorner(corner) }, [corner])

  const onPillPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    dragStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      moved: false,
    }
    ;(e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId)
  }, [])

  const onPillPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const st = dragStateRef.current
    if (!st || st.pointerId !== e.pointerId) return
    const dx = e.clientX - st.startX
    const dy = e.clientY - st.startY
    if (!st.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
    st.moved = true
    if (!dragging) setDragging(true)
    setDragPos({ x: e.clientX - st.offsetX, y: e.clientY - st.offsetY })
  }, [dragging])

  const onPillPointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const st = dragStateRef.current
    if (!st || st.pointerId !== e.pointerId) return
    const wasDrag = st.moved
    dragStateRef.current = null
    try { (e.currentTarget as HTMLButtonElement).releasePointerCapture(e.pointerId) } catch { /* ignore */ }

    if (wasDrag) {
      const el = containerRef.current
      if (el) {
        const rect = el.getBoundingClientRect()
        const next = nearestCorner(rect.left + rect.width / 2, rect.top + rect.height / 2)
        setCorner(next)
      }
      setDragging(false)
      setDragPos(null)
    } else {
      setOpen(v => !v)
    }
  }, [])

  if (entries.length === 0) return null

  const completedCount = entries.filter(e => e.phase === 'done' || e.phase === 'error').length
  const headline = activeCount > 0
    ? `${activeCount} running`
    : `${completedCount} done`

  const topCorner = corner === 'tl' || corner === 'tr'
  const leftCorner = corner === 'tl' || corner === 'bl'

  const anchorStyle: React.CSSProperties = dragPos
    ? { top: dragPos.y, left: dragPos.x, right: 'auto', bottom: 'auto' }
    : {
        top:    topCorner  ? EDGE_MARGIN : 'auto',
        bottom: !topCorner ? EDGE_MARGIN : 'auto',
        left:   leftCorner ? EDGE_MARGIN : 'auto',
        right:  !leftCorner ? EDGE_MARGIN : 'auto',
      }

  return (
    <div
      ref={containerRef}
      className={`queue-indicator queue-indicator--${corner} ${dragging ? 'queue-indicator--dragging' : ''}`}
      style={anchorStyle}
      data-panel-up={!topCorner ? 'true' : 'false'}
      data-align={leftCorner ? 'left' : 'right'}
    >
      {open && !topCorner && (
        <QueuePanel
          entries={entries}
          completedCount={completedCount}
          onRemove={remove}
          onClearCompleted={clearCompleted}
        />
      )}

      <button
        className={`queue-pill ${activeCount > 0 ? 'queue-pill--active' : 'queue-pill--idle'} ${dragging ? 'queue-pill--dragging' : ''}`}
        onPointerDown={onPillPointerDown}
        onPointerMove={onPillPointerMove}
        onPointerUp={onPillPointerUp}
        onPointerCancel={onPillPointerUp}
        aria-expanded={open}
        aria-label="Render queue — drag to reposition"
        type="button"
      >
        {activeCount > 0 && <span className="queue-pill-dot" />}
        <span className="queue-pill-grip" aria-hidden>⋮⋮</span>
        <span className="queue-pill-label">{headline}</span>
        <span className="queue-pill-caret">{open ? '▾' : '▴'}</span>
      </button>

      {open && topCorner && (
        <QueuePanel
          entries={entries}
          completedCount={completedCount}
          onRemove={remove}
          onClearCompleted={clearCompleted}
        />
      )}
    </div>
  )
}

function QueuePanel({
  entries, completedCount, onRemove, onClearCompleted,
}: {
  entries: QueueEntry[]
  completedCount: number
  onRemove: (id: string) => void
  onClearCompleted: () => void
}) {
  return (
    <div className="queue-panel">
      <div className="queue-panel-header">
        <span className="queue-panel-title">Render Queue</span>
        {completedCount > 0 && (
          <button className="queue-panel-clear" onClick={onClearCompleted}>
            Clear done
          </button>
        )}
      </div>
      <div className="queue-panel-list">
        {entries.map(entry => (
          <QueueRow
            key={entry.jobId}
            entry={entry}
            onRemove={() => onRemove(entry.jobId)}
          />
        ))}
      </div>
    </div>
  )
}

function QueueRow({ entry, onRemove }: { entry: QueueEntry; onRemove: () => void }) {
  const phase = entry.status?.current_phase ?? 1
  const showProgress = entry.phase === 'rendering' || entry.phase === 'styling'
  const pct = showProgress ? Math.min(100, Math.round((phase / 4) * 100)) : 100
  const isDone = entry.phase === 'done'
  const isError = entry.phase === 'error'

  return (
    <div className={`queue-row queue-row--${entry.phase}`}>
      <div className="queue-row-main">
        <div className="queue-row-label">{entry.label}</div>
        <div className="queue-row-phase">
          {PHASE_LABEL[entry.phase]}
          {entry.status?.current_phase_name && showProgress && (
            <> · {entry.status.current_phase_name}</>
          )}
        </div>
      </div>
      <div className="queue-row-side">
        {(isDone || isError) && (
          <button className="queue-row-remove" onClick={onRemove} aria-label="Remove">
            ×
          </button>
        )}
        {showProgress && (
          <div className="queue-row-progress">
            <div className="queue-row-progress-bar" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </div>
  )
}
