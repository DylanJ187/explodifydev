// frontend/src/components/LoadingOutput.tsx
import type { JobStatus } from '../api/client'

interface Props {
  phase: 'orientation' | 'pipeline' | 'styling'
  jobStatus: JobStatus | null
}

const PHASE_HEADLINE: Record<Props['phase'], string> = {
  orientation: 'Reading geometry',
  pipeline:    'Rendering explosion',
  styling:     'AI styling',
}

const PHASE_SUB: Record<Props['phase'], string> = {
  orientation: 'Detecting parts and orientation',
  pipeline:    'pyrender · 72 frames @ 24 fps',
  styling:     'Kling o1 video-to-video edit',
}

/** 2x2x2 sub-cube assembly that rotates continuously and cyclically
 *  explodes outward then reassembles — themed on exploded CAD views. */
function ExplodeCube() {
  const pieces = [0, 1, 2, 3, 4, 5, 6, 7] // 2^3 = 8 octants
  return (
    <div className="explode-stage" aria-hidden>
      <div className="explode-rotor">
        {pieces.map(i => (
          <div key={i} className={`explode-piece explode-piece--${i}`}>
            <span className="explode-face explode-face--front" />
            <span className="explode-face explode-face--back" />
            <span className="explode-face explode-face--right" />
            <span className="explode-face explode-face--left" />
            <span className="explode-face explode-face--top" />
            <span className="explode-face explode-face--bottom" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function LoadingOutput({ phase, jobStatus }: Props) {
  const headline = PHASE_HEADLINE[phase]
  const sub = PHASE_SUB[phase]
  const step = jobStatus?.current_phase_name ?? null
  const currentPhase = jobStatus?.current_phase ?? (phase === 'orientation' ? 0 : 1)

  return (
    <div className="loading-output animate-fade-in">
      <div className="loading-output-inner">

        <div className="loading-visual">
          <ExplodeCube />
        </div>

        <div className="loading-text">
          <div className="loading-headline">{headline}</div>
          <div className="loading-sub">{sub}</div>
          {step && (
            <div className="loading-step">
              <span className="loading-step-tag">STEP {currentPhase}/4</span>
              <span className="loading-step-name">{step}</span>
            </div>
          )}
        </div>

        <div className="loading-phases">
          {[1, 2, 3, 4].map(p => {
            const status = jobStatus?.phases?.[p]
            const isDone = status === 'done'
            const isRunning = status === 'running'
            const isError = status === 'error'
            const cls = [
              'loading-phase',
              isDone ? 'loading-phase--done' : '',
              isRunning ? 'loading-phase--running' : '',
              isError ? 'loading-phase--error' : '',
            ].filter(Boolean).join(' ')
            return (
              <div key={p} className={cls}>
                <span className="loading-phase-num">{p}</span>
              </div>
            )
          })}
        </div>

      </div>
    </div>
  )
}
