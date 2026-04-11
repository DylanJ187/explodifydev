// frontend/src/components/IdleOutput.tsx

export function IdleOutput() {
  return (
    <div className="idle-output">
      <div className="idle-grid-bg" />
      <div className="idle-content animate-fade-in">
        <div className="idle-diagram">
          <div className="idle-ring" />
          <div className="idle-ring-inner" />
          <div className="idle-crosshair">
            <div className="idle-dot" />
          </div>
        </div>
        <p className="idle-title">No file loaded</p>
        <p className="idle-hint">
          Drop a CAD file on the left or load<br />
          the sample to generate an exploded<br />
          view with reference keyframes.
        </p>
      </div>
    </div>
  )
}
