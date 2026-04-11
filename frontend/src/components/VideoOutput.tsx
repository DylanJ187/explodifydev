// frontend/src/components/VideoOutput.tsx

interface Props {
  jobId: string
  aiStyled: boolean
}

export function VideoOutput({ jobId, aiStyled }: Props) {
  const videoUrl = `/jobs/${jobId}/video`
  const label = aiStyled ? 'AI STYLED VIDEO' : 'BASE RENDER'
  const badge = aiStyled ? 'FINAL OUTPUT' : 'UNSTYLED OUTPUT'

  return (
    <div className="video-output-section animate-fade-in">
      <div className="video-hero">
        <div className="video-hero-header">
          <div className="video-hero-title-row">
            <span className="video-hero-badge">{badge}</span>
            <span className="video-hero-title">{label}</span>
          </div>
          <a
            className="video-dl-btn"
            href={videoUrl}
            download={`explodify_${aiStyled ? 'styled' : 'base'}_${jobId}.mp4`}
          >
            ↓ Download
          </a>
        </div>
        <div className="video-hero-stage">
          <video
            src={videoUrl}
            controls
            autoPlay
            loop
            playsInline
            className="video-hero-player"
          />
        </div>
      </div>
    </div>
  )
}
