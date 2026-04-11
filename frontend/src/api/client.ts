// frontend/src/api/client.ts

export interface PhaseStatus {
  [phase: number]: 'pending' | 'running' | 'done' | 'error'
}

export interface JobStatus {
  job_id: string
  status: 'queued' | 'running' | 'done' | 'error'
  current_phase: number
  current_phase_name: string
  phases: PhaseStatus
  error: string | null
  video_url: string | null
}

export async function createJob(
  file: File,
  explodeScalar: number,
  stylePrompt: string,
): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  form.append('explode_scalar', String(explodeScalar))
  form.append('style_prompt', stylePrompt)

  const resp = await fetch('/jobs', { method: 'POST', body: form })
  if (!resp.ok) throw new Error(`Upload failed: ${resp.statusText}`)
  const data = await resp.json()
  return data.job_id as string
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const resp = await fetch(`/jobs/${jobId}`)
  if (!resp.ok) throw new Error(`Status check failed: ${resp.statusText}`)
  return resp.json()
}

export function getVideoUrl(jobId: string): string {
  return `/jobs/${jobId}/video`
}
