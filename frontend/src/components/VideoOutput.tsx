// frontend/src/components/VideoOutput.tsx
import { useState } from 'react'
import type { VariantName } from '../api/client'

interface Props {
  jobId: string
  aiStyled: boolean
  selectedVariants: VariantName[]
}

const VARIANT_LABELS: Record<VariantName, string> = {
  longest: 'LONGEST AXIS',
  shortest: 'SHORTEST AXIS',
}

interface VariantCardProps {
  jobId: string
  variant: VariantName
  aiStyled: boolean
}

function VariantCard({ jobId, variant, aiStyled }: VariantCardProps) {
  const [showLoop, setShowLoop] = useState(false)
  const videoUrl = `/jobs/${jobId}/video/${variant}`
  const loopUrl = `/jobs/${jobId}/loop_video/${variant}`
  const activeSrc = showLoop ? loopUrl : videoUrl

  return (
    <div className="video-variant-card">
      <div className="video-variant-header">
        <span className="video-variant-label">{VARIANT_LABELS[variant]}</span>
        <button
          className="video-loop-toggle"
          onClick={() => setShowLoop(v => !v)}
        >
          {showLoop ? 'One-shot' : 'Loop'}
        </button>
        <a
          className="video-dl-btn"
          href={activeSrc}
          download={`explodify_${variant}_${aiStyled ? 'styled' : 'base'}_${jobId}.mp4`}
        >
          ↓ Download
        </a>
      </div>
      <div className="video-hero-stage">
        <video
          src={activeSrc}
          controls
          autoPlay
          loop
          muted
          playsInline
          className="video-hero-player"
        />
      </div>
    </div>
  )
}

export function VideoOutput({ jobId, aiStyled, selectedVariants }: Props) {
  const badge = aiStyled ? 'FINAL OUTPUT' : 'UNSTYLED OUTPUT'
  const label = aiStyled ? 'AI STYLED VIDEO' : 'BASE RENDER'
  const isSingle = selectedVariants.length === 1

  return (
    <div className="video-output-section animate-fade-in">
      <div className="video-hero">
        <div className="video-hero-header">
          <div className="video-hero-title-row">
            <span className="video-hero-badge">{badge}</span>
            <span className="video-hero-title">{label}</span>
          </div>
        </div>

        <div className={isSingle ? 'video-single-layout' : 'video-dual-layout'}>
          {selectedVariants.map(variant => (
            <VariantCard
              key={variant}
              jobId={jobId}
              variant={variant}
              aiStyled={aiStyled}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
