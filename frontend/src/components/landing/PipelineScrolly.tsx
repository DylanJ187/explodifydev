import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { motion, useScroll, useTransform, useMotionValueEvent } from 'framer-motion'
import type { MotionValue } from 'framer-motion'
import * as THREE from 'three'

// TODO: replace /public/demo.mp4 with a real 3-sec explode loop rendered from the pipeline.

interface StageDef {
  index: string
  title: string
  body: string
}

const STAGES: StageDef[] = [
  {
    index: '01',
    title: 'Drop a CAD file',
    body: 'GLB, OBJ, STEP, STL. We parse geometry, detect components, and pick explosion axes automatically.',
  },
  {
    index: '02',
    title: 'Blow it apart',
    body: 'Five-sample easing ramps control motion. Orbit around any axis. Preview the first frame live before you render.',
  },
  {
    index: '03',
    title: 'Render cinematic',
    body: 'Pyrender pushes 72 frames. FFmpeg stitches. FAL.ai Kling o1 styles with your prompt — cinematic, product-shot, or custom.',
  },
  {
    index: '04',
    title: 'Ship the ad',
    body: 'Download the MP4. Loop it, stitch it, post it. Under five minutes from upload to shippable asset.',
  },
]

interface CubesProps {
  rotation: React.MutableRefObject<number>
  explode: React.MutableRefObject<number>
  renderMix: React.MutableRefObject<number>
}

function Cubes({ rotation, explode, renderMix }: CubesProps) {
  const groupRef = useRef<THREE.Group>(null)

  const parts = useMemo(() => {
    const positions: Array<[number, number, number]> = [
      [1, 1, 1],
      [-1, 1, -1],
      [-1, -1, 1],
      [1, -1, -1],
      [1.2, 0, 0],
      [-1.2, 0, 0],
    ]
    return positions.map((p) => ({
      basePos: new THREE.Vector3(...p),
      dir: new THREE.Vector3(...p).normalize(),
    }))
  }, [])

  useFrame(() => {
    const g = groupRef.current
    if (!g) return
    g.rotation.y = rotation.current
    g.rotation.x = rotation.current * 0.35
    const spread = explode.current * 2.2
    g.children.forEach((child, i) => {
      const part = parts[i]
      if (!part) return
      const target = part.basePos.clone().add(part.dir.clone().multiplyScalar(spread))
      child.position.copy(target)
    })
  })

  return (
    <group ref={groupRef}>
      {parts.map((_, i) => (
        <PartCube key={i} renderMix={renderMix} index={i} />
      ))}
    </group>
  )
}

function PartCube({ renderMix, index }: { renderMix: React.MutableRefObject<number>; index: number }) {
  const wireRef = useRef<THREE.LineSegments>(null)
  const solidRef = useRef<THREE.Mesh>(null)
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(0.7, 0.7, 0.7)), [])

  useFrame(() => {
    const m = renderMix.current
    const wire = wireRef.current
    const solid = solidRef.current
    if (wire) {
      const mat = wire.material as THREE.LineBasicMaterial
      mat.opacity = 1 - m
      mat.transparent = true
    }
    if (solid) {
      const mat = solid.material as THREE.MeshStandardMaterial
      mat.opacity = m
      mat.transparent = true
    }
  })

  const hue = 0.12 + index * 0.01

  return (
    <group>
      <lineSegments ref={wireRef} geometry={edges}>
        <lineBasicMaterial color="#d4a843" />
      </lineSegments>
      <mesh ref={solidRef}>
        <boxGeometry args={[0.7, 0.7, 0.7]} />
        <meshStandardMaterial
          color={new THREE.Color().setHSL(hue, 0.55, 0.52)}
          metalness={0.35}
          roughness={0.45}
        />
      </mesh>
    </group>
  )
}

interface StageCanvasProps {
  rotation: React.MutableRefObject<number>
  explode: React.MutableRefObject<number>
  renderMix: React.MutableRefObject<number>
}

function StageCanvas({ rotation, explode, renderMix }: StageCanvasProps) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 1.2, 6], fov: 45 }}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 6, 4]} intensity={0.8} color="#ffe6a8" />
      <directionalLight position={[-3, -2, -2]} intensity={0.3} color="#66aaff" />
      <Cubes rotation={rotation} explode={explode} renderMix={renderMix} />
    </Canvas>
  )
}

function bindRef(ref: React.MutableRefObject<number>, mv: MotionValue<number>) {
  ref.current = mv.get()
}

export function PipelineScrolly() {
  const sectionRef = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  })

  const rotationMV = useTransform(scrollYProgress, [0, 0.5], [0, Math.PI])
  const explodeMV = useTransform(scrollYProgress, [0.25, 0.5], [0, 1])
  const renderMixMV = useTransform(scrollYProgress, [0.5, 0.75], [0, 1])
  const videoOpacityMV = useTransform(scrollYProgress, [0.72, 0.92], [0, 1])
  const videoScaleMV = useTransform(scrollYProgress, [0.72, 0.95], [0.92, 1])

  const rotationRef = useRef(0)
  const explodeRef = useRef(0)
  const renderMixRef = useRef(0)

  useMotionValueEvent(rotationMV, 'change', (v) => (rotationRef.current = v))
  useMotionValueEvent(explodeMV, 'change', (v) => (explodeRef.current = v))
  useMotionValueEvent(renderMixMV, 'change', (v) => (renderMixRef.current = v))

  // Bind initial values.
  bindRef(rotationRef, rotationMV)
  bindRef(explodeRef, explodeMV)
  bindRef(renderMixRef, renderMixMV)

  return (
    <section id="pipeline" ref={sectionRef} className="landing-scrolly">
      <div className="landing-scrolly__sticky">
        <div className="landing-scrolly__inner">
          <div className="landing-scrolly__panels">
            {STAGES.map((stage, i) => (
              <StagePanel key={stage.index} stage={stage} index={i} progress={scrollYProgress} />
            ))}
          </div>

          <div className="landing-scrolly__stage">
            <div className="landing-scrolly__stage-frame">
              <span className="landing-scrolly__frame-edge landing-scrolly__frame-edge--tl" aria-hidden />
              <span className="landing-scrolly__frame-edge landing-scrolly__frame-edge--tr" aria-hidden />
              <span className="landing-scrolly__frame-edge landing-scrolly__frame-edge--bl" aria-hidden />
              <span className="landing-scrolly__frame-edge landing-scrolly__frame-edge--br" aria-hidden />

              <StageCanvas
                rotation={rotationRef}
                explode={explodeRef}
                renderMix={renderMixRef}
              />

              <motion.div
                className="landing-scrolly__video"
                style={{ opacity: videoOpacityMV, scale: videoScaleMV }}
              >
                <video
                  className="landing-scrolly__video-el"
                  src="/demo.mp4"
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                />
                <span className="landing-scrolly__video-chrome" aria-hidden>
                  <span>PREVIEW · 04</span>
                  <span>MP4 1080p</span>
                </span>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

interface StagePanelProps {
  stage: StageDef
  index: number
  progress: MotionValue<number>
}

function StagePanel({ stage, index, progress }: StagePanelProps) {
  const start = index * 0.25
  const peak = start + 0.1
  const fadeOut = start + 0.22
  const end = start + 0.28
  const opacity = useTransform(
    progress,
    [Math.max(0, start - 0.02), peak, fadeOut, end],
    [0, 1, 1, index === STAGES.length - 1 ? 1 : 0],
  )
  const y = useTransform(progress, [start, peak], [24, 0])

  return (
    <motion.article className="landing-scrolly__panel" style={{ opacity, y }}>
      <span className="landing-scrolly__panel-index">{stage.index}</span>
      <h3 className="landing-scrolly__panel-title">{stage.title}</h3>
      <p className="landing-scrolly__panel-body">{stage.body}</p>
    </motion.article>
  )
}

export default PipelineScrolly
