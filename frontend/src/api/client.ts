// frontend/src/api/client.ts

export interface PhaseStatus {
  [phase: number]: 'pending' | 'running' | 'done' | 'error'
}

export interface JobStatus {
  job_id: string
  status: 'queued' | 'running' | 'awaiting_approval' | 'done' | 'error'
  current_phase: number
  current_phase_name: string
  phases: PhaseStatus
  error: string | null
}

export type FaceName =
  | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'

export interface PreviewResult {
  preview_id: string
  images: Record<FaceName, string>
}

export async function getPreviewImages(file: File): Promise<PreviewResult> {
  const form = new FormData()
  form.append('file', file)
  const resp = await fetch('/preview', { method: 'POST', body: form })
  if (!resp.ok) {
    const detail = await resp.json().catch(() => ({ detail: resp.statusText }))
    throw new Error(detail.detail ?? resp.statusText)
  }
  return resp.json()
}

export async function createJob(
  options: {
    previewId: string
    explodeScalar: number
    materialPrompt: string
    stylePrompt: string
    studioLighting: boolean
    darkBackdrop: boolean
    whiteBackdrop: boolean
    warmTone: boolean
    coldTone: boolean
    groundShadow: boolean
    masterAngle: FaceName
    rotationOffsetDeg: number
    orbitRangeDeg: number
  },
): Promise<string> {
  const form = new FormData()
  form.append('preview_id', options.previewId)
  form.append('explode_scalar', String(options.explodeScalar))
  form.append('material_prompt', options.materialPrompt)
  form.append('style_prompt', options.stylePrompt)
  form.append('studio_lighting', String(options.studioLighting))
  form.append('dark_backdrop', String(options.darkBackdrop))
  form.append('white_backdrop', String(options.whiteBackdrop))
  form.append('warm_tone', String(options.warmTone))
  form.append('cold_tone', String(options.coldTone))
  form.append('ground_shadow', String(options.groundShadow))
  form.append('master_angle', options.masterAngle)
  form.append('rotation_offset_deg', String(options.rotationOffsetDeg))
  form.append('orbit_range_deg', String(options.orbitRangeDeg))

  const resp = await fetch('/jobs', { method: 'POST', body: form })
  if (!resp.ok) throw new Error(`Job creation failed: ${resp.statusText}`)
  const data = await resp.json()
  return data.job_id as string
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const resp = await fetch(`/jobs/${jobId}`)
  if (!resp.ok) throw new Error(`Status check failed: ${resp.statusText}`)
  return resp.json()
}

export async function approvePhase4(jobId: string): Promise<void> {
  const resp = await fetch(`/jobs/${jobId}/approve`, { method: 'POST' })
  if (!resp.ok) throw new Error(`Approval failed: ${resp.statusText}`)
}

