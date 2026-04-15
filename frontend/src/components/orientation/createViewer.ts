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

export interface ViewerHandle {
  loadModel(url: string, ext: string): Promise<void>
  setAxis(direction: Vec3 | null): void
  setExplodeScalar(v: number): void
  setOrbitRange(deg: number): void
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

  scene.add(new AmbientLight(0xffffff, 0.8))
  const key = new DirectionalLight(0xffffff, 1.8)
  key.position.set(4, 6, 4)
  scene.add(key)
  const fill = new DirectionalLight(0x6fa8d4, 0.5)
  fill.position.set(-3, 2, -3)
  scene.add(fill)

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
    opacity: 0.85,
  })
  const orbitArcLine = new Line(orbitArcGeom, orbitArcMat)
  orbitArcLine.renderOrder = 998
  orbitArcLine.visible = false
  orbitGroup.add(orbitArcLine)

  let currentAxis: Vec3 | null = null
  let currentExplodeScalar = 1.5
  let currentOrbitDeg = 40
  let modelCenter = new Vector3()
  let modelDiagonal = 1
  let modelLoaded = false

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

  // Update the orbit arc each frame to face the camera.
  // The arc is centered on modelCenter at orbitRadius in the XZ plane (Y-orbit plane),
  // starting at the camera's current azimuth and sweeping ±orbitRangeDeg/2 degrees.
  // This matches the backend: phase2_snapshots.py orbits around world Y.
  const updateOrbitArc = () => {
    if (!modelLoaded || currentOrbitDeg <= 0) {
      orbitArcLine.visible = false
      return
    }
    orbitArcLine.visible = true

    const camOffset = camera.position.clone().sub(controls.target)
    // Azimuth angle in the XZ plane: atan2(x, z) gives 0 when camera is at +Z.
    const azimuth = Math.atan2(camOffset.x, camOffset.z)
    const halfAngleRad = (currentOrbitDeg * Math.PI) / 360
    const radius = modelDiagonal * 0.55
    const arr = orbitArcPositions.array as Float32Array

    for (let i = 0; i <= ORBIT_ARC_N; i++) {
      const t = i / ORBIT_ARC_N
      const angle = azimuth - halfAngleRad + t * 2 * halfAngleRad
      // sin/cos produces a circle in XZ; arc stays at model center height (Y-orbit)
      arr[i * 3]     = modelCenter.x + Math.sin(angle) * radius
      arr[i * 3 + 1] = modelCenter.y
      arr[i * 3 + 2] = modelCenter.z + Math.cos(angle) * radius
    }
    orbitArcPositions.needsUpdate = true
    orbitArcGeom.computeBoundingSphere()
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

  const rebuildAxisLine = () => {
    clearGroup(axisGroup)
    if (!currentAxis) return
    const dir = new Vector3(...currentAxis)
    if (dir.lengthSq() < 1e-8) return
    dir.normalize()

    // Length scales with explosion scalar — matches backend explosion magnitude
    const halfLen = modelDiagonal * 0.4 * currentExplodeScalar
    const start = modelCenter.clone().addScaledVector(dir, -halfLen)
    const end = modelCenter.clone().addScaledVector(dir, halfLen)

    const geom = new BufferGeometry()
    geom.setAttribute('position', new Float32BufferAttribute(
      [start.x, start.y, start.z, end.x, end.y, end.z], 3,
    ))
    const mat = new LineBasicMaterial({ color: 0xf5a623, depthTest: false, transparent: true })
    const line = new Line(geom, mat)
    line.renderOrder = 999
    axisGroup.add(line)
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
        controls.update()
      }
    }

    rebuildAxisLine()
    emitChange()
  }

  const setAxis = (direction: Vec3 | null) => {
    currentAxis = direction
    rebuildAxisLine()
  }

  const setExplodeScalar = (v: number) => {
    currentExplodeScalar = v
    rebuildAxisLine()
  }

  const setOrbitRange = (deg: number) => {
    currentOrbitDeg = deg
    // Arc geometry is updated dynamically in tick loop
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

  return { loadModel, setAxis, setExplodeScalar, setOrbitRange, getOrientation, onChange, getDebug, dispose }
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
