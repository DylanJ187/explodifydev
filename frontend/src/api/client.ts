// frontend/src/api/client.ts

import { authFetch } from './authFetch'

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
  eta_seconds: number | null
  started_at: number | null
}

export interface PendingRender {
  job_id: string
  kind: 'styled' | 'loop'
  source_id: string | null
  source_kind: GalleryKind | null
  title: string
  thumbnail_path: string | null
  variant: string | null
  started_at: number
  eta_seconds: number | null
  remaining_seconds: number | null
  phase: number
  status: JobStatus['status']
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
  const resp = await authFetch('/preview', { method: 'POST', body: form })
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

// Single render engine (Kling o1 v2v). See pricing-model.md "Render Engine"
// for why there is no tier selector. Credit cost is constant.
export const CREDITS_PER_RENDER = 10

export interface CreditsStatus {
  balance: number
  per_render: number
}

/** Fetch the authenticated user's current credit balance. */
export async function getCredits(): Promise<CreditsStatus> {
  const resp = await authFetch('/account/credits')
  if (!resp.ok) throw new Error(`Credits load failed: ${resp.statusText}`)
  return resp.json()
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
    backdropColor?: string
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
  if (options.backdropColor) {
    form.append('backdrop_color', options.backdropColor)
  }

  const resp = await authFetch('/jobs', { method: 'POST', body: form })
  if (!resp.ok) throw new Error(`Job creation failed: ${resp.statusText}`)
  const data = await resp.json()
  return data.job_id as string
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const resp = await authFetch(`/jobs/${jobId}`)
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
  const resp = await authFetch(`/jobs/${sourceJobId}/restyle`, { method: 'POST', body: form })
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
  const resp = await authFetch('/preview/frame', { method: 'POST', body: form, signal })
  if (!resp.ok) throw new Error(`Preview frame render failed: ${resp.statusText}`)
  const blob = await resp.blob()
  return URL.createObjectURL(blob)
}

// ── Gallery & stitch API ────────────────────────────────────────────────────

export async function listGallery(kind?: GalleryKind): Promise<GalleryItem[]> {
  const url = kind ? `/gallery?kind=${encodeURIComponent(kind)}` : '/gallery'
  const resp = await authFetch(url)
  if (!resp.ok) throw new Error(`Gallery list failed: ${resp.statusText}`)
  const data = await resp.json()
  return (data.items ?? []) as GalleryItem[]
}

export async function deleteGalleryItem(itemId: string): Promise<void> {
  const resp = await authFetch(`/gallery/${itemId}`, { method: 'DELETE' })
  if (!resp.ok) throw new Error(`Gallery delete failed: ${resp.statusText}`)
}

export async function renameGalleryItem(itemId: string, title: string): Promise<void> {
  const form = new FormData()
  form.append('title', title)
  const resp = await authFetch(`/gallery/${itemId}/rename`, { method: 'POST', body: form })
  if (!resp.ok) throw new Error(`Gallery rename failed: ${resp.statusText}`)
}

export async function stitchGalleryItems(
  itemIds: string[],
  title?: string,
): Promise<GalleryItem> {
  const form = new FormData()
  form.append('item_ids', JSON.stringify(itemIds))
  if (title) form.append('title', title)
  const resp = await authFetch('/stitch', { method: 'POST', body: form })
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
  const resp = await authFetch(`/gallery/${itemId}/loop`, { method: 'POST', body: form })
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
  const resp = await authFetch('/gallery/stats')
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
  const resp = await authFetch('/gallery', { method: 'POST', body: form })
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
  const resp = await authFetch('/gallery/replace', { method: 'POST', body: form })
  if (!resp.ok) await throwGalleryError(resp)
  return resp.json()
}

export async function toggleFavorite(
  itemId: string,
  favorite: boolean,
): Promise<GalleryItem> {
  const form = new FormData()
  form.append('favorite', String(favorite))
  const resp = await authFetch(`/gallery/${itemId}/favorite`, { method: 'POST', body: form })
  if (!resp.ok) throw new Error(`Favorite toggle failed: ${resp.statusText}`)
  return resp.json()
}

export function galleryVideoUrl(itemId: string): string {
  return `/gallery/${itemId}/video`
}

export async function styleGalleryItem(
  itemId: string,
  options: {
    rows: Row[]
    stylePrompt: string
    replaceId?: string
  },
): Promise<{ jobId: string; etaSeconds: number | null }> {
  const form = new FormData()
  form.append('component_rows', JSON.stringify(options.rows))
  form.append('style_prompt', options.stylePrompt)
  if (options.replaceId) {
    form.append('replace_id', options.replaceId)
  }
  const resp = await authFetch(`/gallery/${itemId}/style`, { method: 'POST', body: form })
  if (!resp.ok) await throwGalleryError(resp)
  const data = await resp.json()
  return { jobId: data.job_id as string, etaSeconds: data.eta_seconds ?? null }
}

export async function listPendingRenders(): Promise<PendingRender[]> {
  const resp = await authFetch('/gallery/pending')
  if (!resp.ok) throw new Error(`Pending renders failed: ${resp.statusText}`)
  const data = await resp.json()
  return (data.items ?? []) as PendingRender[]
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
  const resp = await authFetch('/account/me')
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

  const resp = await authFetch('/account', { method: 'POST', body: form })
  if (!resp.ok) {
    const body = await resp.json().catch(() => null)
    throw new Error(body?.detail ?? resp.statusText)
  }
  return resp.json()
}

export async function signOutEverywhere(): Promise<void> {
  const resp = await authFetch('/account/signout-all', { method: 'POST' })
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
    replaceId?: string
  },
): Promise<{ etaSeconds: number | null }> {
  const form = new FormData()
  form.append('selected_variants', selectedVariants.join(','))
  if (styleOpts) {
    form.append('component_rows', JSON.stringify(styleOpts.rows))
    form.append('style_prompt', styleOpts.stylePrompt)
    if (styleOpts.replaceId) {
      form.append('replace_id', styleOpts.replaceId)
    }
  }
  const resp = await authFetch(`/jobs/${jobId}/approve`, { method: 'POST', body: form })
  if (!resp.ok) await throwGalleryError(resp)
  const data = await resp.json().catch(() => ({ eta_seconds: null }))
  return { etaSeconds: data.eta_seconds ?? null }
}

