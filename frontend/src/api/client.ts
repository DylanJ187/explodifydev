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
  ai_styled: boolean
  has_dual_variants: boolean
}

export type FaceName =
  | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'

export type VariantName = 'x' | 'y' | 'z'

export interface ExplosionAxes {
  x: [number, number, number]
  y: [number, number, number]
  z: [number, number, number]
}

export interface PreviewResult {
  preview_id: string
  images: Record<FaceName, string>
  component_names: string[]
  explosion_axes: ExplosionAxes
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

interface Row {
  part: string
  material: string
}

export type LoopMode = 'standard' | 'loop-preview'

export type GalleryKind = 'base' | 'styled' | 'stitched' | 'loop'

export interface GalleryItem {
  id: string
  job_id: string | null
  variant: string | null
  kind: GalleryKind
  title: string
  video_path: string
  thumbnail_path: string | null
  duration_s: number | null
  created_at: number
  metadata: Record<string, unknown>
}

export async function createJob(
  options: {
    previewId: string
    explodeScalar: number
    rows: Row[]
    stylePrompt: string
    cameraDirection: [number, number, number]
    rotationOffsetDeg: number
    orbitRangeDeg: number
    cameraZoom: number
    selectedVariant: VariantName
    easingCurve: number[]
    orbitMode?: string
    orbitDirection?: 1 | -1
    orbitEasingCurve?: number[]
    variantsToRender?: VariantName[]
    loopMode?: LoopMode
  },
): Promise<string> {
  const form = new FormData()
  form.append('preview_id', options.previewId)
  form.append('explode_scalar', String(options.explodeScalar))
  form.append('component_rows', JSON.stringify(options.rows))
  form.append('style_prompt', options.stylePrompt)
  form.append('camera_direction', JSON.stringify(options.cameraDirection))
  form.append('rotation_offset_deg', String(options.rotationOffsetDeg))
  form.append('orbit_range_deg', String(options.orbitRangeDeg))
  form.append('camera_zoom', String(options.cameraZoom))
  form.append('selected_variant', options.selectedVariant)
  form.append('easing_curve', JSON.stringify(options.easingCurve))
  if (options.orbitMode) {
    form.append('orbit_mode', options.orbitMode)
  }
  if (options.orbitDirection !== undefined) {
    form.append('orbit_direction', String(options.orbitDirection))
  }
  if (options.orbitEasingCurve) {
    form.append('orbit_easing', JSON.stringify(options.orbitEasingCurve))
  }
  if (options.variantsToRender) {
    form.append('variants_to_render', options.variantsToRender.join(','))
  }
  if (options.loopMode) {
    form.append('loop_mode', options.loopMode)
  }

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

export async function restyleJob(
  sourceJobId: string,
  options: {
    rows: Row[]
    stylePrompt: string
    selectedVariants: VariantName[]
  },
): Promise<string> {
  const form = new FormData()
  form.append('component_rows', JSON.stringify(options.rows))
  form.append('style_prompt', options.stylePrompt)
  form.append('selected_variants', options.selectedVariants.join(','))
  const resp = await fetch(`/jobs/${sourceJobId}/restyle`, { method: 'POST', body: form })
  if (!resp.ok) {
    const detail = await resp.json().catch(() => ({ detail: resp.statusText }))
    throw new Error(detail.detail ?? resp.statusText)
  }
  const data = await resp.json()
  return data.job_id as string
}

export async function fetchPreviewFrame(
  options: {
    previewId: string
    cameraDirection: [number, number, number]
  },
  signal?: AbortSignal,
): Promise<string> {
  const form = new FormData()
  form.append('preview_id', options.previewId)
  form.append('camera_direction', JSON.stringify(options.cameraDirection))
  const resp = await fetch('/preview/frame', { method: 'POST', body: form, signal })
  if (!resp.ok) throw new Error(`Preview frame render failed: ${resp.statusText}`)
  const blob = await resp.blob()
  return URL.createObjectURL(blob)
}

// ── Gallery & stitch API ────────────────────────────────────────────────────

export async function listGallery(kind?: GalleryKind): Promise<GalleryItem[]> {
  const url = kind ? `/gallery?kind=${encodeURIComponent(kind)}` : '/gallery'
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Gallery list failed: ${resp.statusText}`)
  const data = await resp.json()
  return (data.items ?? []) as GalleryItem[]
}

export async function deleteGalleryItem(itemId: string): Promise<void> {
  const resp = await fetch(`/gallery/${itemId}`, { method: 'DELETE' })
  if (!resp.ok) throw new Error(`Gallery delete failed: ${resp.statusText}`)
}

export async function renameGalleryItem(itemId: string, title: string): Promise<void> {
  const form = new FormData()
  form.append('title', title)
  const resp = await fetch(`/gallery/${itemId}/rename`, { method: 'POST', body: form })
  if (!resp.ok) throw new Error(`Gallery rename failed: ${resp.statusText}`)
}

export async function stitchGalleryItems(
  itemIds: string[],
  title?: string,
): Promise<GalleryItem> {
  const form = new FormData()
  form.append('item_ids', JSON.stringify(itemIds))
  if (title) form.append('title', title)
  const resp = await fetch('/stitch', { method: 'POST', body: form })
  if (!resp.ok) {
    const detail = await resp.json().catch(() => ({ detail: resp.statusText }))
    throw new Error(detail.detail ?? resp.statusText)
  }
  return resp.json()
}

export function galleryVideoUrl(itemId: string): string {
  return `/gallery/${itemId}/video`
}

export function galleryThumbnailUrl(itemId: string): string {
  return `/gallery/${itemId}/thumbnail`
}

// ── Approval ────────────────────────────────────────────────────────────────

export async function approvePhase4(
  jobId: string,
  selectedVariants: VariantName[],
  styleOpts?: {
    rows: Row[]
    stylePrompt: string
  },
): Promise<void> {
  const form = new FormData()
  form.append('selected_variants', selectedVariants.join(','))
  if (styleOpts) {
    form.append('component_rows', JSON.stringify(styleOpts.rows))
    form.append('style_prompt', styleOpts.stylePrompt)
  }
  const resp = await fetch(`/jobs/${jobId}/approve`, { method: 'POST', body: form })
  if (!resp.ok) throw new Error(`Approval failed: ${resp.statusText}`)
}

