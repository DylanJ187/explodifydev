// frontend/src/lib/studioStorage.ts
// Local persistence for the Studio page. Survives page refreshes, tab
// navigation, and soft errors so users don't lose their work on every mishap.
//
// Keys are scoped per user so a snapshot captured under one identity never
// rehydrates into another — previously an anonymous DEV_BYPASS snapshot could
// leak into a real signed-in session and resurrect stale jobId / previewId
// pointing at a different tenant's data.
//
// Bumping VERSION invalidates older snapshots cleanly — drop the key and fall
// through to defaults rather than partially hydrating a stale shape.
import type {
  PreviewResult,
  VariantName,
} from '../api/client'
import type { OrbitMode, OrbitDirection, Vec3 } from '../components/orientation/createViewer'
import type { StyleOptions, RestyleEntry } from '../App'

const STORAGE_PREFIX = 'explodify.studio.v3.'
const LEGACY_PREFIXES = ['explodify.studio.v2.']
const LEGACY_EXACT_KEYS = ['explodify.studio.v1']
const VERSION = 3

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`
}

function purgeLegacyKeys(ls: Storage): void {
  for (const legacy of LEGACY_EXACT_KEYS) {
    try { ls.removeItem(legacy) } catch { /* ignore */ }
  }
  const stale: string[] = []
  try {
    for (let i = 0; i < ls.length; i++) {
      const key = ls.key(i)
      if (!key) continue
      if (LEGACY_PREFIXES.some(p => key.startsWith(p))) stale.push(key)
    }
    for (const key of stale) ls.removeItem(key)
  } catch { /* ignore */ }
}

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

export function loadStudio(userId: string | null): StudioSnapshot | null {
  const ls = safeLocalStorage()
  if (!ls) return null
  purgeLegacyKeys(ls)
  if (!userId) return null
  const key = storageKey(userId)
  const raw = ls.getItem(key)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StudioSnapshot> & { version?: number }
    if (parsed.version !== VERSION) {
      ls.removeItem(key)
      return null
    }
    // Minimal shape guard — if the top-level state is missing or unknown, drop.
    if (typeof parsed.state !== 'string' || !isPersistableState(parsed.state)) {
      ls.removeItem(key)
      return null
    }
    return parsed as StudioSnapshot
  } catch {
    ls.removeItem(key)
    return null
  }
}

export function saveStudio(
  userId: string | null,
  snapshot: Omit<StudioSnapshot, 'version'>,
): void {
  const ls = safeLocalStorage()
  if (!ls || !userId) return
  if (!isPersistableState(snapshot.state)) return
  try {
    ls.setItem(storageKey(userId), JSON.stringify({ version: VERSION, ...snapshot }))
  } catch {
    // Quota exceeded or serialization loop — fail quiet; users get a fresh
    // session next refresh rather than a broken one.
  }
}

export function clearStudio(userId: string | null): void {
  const ls = safeLocalStorage()
  if (!ls || !userId) return
  try { ls.removeItem(storageKey(userId)) } catch { /* ignore */ }
}
