import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import * as THREE from 'three'
import { LOOP_DURATION } from './useLoopClock'

export const MARK = {
  cursorEnterZone: 0.9,
  dropStart: 1.7,
  dropEnd: 2.3,
  cubeIn: 2.4,
  cursorToSlider: 3.2,
  sliderDragStart: 3.7,
  sliderDragEnd: 5.4,
  cursorToGenerate: 5.7,
  generateClick: 6.2,
  cursorHide: 6.3,
  explodeStart: 6.4,
  explodeEnd: 9.2,
  wipeStart: 9.7,
  wipeEnd: 12.6,
  holdEnd: 14.4,
} as const

// Cursor positions are in % of the .demo-reel container (which is the stage).
// The toolbar sits at the bottom, inset 20px from left/right/bottom with 14px vertical padding.
// Toolbar vertical center ~ bottom - (20 + 23) ≈ bottom - 43px. For a 4/3 aspect reel
// 430px wide → 322px tall → 322-43 = 279 → ~86.6%. Use 87%.
// Slider track starts after "Explode" label + 14px gap. Label ~70px + 14 = 84px from toolbar inner
// edge which is 20+18=38px from scene left. Thumb-at-start sits at ~(38+84)/430 ≈ 28.4%.
// Toolbar inner right edge = scene_w - 38 = 392px. Generate button "Generate" ~90px wide,
// button center ≈ 392 - 45 = 347px → 80.6%. Track ends ~16px left of Generate → 347-45-16 = 286px → 66.5%.
const CURSOR_PATH: Array<{ t: number; x: number; y: number }> = [
  { t: 0, x: 82, y: 90 },
  { t: MARK.cursorEnterZone, x: 50, y: 48 },
  { t: MARK.dropEnd, x: 50, y: 48 },
  { t: MARK.cursorToSlider, x: 21, y: 90 },
  { t: MARK.sliderDragStart, x: 21, y: 90 },
  { t: MARK.sliderDragEnd, x: 71, y: 90 },
  { t: MARK.cursorToGenerate, x: 85, y: 90 },
  { t: MARK.generateClick, x: 85, y: 90 },
  { t: LOOP_DURATION, x: 85, y: 90 },
]

function smooth(t: number, a: number, b: number): number {
  if (t <= a) return 0
  if (t >= b) return 1
  const u = (t - a) / (b - a)
  return u * u * (3 - 2 * u)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function samplePath(t: number): { x: number; y: number } {
  const p = CURSOR_PATH
  for (let i = 0; i < p.length - 1; i++) {
    if (t >= p[i].t && t <= p[i + 1].t) {
      const u = (t - p[i].t) / Math.max(1e-6, p[i + 1].t - p[i].t)
      const e = u * u * (3 - 2 * u)
      return { x: lerp(p[i].x, p[i + 1].x, e), y: lerp(p[i].y, p[i + 1].y, e) }
    }
  }
  const last = p[p.length - 1]
  return { x: last.x, y: last.y }
}

interface CubesProps {
  t: React.MutableRefObject<number>
}

function Cubes({ t }: CubesProps) {
  const groupRef = useRef<THREE.Group>(null)
  const childRefs = useRef<Array<THREE.Group | null>>([])
  const wireRefs = useRef<Array<THREE.LineSegments | null>>([])
  const solidRefs = useRef<Array<THREE.Mesh | null>>([])

  const positions = useMemo(() => {
    const out: Array<[number, number, number]> = []
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          out.push([x * 1.02, y * 1.02, z * 1.02])
        }
      }
    }
    return out
  }, [])

  const edges = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(0.96, 0.96, 0.96)),
    [],
  )
  const box = useMemo(() => new THREE.BoxGeometry(0.96, 0.96, 0.96), [])

  useFrame(() => {
    const time = t.current
    const g = groupRef.current
    if (!g) return

    const appear = smooth(time, MARK.cubeIn, MARK.cubeIn + 0.6)
    const exit = smooth(time, MARK.holdEnd, LOOP_DURATION)
    const globalOpacity = appear * (1 - exit)
    const scale = 0.65 + 0.35 * appear
    g.scale.setScalar(scale)

    g.rotation.y = time * 0.42
    g.rotation.x = time * 0.18

    const preview = smooth(time, MARK.sliderDragStart, MARK.sliderDragEnd) * 0.32
    const full = smooth(time, MARK.explodeStart, MARK.explodeEnd)
    const explode = Math.max(preview, full)

    positions.forEach(([x, y, z], i) => {
      const child = childRefs.current[i]
      if (!child) return
      const len = Math.max(1e-6, Math.sqrt(x * x + y * y + z * z))
      const nx = x / len
      const ny = y / len
      const nz = z / len
      const dist = explode * 1.55
      child.position.set(x + nx * dist, y + ny * dist, z + nz * dist)

      const tx = (x + 1.02) / 2.04
      const startPhase = MARK.wipeStart + tx * 1.4
      const endPhase = startPhase + 0.9
      const cubeRenderMix = smooth(time, startPhase, endPhase)

      const wire = wireRefs.current[i]
      const solid = solidRefs.current[i]
      if (wire) {
        const mat = wire.material as THREE.LineBasicMaterial
        mat.opacity = globalOpacity * (1 - cubeRenderMix)
      }
      if (solid) {
        const mat = solid.material as THREE.MeshStandardMaterial
        mat.opacity = globalOpacity * cubeRenderMix
      }
    })
  })

  return (
    <group ref={groupRef}>
      {positions.map((_, i) => (
        <group
          key={i}
          ref={(el) => {
            childRefs.current[i] = el
          }}
        >
          <lineSegments
            ref={(el) => {
              wireRefs.current[i] = el
            }}
            geometry={edges}
          >
            <lineBasicMaterial color="#d4a843" transparent opacity={0} />
          </lineSegments>
          <mesh
            ref={(el) => {
              solidRefs.current[i] = el
            }}
            geometry={box}
          >
            <meshStandardMaterial
              color="#e5b850"
              metalness={1}
              roughness={0.18}
              emissive="#1a1205"
              emissiveIntensity={0.25}
              transparent
              opacity={0}
            />
          </mesh>
        </group>
      ))}
    </group>
  )
}

interface DemoReelProps {
  tRef: React.MutableRefObject<number>
}

export function DemoReel({ tRef }: DemoReelProps) {
  const t = tRef.current
  const cursor = samplePath(t)

  const marbleOpacity = smooth(t, MARK.wipeStart, MARK.wipeEnd)
  const dropZoneOpacity =
    smooth(t, 0, 0.2) * (1 - smooth(t, MARK.dropEnd, MARK.dropEnd + 0.4))
  const dropZonePulse =
    smooth(t, MARK.dropStart, MARK.dropEnd) *
    (1 - smooth(t, MARK.dropEnd, MARK.dropEnd + 0.4))
  const uiDim = smooth(t, MARK.explodeStart, MARK.explodeStart + 0.8)
  const toolbarOpacity = smooth(t, MARK.cubeIn + 0.3, MARK.cubeIn + 0.9) * (1 - uiDim)
  const sliderFillVal = smooth(t, MARK.sliderDragStart, MARK.sliderDragEnd)
  const generateFlash =
    smooth(t, MARK.generateClick, MARK.generateClick + 0.1) *
    (1 - smooth(t, MARK.generateClick + 0.15, MARK.generateClick + 0.5))
  const chipOpacity =
    smooth(t, 0.1, 0.5) * (1 - smooth(t, MARK.dropStart - 0.15, MARK.dropStart + 0.1))
  const cursorOpacity = 1 - smooth(t, MARK.generateClick + 0.05, MARK.generateClick + 0.25)

  return (
    <div className="demo-reel">
      <span className="demo-reel__corner demo-reel__corner--tl" aria-hidden />
      <span className="demo-reel__corner demo-reel__corner--tr" aria-hidden />
      <span className="demo-reel__corner demo-reel__corner--bl" aria-hidden />
      <span className="demo-reel__corner demo-reel__corner--br" aria-hidden />

      <div className="demo-reel__scene">
        <div
          className="demo-reel__marble"
          aria-hidden
          style={{ opacity: marbleOpacity }}
        />
        <Canvas
          className="demo-reel__canvas"
          dpr={[1, 1.5]}
          camera={{ position: [0, 0.4, 6.8], fov: 42 }}
          gl={{ antialias: true, alpha: true }}
        >
          <ambientLight intensity={0.35} />
          <directionalLight position={[4, 6, 4]} intensity={1.2} color="#fff2c8" />
          <directionalLight position={[-5, -1, -3]} intensity={0.35} color="#6b8cff" />
          <Environment resolution={256} frames={1}>
            <Lightformer
              form="rect"
              intensity={3.2}
              color="#fff4cc"
              position={[4, 4, 4]}
              scale={[8, 8, 1]}
              rotation={[0, -Math.PI / 4, 0]}
            />
            <Lightformer
              form="rect"
              intensity={1.6}
              color="#a8c0ff"
              position={[-4, 2, -3]}
              scale={[6, 10, 1]}
              rotation={[0, Math.PI / 3, 0]}
            />
            <Lightformer
              form="rect"
              intensity={0.7}
              color="#ffffff"
              position={[0, 6, 0]}
              scale={[4, 4, 1]}
              rotation={[-Math.PI / 2, 0, 0]}
            />
          </Environment>
          <Cubes t={tRef} />
        </Canvas>

        <div
          className="demo-reel__dropzone"
          aria-hidden
          style={{
            opacity: dropZoneOpacity,
            boxShadow:
              dropZonePulse > 0
                ? `0 0 0 1px rgba(212, 168, 67, ${0.6 * dropZonePulse}), 0 0 36px rgba(212, 168, 67, ${0.3 * dropZonePulse})`
                : 'none',
          }}
        >
          Drop a CAD file
        </div>

        <div
          className="demo-reel__chip"
          aria-hidden
          style={{
            opacity: chipOpacity,
            left: `${cursor.x}%`,
            top: `${cursor.y}%`,
          }}
        >
          product.glb
        </div>
      </div>

      <div
        className="demo-reel__toolbar"
        aria-hidden
        style={{ opacity: toolbarOpacity }}
      >
        <div className="demo-reel__slider">
          <span className="demo-reel__slider-label">Explode</span>
          <div className="demo-reel__slider-track">
            <div
              className="demo-reel__slider-fill"
              style={{ width: `${sliderFillVal * 100}%` }}
            />
            <div
              className="demo-reel__slider-thumb"
              style={{ left: `calc(${sliderFillVal * 100}% - 6px)` }}
            />
          </div>
        </div>
        <div
          className="demo-reel__generate"
          style={{
            boxShadow:
              generateFlash > 0
                ? `0 0 30px rgba(212, 168, 67, ${0.7 * generateFlash})`
                : '0 0 0 0 rgba(0,0,0,0)',
            transform: `scale(${1 + generateFlash * 0.04})`,
          }}
        >
          Generate
        </div>
      </div>

      <div
        className="demo-reel__cursor"
        aria-hidden
        style={{
          left: `${cursor.x}%`,
          top: `${cursor.y}%`,
          opacity: cursorOpacity,
        }}
      >
        <svg viewBox="0 0 14 20" width="16" height="22">
          <path
            d="M1 1 L1 15 L5 11.5 L7.2 17 L9.5 16.1 L7.3 10.6 L12 10.6 Z"
            fill="#d4a843"
            stroke="#0a0a0a"
            strokeWidth="0.6"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  )
}

export default DemoReel
