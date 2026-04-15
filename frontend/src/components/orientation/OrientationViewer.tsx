import { useEffect, useRef, useState } from 'react'
import { createViewer } from './createViewer'
import type { Orientation, ViewerHandle, ViewerOptions, Vec3 } from './createViewer'
import './orientation.css'

interface Props {
  file: File
  axisDirection: Vec3 | null
  explodeScalar: number
  orbitRangeDeg: number
  onOrientationChange?: (o: Orientation) => void
  initialCameraDirection?: Vec3
}

function fileExt(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

export function OrientationViewer({
  file,
  axisDirection,
  explodeScalar,
  orbitRangeDeg,
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
        if (axisDirection) viewer.setAxis(axisDirection)
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
    viewerRef.current?.setAxis(axisDirection ?? null)
  }, [axisDirection])

  useEffect(() => {
    viewerRef.current?.setExplodeScalar(explodeScalar)
  }, [explodeScalar])

  useEffect(() => {
    viewerRef.current?.setOrbitRange(orbitRangeDeg)
  }, [orbitRangeDeg])

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
