// frontend/src/components/BackdropPicker.tsx
//
// Backdrop colour for the pyrender base video. Kling v2v preserves source
// pixels, so whatever we pick here is what survives the style pass.

// Pantone 354 C — the chroma-key green used in professional production.
const GREENSCREEN_HEX = '#00B140'

interface Props {
  value: string
  onChange: (hex: string) => void
  disabled?: boolean
}

export function BackdropPicker({ value, onChange, disabled }: Props) {
  const greenscreenActive = value.toLowerCase() === GREENSCREEN_HEX.toLowerCase()

  return (
    <div className={['backdrop-picker', disabled ? 'backdrop-picker--disabled' : ''].filter(Boolean).join(' ')}>
      <label
        className="backdrop-picker-swatch"
        style={{ background: value }}
        title="Click to pick backdrop colour"
      >
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          aria-label="Backdrop colour"
        />
        <span className="backdrop-picker-hex">{value.toUpperCase()}</span>
      </label>
      <div className="backdrop-greenscreen-row">
        <span className="backdrop-greenscreen-label">Greenscreen</span>
        <button
          type="button"
          role="switch"
          aria-checked={greenscreenActive}
          aria-label="Greenscreen backdrop"
          disabled={disabled}
          className={`settings-switch settings-switch--sm ${greenscreenActive ? 'is-on' : ''}`}
          onClick={() => {
            if (disabled) return
            onChange(greenscreenActive ? '#000000' : GREENSCREEN_HEX)
          }}
        >
          <span className="settings-switch-thumb" />
        </button>
      </div>
    </div>
  )
}
