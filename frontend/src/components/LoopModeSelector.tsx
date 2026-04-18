// frontend/src/components/LoopModeSelector.tsx
import type { LoopMode } from '../api/client'

interface Props {
  value: LoopMode
  onChange: (next: LoopMode) => void
  disabled?: boolean
}

interface Option {
  value: LoopMode
  label: string
  meta: string
}

const OPTIONS: Option[] = [
  { value: 'standard',     label: 'Standard',   meta: '3s · one-shot' },
  { value: 'loop-preview', label: '6s Loop',    meta: 'reverse + concat · seamless' },
]

const LOOP_INFO = 'Loop mode assembles the forward render with its time-reversed copy — zero extra credits, runs once per job.'

export function LoopModeSelector({ value, onChange, disabled }: Props) {
  return (
    <div className="loop-mode">
      <div className="loop-mode-header">
        <span className="info-icon" tabIndex={0} aria-label={LOOP_INFO}>
          i
          <span className="info-tooltip" role="tooltip">{LOOP_INFO}</span>
        </span>
      </div>
      <div className="loop-mode-options">
        {OPTIONS.map(opt => {
          const selected = opt.value === value
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              className={`loop-mode-opt ${selected ? 'loop-mode-opt--active' : ''}`}
              onClick={() => onChange(opt.value)}
              aria-pressed={selected}
            >
              <span className="loop-mode-opt-radio" aria-hidden>
                <span className="loop-mode-opt-radio-dot" />
              </span>
              <span className="loop-mode-opt-text">
                <span className="loop-mode-opt-label">{opt.label}</span>
                <span className="loop-mode-opt-meta">{opt.meta}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
