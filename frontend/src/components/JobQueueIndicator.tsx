// frontend/src/components/JobQueueIndicator.tsx
import { useState } from 'react'
import { useJobQueue } from '../contexts/JobQueueContext'
import type { QueueEntry } from '../contexts/JobQueueContext'

const PHASE_LABEL: Record<QueueEntry['phase'], string> = {
  rendering: 'Rendering',
  styling:   'Styling',
  awaiting:  'Review',
  done:      'Done',
  error:     'Error',
}

export function JobQueueIndicator() {
  const { entries, activeCount, remove, clearCompleted } = useJobQueue()
  const [open, setOpen] = useState(false)

  if (entries.length === 0) return null

  const completedCount = entries.filter(e => e.phase === 'done' || e.phase === 'error').length
  const headline = activeCount > 0
    ? `${activeCount} running`
    : `${completedCount} done`

  return (
    <div className="queue-indicator">
      <button
        className={`queue-pill ${activeCount > 0 ? 'queue-pill--active' : 'queue-pill--idle'}`}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        {activeCount > 0 && <span className="queue-pill-dot" />}
        <span className="queue-pill-label">{headline}</span>
        <span className="queue-pill-caret">{open ? '▾' : '▴'}</span>
      </button>

      {open && (
        <div className="queue-panel">
          <div className="queue-panel-header">
            <span className="queue-panel-title">Render Queue</span>
            {completedCount > 0 && (
              <button className="queue-panel-clear" onClick={clearCompleted}>
                Clear done
              </button>
            )}
          </div>
          <div className="queue-panel-list">
            {entries.map(entry => (
              <QueueRow
                key={entry.jobId}
                entry={entry}
                onRemove={() => remove(entry.jobId)}
              />
            ))}
          </div>
        </div>
      )}
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
