// frontend/src/components/PipelineProgress.tsx
import type { JobStatus } from '../api/client'

const PHASES = [
  { id: 1, name: 'Geometric Analysis',   icon: '🔬', detail: 'Ray-casting optimal angle + explosion vectors' },
  { id: 2, name: 'Rendering Keyframes',  icon: '📷', detail: '3 PNG snapshots at 0%, 50%, 100% explosion' },
  { id: 3, name: 'AI Stylization',       icon: '✨', detail: 'Gemini Flash photorealistic rendering' },
  { id: 4, name: 'Video Synthesis',      icon: '🎬', detail: 'fal.ai Kling keyframe-anchored animation' },
]

interface Props {
  job: JobStatus
}

export function PipelineProgress({ job }: Props) {
  return (
    <div className="w-full max-w-xl flex flex-col gap-3">
      {PHASES.map((phase) => {
        const status = job.phases[phase.id] ?? 'pending'
        return (
          <div key={phase.id}
            className={`
              flex items-center gap-4 rounded-xl p-4 border transition-all
              ${status === 'done'    ? 'border-green-200 bg-green-50'  : ''}
              ${status === 'running' ? 'border-blue-300 bg-blue-50 shadow-sm' : ''}
              ${status === 'pending' ? 'border-gray-200 bg-gray-50 opacity-60' : ''}
              ${status === 'error'   ? 'border-red-200 bg-red-50'   : ''}
            `}
          >
            <span className="text-2xl">{phase.icon}</span>
            <div className="flex-1 min-w-0">
              <p className={`font-medium text-sm ${status === 'running' ? 'text-blue-700' : 'text-gray-700'}`}>
                {phase.name}
              </p>
              <p className="text-xs text-gray-400 truncate">{phase.detail}</p>
            </div>
            <StatusBadge status={status} />
          </div>
        )
      })}
      {job.error && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          <strong>Error:</strong> {job.error}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'done')    return <span className="text-green-600 text-lg">✓</span>
  if (status === 'running') return <Spinner />
  if (status === 'error')   return <span className="text-red-500 text-lg">✗</span>
  return <span className="w-4 h-4 rounded-full border-2 border-gray-300" />
}

function Spinner() {
  return (
    <svg className="animate-spin w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
