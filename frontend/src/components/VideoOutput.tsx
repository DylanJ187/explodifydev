// frontend/src/components/VideoOutput.tsx

interface Props {
  jobId: string
  showBase?: boolean
}

export function VideoOutput({ jobId, showBase = false }: Props) {
  const styledUrl = `/jobs/${jobId}/video`
  const baseUrl = `/jobs/${jobId}/base_video`

  return (
    <div className="video-output">
      <div className="video-block">
        <div className="video-output-header">
          <span className="section-label">Styled Video</span>
          <a
            className="video-download-btn"
            href={styledUrl}
            download={`explodify_styled_${jobId}.mp4`}
          >
            Download mp4
          </a>
        </div>
        <div className="video-player-wrap">
          <video
            src={styledUrl}
            controls
            autoPlay
            loop
            playsInline
            className="video-player"
          />
        </div>
      </div>

      {showBase && (
        <div className="video-block">
          <div className="video-output-header">
            <span className="section-label">Base Video (unstyled)</span>
            <a
              className="video-download-btn"
              href={baseUrl}
              download={`explodify_base_${jobId}.mp4`}
            >
              Download mp4
            </a>
          </div>
          <div className="video-player-wrap">
            <video
              src={baseUrl}
              controls
              loop
              playsInline
              className="video-player"
            />
          </div>
        </div>
      )}
    </div>
  )
}
