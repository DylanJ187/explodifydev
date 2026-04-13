// frontend/src/components/LoadingOutput.tsx
import { useState, useEffect, useRef } from 'react'
import type { JobStatus } from '../api/client'

interface Props {
  phase: 'orientation' | 'pipeline' | 'styling'
  jobStatus: JobStatus | null
}

const ORIENTATION_PHRASES = [
  'Computing orientation views...',
  'Analyzing mesh geometry...',
  'Mapping cube faces...',
  'Casting geometry rays...',
  'Building face previews...',
]

const PIPELINE_PHRASES = [
  'Analyzing mesh geometry...',
  'Computing explosion vectors...',
  'Casting geometry rays...',
  'Tracing optimal view angles...',
  'Composing reference frames...',
  'Rendering keyframes...',
  'Building exploded assembly...',
  'Calibrating camera paths...',
  'Computing part displacements...',
  'Finalizing render pass...',
]


const STYLING_STAGES = [
  { key: 'upload',   label: 'UPLOAD',   sub: 'Sending to fal.ai' },
  { key: 'process',  label: 'PROCESS',  sub: 'Kling o1 applying style' },
  { key: 'download', label: 'DOWNLOAD', sub: 'Retrieving styled video' },
]

const TOTAL_STYLING_SECS = 180

function getPhaseDisplayName(jobStatus: JobStatus | null): string {
  if (!jobStatus) return 'INITIALISING'
  return jobStatus.current_phase_name?.toUpperCase() ?? 'PROCESSING'
}


function useStylingStage(active: boolean): string {
  const [stage, setStage] = useState('upload')
  const elapsed = useRef(0)

  useEffect(() => {
    if (!active) return
    const tick = setInterval(() => {
      elapsed.current += 1
      if (elapsed.current < 15) setStage('upload')
      else if (elapsed.current < 160) setStage('process')
      else setStage('download')
    }, 1000)
    return () => clearInterval(tick)
  }, [active])

  return stage
}

function useElapsedSeconds(active: boolean): number {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setSecs(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [active])
  return secs
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// ─── Styling-specific dramatic loader ────────────────────────────────────────
function StylingLoader() {
  const stage = useStylingStage(true)
  const elapsedSecs = useElapsedSeconds(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 45)
    return () => clearInterval(t)
  }, [])

  const stageIdx = STYLING_STAGES.findIndex(s => s.key === stage)
  const currentStage = STYLING_STAGES[stageIdx]

  // Logarithmic progress curve: jumps to ~40% quickly, then crawls toward 95%.
  // t is NOT capped at 1 so over-time renders keep crawling rather than freezing.
  const t = elapsedSecs / TOTAL_STYLING_SECS
  const progressPct = Math.min(95, t < 0.15
    ? t * 300          // 0-45% in first 27s
    : 45 + (1 - Math.exp(-4 * (t - 0.15))) * 50  // 45→95% asymptotic
  )

  const isOverTime = elapsedSecs > TOTAL_STYLING_SECS

  return (
    <div className="sl-root animate-fade-in">
      {/* Scan-line texture */}
      <div className="sl-scanlines" />

      {/* Top progress bar — full width, prominent */}
      <div className="sl-progress-rail">
        <div className="sl-progress-fill" style={{ width: `${progressPct}%` }}>
          <div className="sl-progress-glow" />
        </div>
      </div>

      {/* Header bar */}
      <div className="sl-header">
        <div className="sl-header-left">
          <span className="sl-dot" />
          <span className="sl-label">KLING O1 &nbsp;·&nbsp; FAL.AI</span>
        </div>
        <div className="sl-header-right">
          <span className={`sl-timer ${isOverTime ? 'sl-timer--over' : ''}`}>
            {formatTime(elapsedSecs)}
          </span>
          <span className="sl-label sl-label--dim">/ ~3:00</span>
        </div>
      </div>

      {/* Central content */}
      <div className="sl-body">
        {/* Phase title */}
        <div className="sl-title">AI&nbsp;STYLING</div>
        <div className="sl-subtitle">{currentStage?.sub}</div>

        {/* Time warning */}
        <div className={`sl-time-warning ${isOverTime ? 'sl-time-warning--over' : ''}`}>
          {isOverTime
            ? 'Running longer than expected — please wait'
            : 'This may take 2–3 minutes · do not close this window'}
        </div>

        {/* Waveform visualiser */}
        <div className="sl-wave">
          {Array.from({ length: 48 }, (_, i) => {
            const a = (i / 48) * Math.PI * 6 + tick * 0.15
            const b = (i / 48) * Math.PI * 3 + tick * 0.09
            const h = Math.abs(Math.sin(a) * 28 + Math.sin(b) * 14) + 3
            return (
              <div
                key={i}
                className="sl-wave-bar"
                style={{ height: `${h}px`, opacity: 0.25 + (h / 42) * 0.75 }}
              />
            )
          })}
        </div>

        {/* Progress percentage readout */}
        <div className="sl-pct-row">
          <span className="sl-pct-value">{Math.round(progressPct)}</span>
          <span className="sl-pct-unit">%</span>
        </div>
      </div>

      {/* Stage tracker */}
      <div className="sl-stages">
        {STYLING_STAGES.map((s, idx) => {
          const isDone = idx < stageIdx
          const isActive = idx === stageIdx
          return (
            <div key={s.key} className="sl-stage-item">
              {idx > 0 && (
                <div className={`sl-stage-line ${isDone ? 'sl-stage-line--done' : isActive ? 'sl-stage-line--active' : ''}`} />
              )}
              <div className={`sl-stage-node ${isActive ? 'sl-stage-node--active' : ''} ${isDone ? 'sl-stage-node--done' : ''}`}>
                {isDone ? '✓' : isActive ? <span className="sl-node-pulse" /> : <span className="sl-node-num">{idx + 1}</span>}
              </div>
              <div className="sl-stage-meta">
                <span className={`sl-stage-name ${isActive ? 'sl-stage-name--active' : ''} ${isDone ? 'sl-stage-name--done' : ''}`}>
                  {s.label}
                </span>
                <span className="sl-stage-sub">{s.sub}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="sl-footer">
        <span className="sl-footer-dot" />
        FAL credits are being consumed &nbsp;·&nbsp; do not close this window
      </div>
    </div>
  )
}

// ─── Standard pipeline / orientation loader ───────────────────────────────────
function StandardLoader({ phase, jobStatus }: { phase: 'orientation' | 'pipeline', jobStatus: JobStatus | null }) {
  const phrases = phase === 'orientation' ? ORIENTATION_PHRASES : PIPELINE_PHRASES
  const [phraseIndex, setPhraseIndex] = useState(0)
  const [fading, setFading] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setFading(true)
      setTimeout(() => {
        setPhraseIndex(i => (i + 1) % phrases.length)
        setFading(false)
      }, 150)
    }, 1800)
    return () => clearInterval(timer)
  }, [phrases.length])

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 50)
    return () => clearInterval(t)
  }, [])

  const displayName = phase === 'orientation' ? 'ORIENTATION' : getPhaseDisplayName(jobStatus)
  const displayDetail = phase === 'orientation' ? 'Computing 6 face previews' : (jobStatus?.current_phase_name ?? '')

  return (
    <div className="pl-root animate-fade-in">
      <div className="pl-body">
        {/* Phase name + detail */}
        <div className="pl-phase-block">
          <div className="pl-phase-name">{displayName}</div>
          {displayDetail && <div className="pl-phase-detail">{displayDetail}</div>}
        </div>

        {/* Animated waveform bars */}
        <div className="pl-wave">
          {Array.from({ length: 24 }, (_, i) => {
            const a = (i / 24) * Math.PI * 4 + tick * 0.14
            const h = Math.abs(Math.sin(a) * 22) + 4
            return (
              <div
                key={i}
                className="pl-wave-bar"
                style={{ height: `${h}px`, opacity: 0.2 + (h / 26) * 0.8 }}
              />
            )
          })}
        </div>

        {/* Cycling phrase */}
        <div className={`pl-phrase ${fading ? 'pl-phrase--fade' : ''}`}>
          {phrases[phraseIndex]}
        </div>

      </div>
    </div>
  )
}

export function LoadingOutput({ phase, jobStatus }: Props) {
  if (phase === 'styling') return <StylingLoader />
  return <StandardLoader phase={phase} jobStatus={jobStatus} />
}
