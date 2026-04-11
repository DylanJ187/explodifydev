// frontend/src/App.tsx
import { useState, useEffect, useRef } from 'react'
import { UploadZone } from './components/UploadZone'
import { PromptInput } from './components/PromptInput'
import { PipelineProgress } from './components/PipelineProgress'
import { VideoPreview } from './components/VideoPreview'
import { createJob, getJobStatus } from './api/client'
import type { JobStatus } from './api/client'

type AppState = 'idle' | 'uploading' | 'processing' | 'done' | 'error'

export default function App() {
  const [state, setState] = useState<AppState>('idle')
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)
  const [stylePrompt, setStylePrompt] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function handleUpload(file: File, scalar: number) {
    try {
      setState('uploading')
      const id = await createJob(file, scalar, stylePrompt)
      setJobId(id)
      setState('processing')
    } catch {
      setState('error')
    }
  }

  useEffect(() => {
    if (state !== 'processing' || !jobId) return

    pollRef.current = setInterval(async () => {
      try {
        const status = await getJobStatus(jobId)
        setJobStatus(status)
        if (status.status === 'done') {
          setState('done')
          clearInterval(pollRef.current!)
        } else if (status.status === 'error') {
          setState('error')
          clearInterval(pollRef.current!)
        }
      } catch {
        // keep polling on transient errors
      }
    }, 2000)

    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [state, jobId])

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-start px-4 py-16 gap-10">
      <header className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">Explodify</h1>
        <p className="text-gray-500 mt-2">CAD file → studio-grade exploded-view animation</p>
      </header>

      {(state === 'idle' || state === 'uploading') && (
        <>
          <PromptInput
            value={stylePrompt}
            onChange={setStylePrompt}
            disabled={state === 'uploading'}
          />
          <UploadZone onUpload={handleUpload} disabled={state === 'uploading'} />
        </>
      )}

      {(state === 'processing' || state === 'error') && jobStatus && (
        <PipelineProgress job={jobStatus} />
      )}

      {state === 'done' && jobId && (
        <>
          <VideoPreview jobId={jobId} />
          <button
            onClick={() => {
              setState('idle')
              setJobId(null)
              setJobStatus(null)
              setStylePrompt('')
            }}
            className="text-sm text-gray-400 hover:text-gray-600 underline"
          >
            Upload another file
          </button>
        </>
      )}
    </div>
  )
}
