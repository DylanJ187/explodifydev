import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { ExplosionAxes, VariantName, FaceName } from '../api/client'
import { OrientationViewer } from './orientation/OrientationViewer'
import type { Orientation, Vec3, OrbitMode } from './orientation/createViewer'
import { EasingEditor } from './EasingEditor'

const THREE_D_FORMATS = ['glb', 'gltf', 'obj']

function fileExt(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

interface Props {
  file: File
  previewId?: string
  previewImages: Record<FaceName, string>
  explosionAxes: ExplosionAxes | null
  selectedAxis: VariantName
  onAxisChange: (axis: VariantName) => void
  explodeScalar: number
  onExplodeChange: (v: number) => void
  orbitRangeDeg: number
  onOrbitRangeChange: (v: number) => void
  orbitMode: OrbitMode
  onOrbitModeChange: (mode: OrbitMode) => void
  orbitEasingCurve: number[]
  onOrbitEasingChange: (v: number[]) => void
  onCameraDirectionChange?: (dir: Vec3) => void
  initialCameraDirection?: Vec3
  onGenerate?: () => void
}

export interface MeshViewerHandle {
  getCameraDirection: () => Vec3
}

function StaticPreview({ imageSrc, fileName }: { imageSrc: string; fileName: string }) {
  const ext = fileExt(fileName).toUpperCase()
  return (
    <>
      <div className="orient-face-badge">{ext} model</div>
      <img src={imageSrc} alt="Model preview" className="orient-preview-img" draggable={false} />
    </>
  )
}

export const MeshViewer = forwardRef<MeshViewerHandle, Props>(function MeshViewer({
  file,
  previewId,
  previewImages,
  explosionAxes,
  selectedAxis,
  onAxisChange,
  explodeScalar,
  onExplodeChange,
  orbitRangeDeg,
  onOrbitRangeChange,
  orbitMode,
  onOrbitModeChange,
  orbitEasingCurve,
  onOrbitEasingChange,
  onCameraDirectionChange,
  initialCameraDirection,
  onGenerate,
}, ref) {
  // viewerFile: the file actually loaded into the 3D viewer.
  // When previewId is set we fetch a backend-reoriented GLB (works for all formats).
  // Falls back to the original file if the fetch fails or previewId is absent.
  const [viewerFile, setViewerFile] = useState<File | null>(null)

  useEffect(() => {
    if (!previewId) {
      setViewerFile(file)
      return
    }
    setViewerFile(null)
    let cancelled = false
    fetch(`/preview/${previewId}/mesh.glb`)
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.blob()
      })
      .then(blob => {
        if (!cancelled) setViewerFile(new File([blob], `${previewId}.glb`, { type: 'model/gltf-binary' }))
      })
      .catch(() => {
        if (!cancelled) setViewerFile(file)
      })
    return () => { cancelled = true }
  }, [previewId, file])

  const ext = useMemo(() => fileExt(viewerFile?.name ?? file.name), [viewerFile, file.name])
  const is3D = viewerFile !== null && THREE_D_FORMATS.includes(ext)
  const [forceStatic] = useState(false)

  const dirRef = useRef<Vec3>([0.3, 0.3, 1.0])

  useImperativeHandle(ref, () => ({
    getCameraDirection: () => dirRef.current,
  }))

  // Stable callback reference — captured once by OrientationViewer's useEffect.
  // Reads through dirRef so it always reflects the latest direction on imperative reads.
  const onChangeCbRef = useRef<((o: Orientation) => void) | null>(null)
  onChangeCbRef.current = (o: Orientation) => {
    const dx = o.position[0] - o.target[0]
    const dy = o.position[1] - o.target[1]
    const dz = o.position[2] - o.target[2]
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1
    const dir: Vec3 = [dx / len, dy / len, dz / len]
    dirRef.current = dir
    onCameraDirectionChange?.(dir)
  }
  const stableOrientationCb = useRef<(o: Orientation) => void>((o) => {
    onChangeCbRef.current?.(o)
  })

  const axisLabel = (a: VariantName) => {
    if (a === 'x') return 'X Axis'
    if (a === 'y') return 'Y Axis'
    return 'Z Axis'
  }

  const show3D = is3D && !forceStatic

  // Progress percentage for slider fill styling
  const explodePct = ((explodeScalar - 0.5) / (4.0 - 0.5)) * 100
  const orbitPct = (orbitRangeDeg / 360) * 100

  return (
    <div className="mesh-viewer-panel animate-fade-in">
      <div className="mesh-viewer-canvas-wrap">
        {show3D && viewerFile ? (
          <OrientationViewer
            file={viewerFile}
            allAxes={explosionAxes}
            selectedAxis={selectedAxis}
            explodeScalar={explodeScalar}
            orbitRangeDeg={orbitRangeDeg}
            orbitMode={orbitMode}
            onOrientationChange={stableOrientationCb.current}
            initialCameraDirection={initialCameraDirection}
          />
        ) : (
          <StaticPreview imageSrc={previewImages['front']} fileName={file.name} />
        )}

        {/* Axis selector — top right */}
        {explosionAxes && (
          <div className="mesh-viewer-axis-overlay">
            <div className="mesh-viewer-axis-title">Explosion Axis</div>
            {(['x', 'y', 'z'] as VariantName[]).map((axis) => (
              <button
                key={axis}
                className={[
                  'mesh-axis-btn',
                  `mesh-axis-btn--${axis}`,
                  selectedAxis === axis ? 'mesh-axis-btn--active' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => onAxisChange(axis)}
              >
                <span className="mesh-axis-indicator" />
                <span className="mesh-axis-name">{axisLabel(axis)}</span>
              </button>
            ))}
          </div>
        )}

        {/* Generate button — bottom right */}
        {onGenerate && (
          <button className="viewer-action-btn" onClick={onGenerate}>
            Generate Explosion
            <span>→</span>
          </button>
        )}

        {/* Sliders — bottom left */}
        <div className="viewer-sliders">
          <div className="viewer-slider-row">
            <div className="viewer-slider-header">
              <span className="viewer-slider-label" style={{ color: '#f5a623' }}>Explosion Level</span>
              <span className="viewer-slider-value" style={{ color: '#f5a623' }}>{explodeScalar.toFixed(1)}×</span>
            </div>
            <input
              type="range"
              className="viewer-slider viewer-slider--explode"
              min={0.5} max={4.0} step={0.1}
              value={explodeScalar}
              style={{ '--pct': `${explodePct}%` } as React.CSSProperties}
              onChange={e => onExplodeChange(parseFloat(e.target.value))}
            />
          </div>

          <div className="viewer-slider-row">
            <div className="viewer-slider-header">
              <span className="viewer-slider-label" style={{ color: '#00d4ff' }}>Camera Orbit</span>
              <span className="viewer-slider-value" style={{ color: '#00d4ff' }}>{orbitRangeDeg}°</span>
            </div>
            <input
              type="range"
              className="viewer-slider viewer-slider--orbit"
              min={0} max={360} step={5}
              value={orbitRangeDeg}
              style={{ '--pct': `${orbitPct}%` } as React.CSSProperties}
              onChange={e => onOrbitRangeChange(parseInt(e.target.value))}
            />
            <div className="viewer-orbit-mode">
              <button
                className={`viewer-mode-btn${orbitMode === 'horizontal' ? ' viewer-mode-btn--active' : ''}`}
                onClick={() => onOrbitModeChange('horizontal')}
              >
                H
              </button>
              <button
                className={`viewer-mode-btn${orbitMode === 'vertical' ? ' viewer-mode-btn--active' : ''}`}
                onClick={() => onOrbitModeChange('vertical')}
              >
                V
              </button>
              <span className="viewer-mode-label">
                {orbitMode === 'horizontal' ? 'Horizontal' : 'Vertical'}
              </span>
            </div>
          </div>

          <div className="viewer-slider-row">
            <div className="viewer-slider-header">
              <span className="viewer-slider-label" style={{ color: '#00d4ff' }}>Orbit Easing</span>
            </div>
            <EasingEditor
              value={orbitEasingCurve}
              onChange={onOrbitEasingChange}
              disabled={false}
              compact
            />
          </div>
        </div>
      </div>
    </div>
  )
})
