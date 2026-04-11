// frontend/src/components/OrientationPicker.tsx
import type { FaceName } from '../api/client'

interface Props {
  selectedFace: FaceName
  onFaceChange: (face: FaceName) => void
  disabled?: boolean
}

const FACE_LABELS: Record<FaceName, string> = {
  front:  'Front',
  back:   'Back',
  left:   'Left',
  right:  'Right',
  top:    'Top',
  bottom: 'Bottom',
}

const GRID_AREAS: Record<FaceName, string> = {
  top:    'top',
  left:   'left',
  front:  'front',
  right:  'right',
  back:   'back',
  bottom: 'bottom',
}

export function OrientationPicker({ selectedFace, onFaceChange, disabled }: Props) {
  return (
    <div>
      <div className="cube-net">
        {(Object.keys(GRID_AREAS) as FaceName[]).map((face) => (
          <button
            key={face}
            onClick={() => onFaceChange(face)}
            disabled={disabled}
            style={{ gridArea: GRID_AREAS[face] }}
            className={[
              'cube-face-btn',
              selectedFace === face ? 'cube-face-btn--selected' : '',
            ].join(' ')}
          >
            {FACE_LABELS[face]}
          </button>
        ))}
      </div>
      <p className="orient-selected-info">
        Front face: <strong>{FACE_LABELS[selectedFace]}</strong>
      </p>
    </div>
  )
}
