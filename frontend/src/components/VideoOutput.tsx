// frontend/src/components/VideoOutput.tsx

interface Props {
  jobId: string
  showBase?: boolean
}

export function VideoOutput({ jobId, showBase = false }: Props) {
  const styledUrl = `/jobs/${jobId}/video`
  const baseUrl = `/jobs/${jobId}/base_video`

  return (
    <div className="video-output-section">

      {/* Hero: styled video */}
      <div className="video-hero">
        <div className="video-hero-header">
          <div className="video-hero-title-row">
            <span className="video-hero-badge">FINAL OUTPUT</span>
            <span className="video-hero-title">AI STYLED VIDEO</span>
          </div>
          <a
            className="video-dl-btn"
            href={styledUrl}
            download={`explodify_styled_${jobId}.mp4`}
          >
            ↓ Download
          </a>
        </div>
        <div className="video-hero-stage">
          <video
            src={styledUrl}
            controls
            autoPlay
            loop
            playsInline
            className="video-hero-player"
          />
        </div>
      </div>

      {/* Comparison: base video */}
      {showBase && (
        <div className="video-compare">
          <div className="video-compare-divider">
            <span className="video-compare-label">BASE RENDER · BEFORE STYLING</span>
            <div className="video-compare-line" />
            <a
              className="video-compare-dl"
              href={baseUrl}
              download={`explodify_base_${jobId}.mp4`}
            >
              ↓ mp4
            </a>
          </div>
          <div className="video-compare-player-wrap">
            <video
              src={baseUrl}
              controls
              loop
              playsInline
              className="video-compare-player"
            />
          </div>
        </div>
      )}

    </div>
  )
}
