// frontend/src/components/StylePanel.tsx
import { useState, useEffect, useRef } from 'react'
import type { StyleOptions } from '../App'

const MAX_MATERIAL_CHARS = 400
const MAX_STYLE_CHARS = 400
const MAX_PER_COMPONENT_CHARS = 120

interface Props {
  options: StyleOptions
  onOptionsChange: (opts: StyleOptions) => void
  explodeScalar: number
  onExplodeChange: (v: number) => void
  orbitRangeDeg: number
  onOrbitRangeChange: (v: number) => void
  componentNames?: string[]
  disabled?: boolean
}

const CHECKBOX_ITEMS: Array<{ key: keyof Omit<StyleOptions, 'prompt' | 'componentMaterials'>; label: string }> = [
  { key: 'studioLighting', label: 'Studio lighting' },
  { key: 'darkBackdrop',   label: 'Dark backdrop' },
  { key: 'whiteBackdrop',  label: 'White backdrop' },
  { key: 'warmTone',       label: 'Warm tone' },
  { key: 'coldTone',       label: 'Cold tone' },
  { key: 'groundShadow',   label: 'Ground shadow' },
]

export function StylePanel({
  options,
  onOptionsChange,
  explodeScalar,
  onExplodeChange,
  orbitRangeDeg,
  onOrbitRangeChange,
  componentNames = [],
  disabled,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false)

  function toggleOption(key: keyof Omit<StyleOptions, 'prompt' | 'componentMaterials'>) {
    onOptionsChange({ ...options, [key]: !options[key] })
  }

  function setComponentMaterial(name: string, value: string) {
    onOptionsChange({
      ...options,
      componentMaterials: { ...options.componentMaterials, [name]: value },
    })
  }

  function clearAllMaterials() {
    onOptionsChange({ ...options, componentMaterials: {} })
  }

  const overrideCount = componentNames.filter(
    n => (options.componentMaterials[n] ?? '').trim().length > 0
  ).length

  return (
    <div className="style-panel">

      <div className="checkbox-grid">
        {CHECKBOX_ITEMS.map(({ key, label }) => {
          const checked = options[key] as boolean
          return (
            <div
              key={key}
              className={[
                'checkbox-option',
                checked ? 'checkbox-option--checked' : '',
                disabled ? 'checkbox-option--disabled' : '',
              ].join(' ')}
              onClick={() => !disabled && toggleOption(key)}
            >
              <div className={['checkbox-box', checked ? 'checkbox-box--checked' : ''].join(' ')}>
                {checked && <span className="checkbox-check-mark">✓</span>}
              </div>
              <span className="checkbox-label">{label}</span>
            </div>
          )
        })}
      </div>

      {/* Materials with customise trigger */}
      <div className="prompt-section">
        <div className="materials-label-row">
          <span className="prompt-section-label">Materials</span>
          {componentNames.length > 0 && (
            <button
              className="customise-btn"
              onClick={() => !disabled && setModalOpen(true)}
              disabled={disabled}
              type="button"
            >
              {overrideCount > 0 && (
                <span className="customise-badge">{overrideCount}</span>
              )}
              Customise
              <span className="customise-arrow">↗</span>
            </button>
          )}
        </div>
        <textarea
          className="style-prompt"
          rows={2}
          maxLength={MAX_MATERIAL_CHARS}
          placeholder="e.g. brushed aluminium body, matte black cap, frosted glass lens..."
          value={options.materialPrompt}
          onChange={(e) => onOptionsChange({ ...options, materialPrompt: e.target.value })}
          disabled={disabled}
        />
        <span className="char-counter">{options.materialPrompt.length}/{MAX_MATERIAL_CHARS}</span>
      </div>

      {/* Style prompt */}
      <div className="prompt-section">
        <span className="prompt-section-label">Style notes</span>
        <textarea
          className="style-prompt"
          rows={2}
          maxLength={MAX_STYLE_CHARS}
          placeholder="Additional style notes... (mood, lighting, colour)"
          value={options.prompt}
          onChange={(e) => onOptionsChange({ ...options, prompt: e.target.value })}
          disabled={disabled}
        />
        <span className="char-counter">{options.prompt.length}/{MAX_STYLE_CHARS}</span>
      </div>

      {/* Explosion level slider */}
      <div className="slider-row">
        <div className="slider-header">
          <span className="slider-label">Explosion Level</span>
        </div>
        <div className="slider-value-row">
          <input
            type="range"
            min={0.5}
            max={4.0}
            step={0.1}
            value={explodeScalar}
            onChange={(e) => onExplodeChange(parseFloat(e.target.value))}
            disabled={disabled}
          />
          <span className="slider-value">{explodeScalar.toFixed(1)}×</span>
          <InfoIcon text="Auto-zoom adjusts camera distance to keep all components in frame at any scalar value." />
        </div>
      </div>

      {/* Camera orbit range slider */}
      <div className="slider-row">
        <div className="slider-header">
          <span className="slider-label">Camera Orbit</span>
        </div>
        <div className="slider-value-row">
          <input
            type="range"
            min={0}
            max={60}
            step={5}
            value={orbitRangeDeg}
            onChange={(e) => onOrbitRangeChange(parseInt(e.target.value))}
            disabled={disabled}
          />
          <span className="slider-value">{orbitRangeDeg}°</span>
          <InfoIcon text="Total orbit from frame 1 to frame 5. Capped at 60° for Kling interpolation safety." />
        </div>
      </div>

      {/* Per-component material modal */}
      {modalOpen && (
        <MaterialModal
          componentNames={componentNames}
          componentMaterials={options.componentMaterials}
          onSet={setComponentMaterial}
          onClear={clearAllMaterials}
          onClose={() => setModalOpen(false)}
        />
      )}

    </div>
  )
}


interface ModalProps {
  componentNames: string[]
  componentMaterials: Record<string, string>
  onSet: (name: string, value: string) => void
  onClear: () => void
  onClose: () => void
}

function MaterialModal({ componentNames, componentMaterials, onSet, onClear, onClose }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const filledCount = componentNames.filter(n => (componentMaterials[n] ?? '').trim()).length

  return (
    <div
      className="mat-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="mat-modal">

        <div className="mat-modal-header">
          <div className="mat-modal-title-block">
            <span className="mat-modal-title">Material<br />Overrides</span>
            <span className="mat-modal-meta">
              {componentNames.length} SURFACES
              {filledCount > 0 && (
                <span className="mat-modal-meta-count"> · {filledCount} SET</span>
              )}
            </span>
          </div>
          <button className="mat-close-btn" onClick={onClose} type="button">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1.5" />
              <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>

        <div className="mat-modal-divider" />

        <div className="mat-table">
          <div className="mat-table-head">
            <span className="mat-col-name">Component</span>
            <span className="mat-col-material">Material</span>
          </div>
          <div className="mat-table-body">
            {componentNames.map((name, idx) => {
              const val = componentMaterials[name] ?? ''
              const filled = val.trim().length > 0
              return (
                <div
                  key={name}
                  className={['mat-row', filled ? 'mat-row--filled' : ''].filter(Boolean).join(' ')}
                >
                  <span className="mat-row-index">{String(idx + 1).padStart(2, '0')}</span>
                  <span className="mat-row-name">{name}</span>
                  <input
                    className="mat-row-input"
                    type="text"
                    maxLength={MAX_PER_COMPONENT_CHARS}
                    placeholder="e.g. brushed steel"
                    value={val}
                    onChange={(e) => onSet(name, e.target.value)}
                    spellCheck={false}
                  />
                </div>
              )
            })}
          </div>
        </div>

        <div className="mat-modal-divider" />

        <div className="mat-modal-footer">
          <button
            className="mat-clear-btn"
            onClick={onClear}
            type="button"
            disabled={filledCount === 0}
          >
            Clear all
          </button>
          <button className="mat-apply-btn" onClick={onClose} type="button">
            Apply
            <span className="mat-apply-arrow">→</span>
          </button>
        </div>

      </div>
    </div>
  )
}


function InfoIcon({ text }: { text: string }) {
  return (
    <span className="info-icon">
      i
      <span className="info-tooltip">{text}</span>
    </span>
  )
}
