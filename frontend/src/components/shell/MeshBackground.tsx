import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface DisplacedPlaneProps {
  width: number
  height: number
  segments: number
}

function DisplacedPlane({ width, height, segments }: DisplacedPlaneProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const geometry = useMemo(
    () => new THREE.PlaneGeometry(width, height, segments, segments),
    [width, height, segments],
  )
  const basePositions = useMemo(() => {
    const attr = geometry.getAttribute('position') as THREE.BufferAttribute
    return Float32Array.from(attr.array as Float32Array)
  }, [geometry])

  useFrame(({ clock }) => {
    const mesh = meshRef.current
    if (!mesh) return
    const t = clock.getElapsedTime() * 0.45
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    const arr = pos.array as Float32Array
    for (let i = 0; i < arr.length; i += 3) {
      const x = basePositions[i]
      const y = basePositions[i + 1]
      const z =
        Math.sin(x * 0.3 + t) +
        Math.sin(y * 0.2 + t * 0.7) +
        Math.sin((x + y) * 0.15 - t * 0.5)
      arr[i + 2] = z * 0.6
    }
    pos.needsUpdate = true
  })

  return (
    <mesh ref={meshRef} geometry={geometry} rotation={[-Math.PI / 3.2, 0, 0]} position={[0, -2, 0]}>
      <meshBasicMaterial
        color="#d4a843"
        wireframe
        transparent
        opacity={0.18}
        depthWrite={false}
      />
    </mesh>
  )
}

interface MeshBackgroundProps {
  className?: string
}

export function MeshBackground({ className }: MeshBackgroundProps) {
  return (
    <div className={`mesh-bg ${className ?? ''}`} aria-hidden>
      <div className="mesh-bg__gradient" />
      <Canvas
        className="mesh-bg__canvas"
        frameloop="always"
        dpr={[1, 1.5]}
        camera={{ position: [0, 4, 12], fov: 55 }}
        gl={{ antialias: true, alpha: true }}
      >
        <DisplacedPlane width={38} height={38} segments={80} />
      </Canvas>
    </div>
  )
}

export default MeshBackground
