import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { ExplosionAxes, VariantName, FaceName } from '../api/client'
import { OrientationViewer } from './orientation/OrientationViewer'
import type { Orientation, Vec3, OrbitMode, OrbitDirection } from './orientation/createViewer'
import { PreviewFrame } from './PreviewFrame'

const THREE_D_FORMATS = ['glb', 'gltf', 'obj']

function fileExt(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

interface Props {
  file: File | null
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
  orbitDirection: OrbitDirection
  onOrbitDirectionChange: (dir: OrbitDirection) => void
  cameraDirection?: Vec3
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
  orbitDirection,
  onOrbitDirectionChange,
  cameraDirection,
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

  const ext = useMemo(() => fileExt(viewerFile?.name ?? file?.name ?? ''), [viewerFile, file])
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
            orbitDirection={orbitDirection}
            onOrientationChange={stableOrientationCb.current}
            initialCameraDirection={initialCameraDirection}
          />
        ) : (viewerFile ?? file) ? (
          <StaticPreview
            imageSrc={previewImages['front']}
            fileName={(viewerFile ?? file)!.name}
          />
        ) : previewImages['front'] ? (
          <StaticPreview imageSrc={previewImages['front']} fileName="model" />
        ) : (
          <div className="mesh-viewer-loading" />
        )}

        {/* Preview frame — top right (moved from bottom-left) */}
        {previewId && cameraDirection && (
          <div className="viewer-top-right">
            <PreviewFrame previewId={previewId} cameraDirection={cameraDirection} />
          </div>
        )}

        {/* Generate button — bottom right */}
        {onGenerate && (
          <button className="viewer-action-btn" onClick={onGenerate}>
            Generate Explosion
            <span>→</span>
          </button>
        )}

        {/* Bottom-left overlay: sliders with inline axis controls */}
        <div className="viewer-bottom-left">
        <div className="viewer-sliders">
          <div className="viewer-slider-row">
            <div className="viewer-slider-header">
              <span className="viewer-slider-label" style={{ color: '#f5a623' }}>Explosion Level</span>
              <div className="viewer-explode-controls">
                <span className="viewer-slider-value" style={{ color: '#f5a623' }}>{explodeScalar.toFixed(1)}×</span>
                {explosionAxes && (
                  <div className="viewer-axis-mini-group" role="radiogroup" aria-label="Explosion axis">
                    {(['x', 'y', 'z'] as VariantName[]).map((axis) => (
                      <button
                        key={axis}
                        type="button"
                        role="radio"
                        aria-checked={selectedAxis === axis}
                        className={[
                          'viewer-axis-mini-btn',
                          selectedAxis === axis ? 'viewer-axis-mini-btn--active' : '',
                        ].filter(Boolean).join(' ')}
                        onClick={() => onAxisChange(axis)}
                        title={`Explosion axis: ${axis.toUpperCase()}`}
                      >
                        {axis.toUpperCase()}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
              <div className="viewer-orbit-controls">
                <span className="viewer-slider-value" style={{ color: '#00d4ff' }}>{orbitRangeDeg}°</span>
                <div className="viewer-axis-mini-group" role="group" aria-label="Orbit controls">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={orbitMode === 'horizontal'}
                    className={[
                      'viewer-axis-mini-btn',
                      orbitMode === 'horizontal' ? 'viewer-axis-mini-btn--active-orbit' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => onOrbitModeChange('horizontal')}
                    title="Horizontal orbit (turntable)"
                  >
                    X
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={orbitMode === 'vertical'}
                    className={[
                      'viewer-axis-mini-btn',
                      orbitMode === 'vertical' ? 'viewer-axis-mini-btn--active-orbit' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => onOrbitModeChange('vertical')}
                    title="Vertical orbit (crane)"
                  >
                    Y
                  </button>
                  <button
                    type="button"
                    className="viewer-axis-mini-btn viewer-axis-mini-btn--swap"
                    onClick={() => onOrbitDirectionChange(orbitDirection === 1 ? -1 : 1)}
                    title="Reverse orbit direction"
                    aria-label="Reverse orbit direction"
                  >
                    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path d="M10 4H4M4 4L6.5 2M4 4L6.5 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M4 10H10M10 10L7.5 8M10 10L7.5 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            <input
              type="range"
              className="viewer-slider viewer-slider--orbit"
              min={0} max={360} step={5}
              value={orbitRangeDeg}
              style={{ '--pct': `${orbitPct}%` } as React.CSSProperties}
              onChange={e => onOrbitRangeChange(parseInt(e.target.value))}
            />
          </div>
        </div>
        </div>{/* /viewer-bottom-left */}
      </div>
    </div>
  )
})
