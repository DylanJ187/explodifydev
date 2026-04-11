// frontend/src/components/StylePanel.tsx
import type { StyleOptions } from '../App'

interface Props {
  options: StyleOptions
  onOptionsChange: (opts: StyleOptions) => void
  explodeScalar: number
  onExplodeChange: (v: number) => void
  rotationDeg: number
  onRotationChange: (v: number) => void
  disabled?: boolean
}

const CHECKBOX_ITEMS: Array<{ key: keyof Omit<StyleOptions, 'prompt'>; label: string }> = [
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
  rotationDeg,
  onRotationChange,
  disabled,
}: Props) {
  function toggleOption(key: keyof Omit<StyleOptions, 'prompt'>) {
    onOptionsChange({ ...options, [key]: !options[key] })
  }

  return (
    <div className="style-panel">

      {/* Style checkboxes */}
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

      {/* Style prompt */}
      <textarea
        className="style-prompt"
        rows={2}
        placeholder="Additional style notes... (materials, mood, lighting)"
        value={options.prompt}
        onChange={(e) => onOptionsChange({ ...options, prompt: e.target.value })}
        disabled={disabled}
      />

      {/* Explosion slider */}
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
          <InfoIcon text="Capped at 4× for fal.ai — higher values cause components to exit the visible frame during Kling video interpolation, producing broken animation." />
        </div>
      </div>

      {/* Rotation slider */}
      <div className="slider-row">
        <div className="slider-header">
          <span className="slider-label">View Rotation</span>
        </div>
        <div className="slider-value-row">
          <input
            type="range"
            min={0}
            max={90}
            step={5}
            value={rotationDeg}
            onChange={(e) => onRotationChange(parseInt(e.target.value))}
            disabled={disabled}
          />
          <span className="slider-value">{rotationDeg}°</span>
          <InfoIcon text="Capped at 90° for fal.ai — larger in-plane rotations create geometric discontinuities between reference frames that Kling cannot cleanly interpolate." />
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
