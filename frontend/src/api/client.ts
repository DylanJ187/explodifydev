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

export type ModelTier = 'standard' | 'high_quality' | 'premium'

export const MODEL_TIER_CREDITS: Record<ModelTier, number> = {
  standard: 5,
  high_quality: 15,
  premium: 30,
}

export const MODEL_TIER_LABELS: Record<ModelTier, string> = {
  standard: 'Standard Quality',
  high_quality: 'High Quality',
  premium: 'Maximum Quality',
}

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
    modelTier?: ModelTier
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
  if (options.modelTier) {
    form.append('model_tier', options.modelTier)
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
    modelTier?: ModelTier
  },
): Promise<string> {
  const form = new FormData()
  form.append('component_rows', JSON.stringify(options.rows))
  form.append('style_prompt', options.stylePrompt)
  form.append('selected_variants', options.selectedVariants.join(','))
  if (options.modelTier) {
    form.append('model_tier', options.modelTier)
  }
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
    await throwGalleryError(resp)
  }
  return resp.json()
}

export async function createGalleryLoop(
  itemId: string,
  title?: string,
): Promise<GalleryItem> {
  const form = new FormData()
  if (title) form.append('title', title)
  const resp = await fetch(`/gallery/${itemId}/loop`, { method: 'POST', body: form })
  if (!resp.ok) {
    await throwGalleryError(resp)
  }
  return resp.json()
}

// ── Save / capacity / favorite ──────────────────────────────────────────────

export type GalleryTier = 'free' | 'pro' | 'studio'

export interface GalleryStats {
  count: number
  cap: number
  tier: GalleryTier
}

export class GalleryFullError extends Error {
  readonly savedCount: number
  readonly cap: number
  readonly tier: GalleryTier
  constructor(savedCount: number, cap: number, tier: GalleryTier) {
    super(`Gallery full: ${savedCount}/${cap} (${tier})`)
    this.name = 'GalleryFullError'
    this.savedCount = savedCount
    this.cap = cap
    this.tier = tier
  }
}

async function throwGalleryError(resp: Response): Promise<never> {
  const body = await resp.json().catch(() => null)
  const detail = body?.detail
  if (resp.status === 409 && detail && typeof detail === 'object' && detail.error === 'gallery_full') {
    throw new GalleryFullError(
      Number(detail.saved_count ?? 0),
      Number(detail.cap ?? 0),
      (detail.tier ?? 'free') as GalleryTier,
    )
  }
  const message = typeof detail === 'string' ? detail : detail?.error ?? resp.statusText
  throw new Error(message)
}

export async function getGalleryStats(): Promise<GalleryStats> {
  const resp = await fetch('/gallery/stats')
  if (!resp.ok) throw new Error(`Gallery stats failed: ${resp.statusText}`)
  return resp.json()
}

export async function saveToGallery(options: {
  jobId: string
  variant: VariantName
  kind: Exclude<GalleryKind, 'stitched' | 'loop'>
  title?: string
}): Promise<GalleryItem> {
  const form = new FormData()
  form.append('job_id', options.jobId)
  form.append('variant', options.variant)
  form.append('kind', options.kind)
  if (options.title) form.append('title', options.title)
  const resp = await fetch('/gallery', { method: 'POST', body: form })
  if (!resp.ok) await throwGalleryError(resp)
  return resp.json()
}

export async function replaceGalleryItem(options: {
  replaceId: string
  jobId: string
  variant: VariantName
  kind: Exclude<GalleryKind, 'stitched' | 'loop'>
  title?: string
}): Promise<GalleryItem> {
  const form = new FormData()
  form.append('replace_id', options.replaceId)
  form.append('job_id', options.jobId)
  form.append('variant', options.variant)
  form.append('kind', options.kind)
  if (options.title) form.append('title', options.title)
  const resp = await fetch('/gallery/replace', { method: 'POST', body: form })
  if (!resp.ok) await throwGalleryError(resp)
  return resp.json()
}

export async function toggleFavorite(
  itemId: string,
  favorite: boolean,
): Promise<GalleryItem> {
  const form = new FormData()
  form.append('favorite', String(favorite))
  const resp = await fetch(`/gallery/${itemId}/favorite`, { method: 'POST', body: form })
  if (!resp.ok) throw new Error(`Favorite toggle failed: ${resp.statusText}`)
  return resp.json()
}

export function galleryVideoUrl(itemId: string): string {
  return `/gallery/${itemId}/video`
}

export function galleryThumbnailUrl(itemId: string): string {
  return `/gallery/${itemId}/thumbnail`
}

// ── Account / Profile ───────────────────────────────────────────────────────

export interface AccountProfile {
  user_id: string
  full_name: string | null
  username: string | null
  email: string | null
  phone: string | null
  avatar_path: string | null
  work_type: string | null
  axis_preference: string | null
  render_prefs: string | null
  preferences: Record<string, Record<string, boolean | string>>
  created_at: number
  updated_at: number
}

export interface AccountUpdate {
  full_name?: string
  username?: string
  email?: string
  phone?: string
  work_type?: string
  axis_preference?: string
  render_prefs?: string
  preferences?: Record<string, Record<string, boolean | string>>
  avatar?: File
}

export async function getAccount(): Promise<AccountProfile> {
  const resp = await fetch('/account/me')
  if (!resp.ok) throw new Error(`Account load failed: ${resp.statusText}`)
  return resp.json()
}

export async function updateAccount(fields: AccountUpdate): Promise<AccountProfile> {
  const form = new FormData()
  if (fields.full_name       !== undefined) form.append('full_name',       fields.full_name)
  if (fields.username        !== undefined) form.append('username',        fields.username)
  if (fields.email           !== undefined) form.append('email',           fields.email)
  if (fields.phone           !== undefined) form.append('phone',           fields.phone)
  if (fields.work_type       !== undefined) form.append('work_type',       fields.work_type)
  if (fields.axis_preference !== undefined) form.append('axis_preference', fields.axis_preference)
  if (fields.render_prefs    !== undefined) form.append('render_prefs',    fields.render_prefs)
  if (fields.preferences     !== undefined) form.append('preferences',     JSON.stringify(fields.preferences))
  if (fields.avatar)                        form.append('avatar',          fields.avatar)

  const resp = await fetch('/account', { method: 'POST', body: form })
  if (!resp.ok) {
    const body = await resp.json().catch(() => null)
    throw new Error(body?.detail ?? resp.statusText)
  }
  return resp.json()
}

export async function signOutEverywhere(): Promise<void> {
  const resp = await fetch('/account/signout-all', { method: 'POST' })
  if (!resp.ok) throw new Error(`Sign out failed: ${resp.statusText}`)
}

export function avatarUrl(bust?: number): string {
  return bust ? `/account/avatar?v=${bust}` : '/account/avatar'
}

// ── Approval ────────────────────────────────────────────────────────────────

export async function approvePhase4(
  jobId: string,
  selectedVariants: VariantName[],
  styleOpts?: {
    rows: Row[]
    stylePrompt: string
    modelTier?: ModelTier
  },
): Promise<void> {
  const form = new FormData()
  form.append('selected_variants', selectedVariants.join(','))
  if (styleOpts) {
    form.append('component_rows', JSON.stringify(styleOpts.rows))
    form.append('style_prompt', styleOpts.stylePrompt)
    if (styleOpts.modelTier) {
      form.append('model_tier', styleOpts.modelTier)
    }
  }
  const resp = await fetch(`/jobs/${jobId}/approve`, { method: 'POST', body: form })
  if (!resp.ok) throw new Error(`Approval failed: ${resp.statusText}`)
}

