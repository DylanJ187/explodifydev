// frontend/src/components/FramesOutput.tsx

const FRAMES = [
  { name: 'frame_a', pct: '0%',   label: 'Assembled' },
  { name: 'frame_b', pct: '25%',  label: '25%' },
  { name: 'frame_c', pct: '50%',  label: '50%' },
  { name: 'frame_d', pct: '75%',  label: '75%' },
  { name: 'frame_e', pct: '100%', label: 'Exploded' },
] as const

interface Props {
  jobId: string
}

export function FramesOutput({ jobId }: Props) {
  return (
    <div className="frames-output">
      <div className="frames-header">
        <span className="frames-title">Keyframes</span>
        <span className="frames-meta">5 frames · 0% → 100%</span>
      </div>

      {/* Explosion continuum label */}
      <div className="frames-timeline">
        {FRAMES.map((f) => (
          <div key={f.name} className="timeline-mark">
            <span className={f.pct === '0%' || f.pct === '100%' ? 'timeline-mark--accent' : ''}>
              {f.pct}
            </span>
          </div>
        ))}
      </div>

      <div className="frames-grid">
        {FRAMES.map((f) => (
          <div key={f.name} className="frame-card">
            <div className="frame-img-wrap">
              <img
                src={`/jobs/${jobId}/frames/${f.name}`}
                alt={`${f.label} — ${f.pct} explosion`}
                className="frame-img"
              />
            </div>
            <p className="frame-label">{f.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
