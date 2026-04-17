import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  AmbientLight,
  DirectionalLight,
  Box3,
  Vector3,
  Quaternion,
  Matrix4,
  Group,
  Mesh,
  MeshStandardMaterial,
  MeshBasicMaterial,
  ConeGeometry,
  BufferGeometry,
  LineBasicMaterial,
  Line,
  Float32BufferAttribute,
  Object3D,
} from 'three'
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { ViewCubeGizmo, ObjectPosition } from '@mlightcad/three-viewcube'

export type Vec3 = [number, number, number]
export type Vec4 = [number, number, number, number]

export interface Orientation {
  quaternion: Vec4
  position: Vec3
  target: Vec3
}

export interface DebugState {
  rect: { width: number; height: number }
  pointerDowns: number
  lastHit: string
  pixelRatio: number
}

export type AxisVariant = 'x' | 'y' | 'z'
export type OrbitMode = 'horizontal' | 'vertical'
export type OrbitDirection = 1 | -1

export interface ViewerHandle {
  loadModel(url: string, ext: string): Promise<void>
  setAxes(axes: Record<AxisVariant, Vec3> | null, selected: AxisVariant): void
  setExplodeScalar(v: number): void
  setOrbitRange(deg: number): void
  setOrbitMode(mode: OrbitMode): void
  setOrbitDirection(dir: OrbitDirection): void
  getOrientation(): Orientation
  onChange(cb: (o: Orientation) => void): () => void
  getDebug(): DebugState
  dispose(): void
}

export interface ViewerOptions {
  initialCameraDirection?: Vec3
}

const MODEL_MATERIAL = () =>
  new MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.05 })

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
}

interface SnapAnim {
  startPos: Vector3
  endPos: Vector3
  startQuat: Quaternion
  endQuat: Quaternion
  endUp: Vector3
  progress: number
}

function nearestRollQuaternion(
  faceQuat: Quaternion,
  currentUp: Vector3,
): { quat: Quaternion; up: Vector3 } {
  const faceDir = new Vector3(0, 0, 1).applyQuaternion(faceQuat)
  const canonicalUp = new Vector3(0, 1, 0).applyQuaternion(faceQuat)
  const canonicalRight = new Vector3(1, 0, 0).applyQuaternion(faceQuat)

  const proj = currentUp.clone().addScaledVector(faceDir, -currentUp.dot(faceDir))
  if (proj.lengthSq() < 1e-8) proj.copy(canonicalUp)
  proj.normalize()

  const candidates: Vector3[] = [
    canonicalUp,
    canonicalRight,
    canonicalUp.clone().negate(),
    canonicalRight.clone().negate(),
  ]

  let bestUp = candidates[0]
  let bestDot = -Infinity
  for (const c of candidates) {
    const d = proj.dot(c)
    if (d > bestDot) { bestDot = d; bestUp = c }
  }

  const m = new Matrix4().lookAt(faceDir, new Vector3(0, 0, 0), bestUp)
  return { quat: new Quaternion().setFromRotationMatrix(m), up: bestUp.clone() }
}

// Number of segments in the pre-allocated orbit arc buffer
const ORBIT_ARC_N = 64

export function createViewer(
  canvas: HTMLCanvasElement,
  stage: HTMLElement,
  opts?: ViewerOptions,
): ViewerHandle {
  const scene = new Scene()

  const camera = new PerspectiveCamera(45, 1, 0.01, 10000)
  camera.position.set(3, 2, 5)

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x080808, 1)

  const controls = new TrackballControls(camera, canvas)
  controls.rotateSpeed = 3.0
  controls.zoomSpeed = 1.2
  controls.noPan = true
  controls.staticMoving = false
  controls.dynamicDampingFactor = 0.15
  controls.minDistance = 0.001
  controls.maxDistance = 100000

  const viewCube = new ViewCubeGizmo(camera, renderer, {
    pos: ObjectPosition.LEFT_TOP,
    dimension: 128,
  })

  let snapAnim: SnapAnim | null = null

  viewCube.addEventListener('change', (e) => {
    const faceQuat: Quaternion = (e as unknown as { quaternion: Quaternion }).quaternion
    const { quat: endQuat, up: endUp } = nearestRollQuaternion(faceQuat, camera.up)
    const dist = camera.position.distanceTo(controls.target)
    const direction = new Vector3(0, 0, 1).applyQuaternion(endQuat)
    const endPos = controls.target.clone().addScaledVector(direction, dist)

    snapAnim = {
      startPos: camera.position.clone(),
      endPos,
      startQuat: camera.quaternion.clone(),
      endQuat,
      endUp,
      progress: 0,
    }
    controls.enabled = false
  })

  scene.add(new AmbientLight(0xffffff, 0.55))
  // Key light tracks the camera every frame so it always shines from the viewer.
  const key = new DirectionalLight(0xffffff, 1.6)
  scene.add(key)
  // target must be in the scene for updateMatrixWorld to have effect
  scene.add(key.target)

  const modelGroup = new Group()
  scene.add(modelGroup)
  const axisGroup = new Group()
  scene.add(axisGroup)
  const orbitGroup = new Group()
  scene.add(orbitGroup)

  // Pre-allocated orbit arc — updated dynamically each frame based on camera azimuth.
  // The arc always lies in the horizontal (XZ) plane around world-Y, matching the
  // backend's turntable orbit (phase2_snapshots.py rotates the camera around Y).
  const orbitArcPositions = new Float32BufferAttribute(
    new Float32Array((ORBIT_ARC_N + 1) * 3), 3,
  )
  const orbitArcGeom = new BufferGeometry()
  orbitArcGeom.setAttribute('position', orbitArcPositions)
  const orbitArcMat = new LineBasicMaterial({
    color: 0x00d4ff,
    depthTest: false,
    transparent: true,
    opacity: 0.92,
    linewidth: 2,
  })
  const orbitArcLine = new Line(orbitArcGeom, orbitArcMat)
  orbitArcLine.renderOrder = 998
  orbitArcLine.visible = false
  orbitGroup.add(orbitArcLine)

  // Arrow cone at the orbit arc endpoint indicating travel direction.
  // ConeGeometry(1,1,8) = unit cone pointing along +Y; scaled per-frame.
  const arrowConeMat = new MeshBasicMaterial({
    color: 0x00d4ff,
    depthTest: false,
    transparent: true,
    opacity: 0.85,
  })
  const arrowCone = new Mesh(new ConeGeometry(1, 1, 8), arrowConeMat)
  arrowCone.renderOrder = 999
  arrowCone.visible = false
  orbitGroup.add(arrowCone)

  let currentAxes: Record<AxisVariant, Vec3> | null = null
  let currentSelected: AxisVariant = 'y'
  let currentExplodeScalar = 1.5
  let currentOrbitDeg = 40
  let currentOrbitMode: OrbitMode = 'horizontal'
  let currentOrbitDir: OrbitDirection = 1
  let modelCenter = new Vector3()
  let modelDiagonal = 1
  let modelLoaded = false
  // Anchor direction for vertical orbit arc — frozen when vertical mode activates.
  // This keeps the arc fixed in world space so the user can orbit the viewer to
  // see the arc's curvature from the side, rather than it always being edge-on.
  let verticalAnchorDir = new Vector3(0.3, 0.3, 1.0).normalize()

  const debug: DebugState = {
    rect: { width: 0, height: 0 },
    pointerDowns: 0,
    lastHit: '',
    pixelRatio: renderer.getPixelRatio(),
  }

  const changeCbs: Array<(o: Orientation) => void> = []
  const emitChange = () => {
    const o = getOrientation()
    for (const cb of changeCbs) cb(o)
  }

  const getOrientation = (): Orientation => ({
    quaternion: [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w],
    position: [camera.position.x, camera.position.y, camera.position.z],
    target: [controls.target.x, controls.target.y, controls.target.z],
  })

  const onControlsChange = () => emitChange()
  controls.addEventListener('change', onControlsChange)

  const onPointerDown = (e: PointerEvent) => {
    debug.pointerDowns += 1
    const t = e.target as Element | null
    debug.lastHit = t
      ? `${t.tagName.toLowerCase()}${t.className ? '.' + String(t.className).split(' ')[0] : ''}`
      : 'null'
  }
  canvas.addEventListener('pointerdown', onPointerDown)

  const applySize = () => {
    const rect = stage.getBoundingClientRect()
    debug.rect = { width: rect.width, height: rect.height }
    if (rect.width < 2 || rect.height < 2) return
    renderer.setSize(rect.width, rect.height, false)
    camera.aspect = rect.width / rect.height
    camera.updateProjectionMatrix()
  }
  applySize()

  const ro = new ResizeObserver(applySize)
  ro.observe(stage)

  // Update the orbit arc each frame.
  // Horizontal mode: arc sweeps in XZ plane around world Y (turntable).
  // Vertical mode: arc sweeps in the plane defined by cam direction and world Y (crane).
  // At 360° the arc closes into a full circle.
  // An arrow cone at the arc endpoint shows the direction of travel.
  const updateOrbitArc = () => {
    if (!modelLoaded || currentOrbitDeg <= 0) {
      orbitArcLine.visible = false
      arrowCone.visible = false
      return
    }
    orbitArcLine.visible = true
    arrowCone.visible = true

    const camOffset = camera.position.clone().sub(controls.target)
    // Radius scales with model size (not camera distance) so the arc stays
    // visually stable across zoom levels. 0.75 × diagonal clears even highly
    // elongated models (half-extent along longest axis ≤ 0.5 × diagonal).
    const radius = modelDiagonal * 0.75
    const TWO_PI = 2 * Math.PI
    const fullAngleRad = Math.min((currentOrbitDeg * Math.PI) / 180, TWO_PI)
    const isFullCircle = fullAngleRad >= TWO_PI - 0.01
    const arr = orbitArcPositions.array as Float32Array

    if (currentOrbitMode === 'horizontal') {
      const azimuth = Math.atan2(camOffset.x, camOffset.z)
      for (let i = 0; i <= ORBIT_ARC_N; i++) {
        const angle = azimuth + (i / ORBIT_ARC_N) * fullAngleRad * currentOrbitDir
        arr[i * 3]     = modelCenter.x + Math.sin(angle) * radius
        arr[i * 3 + 1] = modelCenter.y
        arr[i * 3 + 2] = modelCenter.z + Math.cos(angle) * radius
      }
    } else {
      // Vertical crane orbit: rotate around the camera's right vector.
      // Uses verticalAnchorDir (captured when mode was activated, not the live
      // camera direction) so the arc is fixed in world space — the user can
      // orbit the viewer to see the arc's curvature from any angle.
      const baseDir = verticalAnchorDir
      const dotY = baseDir.y
      const upInPlane = new Vector3(-baseDir.x * dotY, 1 - dotY * dotY, -baseDir.z * dotY)
      if (upInPlane.lengthSq() < 1e-6) {
        upInPlane.set(1, 0, 0)
      } else {
        upInPlane.normalize()
      }
      for (let i = 0; i <= ORBIT_ARC_N; i++) {
        const angle = (i / ORBIT_ARC_N) * fullAngleRad * currentOrbitDir
        const c = Math.cos(angle)
        const s = Math.sin(angle)
        arr[i * 3]     = modelCenter.x + radius * (c * baseDir.x + s * upInPlane.x)
        arr[i * 3 + 1] = modelCenter.y + radius * (c * baseDir.y + s * upInPlane.y)
        arr[i * 3 + 2] = modelCenter.z + radius * (c * baseDir.z + s * upInPlane.z)
      }
    }

    orbitArcPositions.needsUpdate = true
    orbitArcGeom.computeBoundingSphere()

    // Position and orient the arrow cone at the arc endpoint.
    // For a full circle use the second-to-last point to get a non-degenerate tangent.
    const tipIdx = isFullCircle ? ORBIT_ARC_N - 1 : ORBIT_ARC_N
    const prevIdx = tipIdx - 1
    const ex = arr[tipIdx * 3], ey = arr[tipIdx * 3 + 1], ez = arr[tipIdx * 3 + 2]
    const tx = ex - arr[prevIdx * 3]
    const ty = ey - arr[prevIdx * 3 + 1]
    const tz = ez - arr[prevIdx * 3 + 2]
    const tLen = Math.sqrt(tx * tx + ty * ty + tz * tz)
    if (tLen > 1e-8) {
      arrowCone.position.set(ex, ey, ez)
      // Default cone axis is +Y; rotate to match arc tangent.
      arrowCone.quaternion.setFromUnitVectors(
        new Vector3(0, 1, 0),
        new Vector3(tx / tLen, ty / tLen, tz / tLen),
      )
      // Scale proportional to modelDiagonal so it looks right at any zoom.
      const cr = modelDiagonal * 0.012
      const ch = modelDiagonal * 0.038
      arrowCone.scale.set(cr, ch, cr)
    }
  }

  let rafId = 0
  const tick = () => {
    if (snapAnim) {
      snapAnim.progress = Math.min(1, snapAnim.progress + 0.05)
      const t = easeInOut(snapAnim.progress)
      camera.position.lerpVectors(snapAnim.startPos, snapAnim.endPos, t)
      camera.quaternion.slerpQuaternions(snapAnim.startQuat, snapAnim.endQuat, t)
      if (snapAnim.progress >= 1) {
        finishSnap(snapAnim.endUp)
        snapAnim = null
        emitChange()
      }
    } else {
      controls.update()
    }
    // Keep key light coincident with the camera so it always illuminates
    // whatever face is visible to the viewer.
    key.position.copy(camera.position)
    key.target.position.copy(controls.target)
    key.target.updateMatrixWorld()

    updateOrbitArc()
    renderer.render(scene, camera)
    viewCube.update()
    rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)

  const finishSnap = (endUp: Vector3) => {
    camera.up.copy(endUp)
    const raw = controls as unknown as Record<string, { copy: (v: unknown) => void }>
    raw['_rotateEnd']?.copy(raw['_rotateStart'])
    raw['_zoomEnd']?.copy(raw['_zoomStart'])
    raw['_panEnd']?.copy(raw['_panStart'])
    controls.enabled = true
    controls.update()
  }

  const clearGroup = (g: Group) => {
    while (g.children.length > 0) {
      const child = g.children[0]
      g.remove(child)
      disposeObject(child)
    }
  }

  const rebuildAxisLines = () => {
    clearGroup(axisGroup)
    if (!currentAxes) return

    const dir = new Vector3(...currentAxes[currentSelected])
    if (dir.lengthSq() < 1e-8) return
    dir.normalize()

    // Length scales with explosion scalar — matches backend explosion magnitude
    const halfLen = modelDiagonal * 0.4 * currentExplodeScalar
    const start = modelCenter.clone().addScaledVector(dir, -halfLen)
    const end   = modelCenter.clone().addScaledVector(dir,  halfLen)

    const geom = new BufferGeometry()
    geom.setAttribute('position', new Float32BufferAttribute(
      [start.x, start.y, start.z, end.x, end.y, end.z], 3,
    ))
    const mat = new LineBasicMaterial({
      color: 0xd4a843,
      depthTest: false,
      transparent: true,
      opacity: 0.92,
      linewidth: 2,
    })
    const line = new Line(geom, mat)
    line.renderOrder = 999
    axisGroup.add(line)

    // Arrow cones at both ends of the axis line
    const arrowR = modelDiagonal * 0.012
    const arrowH = modelDiagonal * 0.038
    const makeAxisCone = (pos: Vector3, pointDir: Vector3) => {
      const cone = new Mesh(
        new ConeGeometry(1, 1, 8),
        new MeshBasicMaterial({ color: 0xd4a843, depthTest: false, transparent: true, opacity: 0.92 }),
      )
      cone.renderOrder = 999
      cone.position.copy(pos)
      cone.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), pointDir)
      cone.scale.set(arrowR, arrowH, arrowR)
      return cone
    }
    axisGroup.add(makeAxisCone(end, dir))
    axisGroup.add(makeAxisCone(start, dir.clone().negate()))
  }

  const fitCameraToModel = (root: Object3D) => {
    const box = new Box3().setFromObject(root)
    if (box.isEmpty()) return
    const center = new Vector3()
    const size = new Vector3()
    box.getCenter(center)
    box.getSize(size)
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    const fovRad = (camera.fov * Math.PI) / 180
    const dist = ((maxDim * 0.5) / Math.tan(fovRad * 0.5)) * 1.8

    camera.position.set(center.x + dist * 0.4, center.y + dist * 0.3, center.z + dist)
    camera.near = dist * 0.001
    camera.far = dist * 100
    camera.updateProjectionMatrix()
    controls.target.copy(center)
    controls.update()

    modelCenter = center.clone()
    modelDiagonal = size.length() || maxDim
  }

  const loadModel = async (url: string, ext: string): Promise<void> => {
    clearGroup(modelGroup)
    modelGroup.rotation.set(0, 0, 0)
    modelLoaded = false

    const lower = ext.toLowerCase()
    if (lower === 'glb' || lower === 'gltf') {
      const loader = new GLTFLoader()
      const gltf = await loader.loadAsync(url)
      modelGroup.add(gltf.scene)
    } else if (lower === 'obj') {
      const loader = new OBJLoader()
      const obj = await loader.loadAsync(url)
      obj.traverse((child) => {
        if (!(child instanceof Mesh)) return
        if (child.geometry && !child.geometry.attributes.normal) {
          child.geometry.computeVertexNormals()
        }
        child.material = MODEL_MATERIAL()
      })
      modelGroup.add(obj)
    } else {
      throw new Error(`Unsupported format: ${ext}`)
    }

    // Compute bounding box extents of the raw (unrotated) model to detect its
    // longest axis. Then apply the same reorientation as the backend pipeline
    // (phase1_geometry.py GeometryAnalyzer.reorient):
    //   X is longest → rotate +90° around Z  (maps X→Y)
    //   Z is longest → rotate -90° around X  (maps Z→Y)
    //   Y is longest → no rotation (already upright)
    const rawBox = new Box3().setFromObject(modelGroup)
    const rawSize = new Vector3()
    rawBox.getSize(rawSize)

    if (rawSize.x >= rawSize.y && rawSize.x >= rawSize.z) {
      modelGroup.rotation.z = Math.PI / 2
    } else if (rawSize.z >= rawSize.y) {
      modelGroup.rotation.x = -Math.PI / 2
    }

    // Camera fit uses post-rotation world-space bounds
    modelLoaded = true
    fitCameraToModel(modelGroup)

    if (opts?.initialCameraDirection) {
      const [dx, dy, dz] = opts.initialCameraDirection
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (len > 1e-6) {
        const dist = camera.position.distanceTo(controls.target)
        camera.position.set(
          controls.target.x + (dx / len) * dist,
          controls.target.y + (dy / len) * dist,
          controls.target.z + (dz / len) * dist,
        )
        // Sync camera orientation so it faces the target from the new position.
        // Without this the quaternion keeps the old direction from fitCameraToModel.
        camera.up.set(0, 1, 0)
        camera.lookAt(controls.target)
        // Prevent TrackballControls from computing a spurious delta on first update.
        const raw = controls as unknown as Record<string, { copy: (v: unknown) => void }>
        raw['_rotateEnd']?.copy(raw['_rotateStart'])
        controls.update()
      }
    }

    // Sync the vertical anchor to wherever the camera landed after model load.
    verticalAnchorDir = camera.position.clone().sub(controls.target).normalize()

    rebuildAxisLines()
    emitChange()
  }

  const setAxes = (axes: Record<AxisVariant, Vec3> | null, selected: AxisVariant) => {
    currentAxes = axes
    currentSelected = selected
    rebuildAxisLines()
  }

  const setExplodeScalar = (v: number) => {
    currentExplodeScalar = v
    rebuildAxisLines()
  }

  const setOrbitRange = (deg: number) => {
    currentOrbitDeg = deg
  }

  const setOrbitMode = (mode: OrbitMode) => {
    if (mode === 'vertical' && currentOrbitMode !== 'vertical') {
      // Capture the current camera-to-target direction as the fixed arc anchor.
      // Subsequent viewer-camera orbits won't re-orient the arc, so the user
      // can look at the arc from the side and see its 3D curvature.
      verticalAnchorDir = camera.position.clone().sub(controls.target).normalize()
    }
    currentOrbitMode = mode
  }

  const setOrbitDirection = (dir: OrbitDirection) => {
    currentOrbitDir = dir
  }

  const onChange = (cb: (o: Orientation) => void) => {
    changeCbs.push(cb)
    return () => {
      const i = changeCbs.indexOf(cb)
      if (i >= 0) changeCbs.splice(i, 1)
    }
  }

  const getDebug = (): DebugState => ({ ...debug, rect: { ...debug.rect } })

  const dispose = () => {
    cancelAnimationFrame(rafId)
    ro.disconnect()
    canvas.removeEventListener('pointerdown', onPointerDown)
    controls.removeEventListener('change', onControlsChange)
    controls.dispose()
    viewCube.dispose()
    clearGroup(modelGroup)
    clearGroup(axisGroup)
    clearGroup(orbitGroup)
    renderer.dispose()
    changeCbs.length = 0
  }

  return { loadModel, setAxes, setExplodeScalar, setOrbitRange, setOrbitMode, setOrbitDirection, getOrientation, onChange, getDebug, dispose }
}

function disposeObject(obj: Object3D) {
  obj.traverse((child) => {
    const anyChild = child as unknown as {
      geometry?: { dispose?: () => void }
      material?: { dispose?: () => void } | Array<{ dispose?: () => void }>
    }
    anyChild.geometry?.dispose?.()
    const mat = anyChild.material
    if (Array.isArray(mat)) { for (const m of mat) m.dispose?.() }
    else { mat?.dispose?.() }
  })
}
