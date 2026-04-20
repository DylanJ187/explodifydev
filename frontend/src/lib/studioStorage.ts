// frontend/src/lib/studioStorage.ts
// Local persistence for the Studio page. Survives page refreshes, tab
// navigation, and soft errors so users don't lose their work on every mishap.
//
// Bumping VERSION invalidates older snapshots cleanly — drop the key and fall
// through to defaults rather than partially hydrating a stale shape.
import type {
  ModelTier,
  PreviewResult,
  VariantName,
} from '../api/client'
import type { OrbitMode, OrbitDirection, Vec3 } from '../components/orientation/createViewer'
import type { StyleOptions, RestyleEntry } from '../App'

const STORAGE_KEY = 'explodify.studio.v1'
const VERSION = 1

export type PersistedAppState =
  | 'idle'
  | 'orientation'
  | 'processing'
  | 'awaiting_approval'
  | 'styling'
  | 'done'

export interface RenderedSettings {
  explodeScalar: number
  orbitRangeDeg: number
  cameraZoom: number
  orbitMode: OrbitMode
  orbitDirection: OrbitDirection
}

export interface FromGalleryContext {
  galleryId: string
  variant: VariantName
}

export interface StudioSnapshot {
  version: number
  state: PersistedAppState
  jobId: string | null
  preview: PreviewResult | null
  uploadedFileName: string | null
  orbitRangeDeg: number
  explodeScalar: number
  cameraZoom: number
  styleOptions: StyleOptions
  selectedVariant: VariantName
  easingCurve: number[]
  orbitMode: OrbitMode
  orbitDirection: OrbitDirection
  orbitEasingCurve: number[]
  modelTier: ModelTier
  backdropColor: string
  cameraDirection: Vec3
  renderedSettings: RenderedSettings | null
  restyleStack: RestyleEntry[]
  fromGalleryContext: FromGalleryContext | null
}

// Transient states never get written. We don't want a page refresh mid-upload
// to resurrect a dead upload spinner, and an error state should fall back to
// the last good snapshot instead of replaying itself.
const WRITABLE_STATES: Record<PersistedAppState, true> = {
  idle: true,
  orientation: true,
  processing: true,
  awaiting_approval: true,
  styling: true,
  done: true,
}

export function isPersistableState(state: string): state is PersistedAppState {
  return state in WRITABLE_STATES
}

function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    return null
  }
}

export function loadStudio(): StudioSnapshot | null {
  const ls = safeLocalStorage()
  if (!ls) return null
  const raw = ls.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StudioSnapshot> & { version?: number }
    if (parsed.version !== VERSION) {
      ls.removeItem(STORAGE_KEY)
      return null
    }
    // Minimal shape guard — if the top-level state is missing or unknown, drop.
    if (typeof parsed.state !== 'string' || !isPersistableState(parsed.state)) {
      ls.removeItem(STORAGE_KEY)
      return null
    }
    return parsed as StudioSnapshot
  } catch {
    ls.removeItem(STORAGE_KEY)
    return null
  }
}

export function saveStudio(snapshot: Omit<StudioSnapshot, 'version'>): void {
  const ls = safeLocalStorage()
  if (!ls) return
  if (!isPersistableState(snapshot.state)) return
  try {
    ls.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, ...snapshot }))
  } catch {
    // Quota exceeded or serialization loop — fail quiet; users get a fresh
    // session next refresh rather than a broken one.
  }
}

export function clearStudio(): void {
  const ls = safeLocalStorage()
  if (!ls) return
  try { ls.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}
