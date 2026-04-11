// frontend/src/components/VideoPlaceholder.tsx

export function VideoPlaceholder() {
  return (
    <div className="video-section">
      <div className="video-header">
        <span className="video-title">Animation</span>
        <span className="video-badge">Phase 3 + 4 pending</span>
      </div>

      <div className="video-frame">
        <div className="video-grid-bg" />
        <div className="video-placeholder-inner">
          <div className="pipeline-chain">
            <span className="chain-step chain-step--done">Keyframes</span>
            <span className="chain-arrow">→</span>
            <span className="chain-step chain-step--pending">Gemini Stylize</span>
            <span className="chain-arrow">→</span>
            <span className="chain-step chain-step--pending">Kling Video</span>
          </div>
          <p className="video-placeholder-msg">
            AI stylization + video synthesis coming in phase 3 &amp; 4
          </p>
        </div>
      </div>
    </div>
  )
}
