import { useEffect, useRef, useState } from 'react'
import { createViewer } from './createViewer'
import type { Orientation, ViewerHandle, ViewerOptions, Vec3, AxisVariant, OrbitMode, OrbitDirection } from './createViewer'
import './orientation.css'

interface Props {
  file: File
  allAxes: Record<AxisVariant, Vec3> | null
  selectedAxis: AxisVariant
  explodeScalar: number
  orbitRangeDeg: number
  orbitMode?: OrbitMode
  orbitDirection?: OrbitDirection
  onOrientationChange?: (o: Orientation) => void
  initialCameraDirection?: Vec3
}

function fileExt(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

export function OrientationViewer({
  file,
  allAxes,
  selectedAxis,
  explodeScalar,
  orbitRangeDeg,
  orbitMode,
  orbitDirection,
  onOrientationChange,
  initialCameraDirection,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<ViewerHandle | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!canvas || !stage) return

    let cancelled = false
    setError(null)

    const viewerOpts: ViewerOptions = initialCameraDirection ? { initialCameraDirection } : {}
    const viewer = createViewer(canvas, stage, viewerOpts)
    viewerRef.current = viewer

    const offChange = onOrientationChange
      ? viewer.onChange(onOrientationChange)
      : null

    const url = URL.createObjectURL(file)
    const ext = fileExt(file.name)

    viewer
      .loadModel(url, ext)
      .then(() => {
        if (cancelled) return
        viewer.setAxes(allAxes, selectedAxis)
        viewer.setExplodeScalar(explodeScalar)
        viewer.setOrbitRange(orbitRangeDeg)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
      })

    return () => {
      cancelled = true
      offChange?.()
      viewer.dispose()
      URL.revokeObjectURL(url)
      viewerRef.current = null
    }
  }, [file])

  useEffect(() => {
    viewerRef.current?.setAxes(allAxes, selectedAxis)
  }, [allAxes, selectedAxis])

  useEffect(() => {
    viewerRef.current?.setExplodeScalar(explodeScalar)
  }, [explodeScalar])

  useEffect(() => {
    viewerRef.current?.setOrbitRange(orbitRangeDeg)
  }, [orbitRangeDeg])

  useEffect(() => {
    if (orbitMode) viewerRef.current?.setOrbitMode(orbitMode)
  }, [orbitMode])

  useEffect(() => {
    if (orbitDirection !== undefined) viewerRef.current?.setOrbitDirection(orbitDirection)
  }, [orbitDirection])

  return (
    <div className="ov-root">
      <div ref={stageRef} className="ov-stage">
        <canvas ref={canvasRef} className="ov-canvas" />
      </div>

      <div className="ov-hint">Drag to orbit &nbsp;·&nbsp; Scroll to zoom</div>

      {error && (
        <div className="ov-error">
          <div>3D viewer failed: {error}</div>
        </div>
      )}
    </div>
  )
}
