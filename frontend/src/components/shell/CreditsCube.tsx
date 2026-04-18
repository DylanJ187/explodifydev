import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

function WireCube() {
  const groupRef = useRef<THREE.Group>(null)
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), [])

  useFrame(() => {
    const g = groupRef.current
    if (!g) return
    g.rotation.y += 0.01
    g.rotation.x += 0.004
  })

  return (
    <group ref={groupRef}>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color="#d4a843" linewidth={1} />
      </lineSegments>
      <mesh>
        <boxGeometry args={[0.98, 0.98, 0.98]} />
        <meshBasicMaterial color="#d4a843" transparent opacity={0.05} />
      </mesh>
    </group>
  )
}

interface CreditsCubeProps {
  remaining: number
  total: number
  onClick?: () => void
}

export function CreditsCube({ remaining, total, onClick }: CreditsCubeProps) {
  const ratio = total > 0 ? remaining / total : 0
  const low = ratio < 0.3

  const body = (
    <>
      <span className="credits-cube__canvas-wrap" aria-hidden>
        <Canvas
          frameloop="always"
          dpr={[1, 1.5]}
          camera={{ position: [1.6, 1.3, 1.9], fov: 42 }}
          gl={{ antialias: true, alpha: true }}
        >
          <ambientLight intensity={0.6} />
          <WireCube />
        </Canvas>
      </span>
      <span className="credits-cube__label">
        {remaining} <span className="credits-cube__unit">cr</span>
      </span>
    </>
  )

  const className = `credits-cube ${low ? 'credits-cube--low' : ''}`

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        onClick={onClick}
        aria-label={`${remaining} credits remaining. Click to upgrade.`}
      >
        {body}
      </button>
    )
  }

  return (
    <div className={className} aria-label={`${remaining} credits remaining`}>
      {body}
    </div>
  )
}

export default CreditsCube
