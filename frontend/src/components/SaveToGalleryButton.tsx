// frontend/src/components/SaveToGalleryButton.tsx
import { useState } from 'react'
import {
  saveToGallery, replaceGalleryItem, getGalleryStats,
  GalleryFullError,
  type GalleryTier, type VariantName,
} from '../api/client'
import { useSavedCount, publishSavedCount } from '../lib/useSavedCount'
import { CapacityModal } from './shell/CapacityModal'

type SaveKind = 'base' | 'styled'

interface Props {
  jobId: string
  variant: VariantName
  kind: SaveKind
  title?: string
  onSaved?: () => void
  onBackToPreview?: () => void
}

export function SaveToGalleryButton({
  jobId, variant, kind, title, onSaved, onBackToPreview,
}: Props) {
  const { stats, setStats } = useSavedCount()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pulse, setPulse] = useState(false)
  const [capacity, setCapacity] = useState<null | {
    savedCount: number
    cap: number
    tier: GalleryTier
  }>(null)
  const [error, setError] = useState<string | null>(null)

  async function refreshStats() {
    try {
      const next = await getGalleryStats()
      setStats(next)
    } catch { /* silent — counter stays */ }
  }

  async function doSave() {
    if (saved || saving) return
    setSaving(true)
    setError(null)
    try {
      await saveToGallery({ jobId, variant, kind, title })
      await refreshStats()
      setSaved(true)
      setPulse(true)
      window.setTimeout(() => setPulse(false), 900)
      onSaved?.()
    } catch (e) {
      if (e instanceof GalleryFullError) {
        setCapacity({ savedCount: e.savedCount, cap: e.cap, tier: e.tier })
      } else {
        setError(e instanceof Error ? e.message : 'Save failed')
      }
    } finally {
      setSaving(false)
    }
  }

  async function doReplace(replaceId: string) {
    setSaving(true)
    setError(null)
    try {
      await replaceGalleryItem({ replaceId, jobId, variant, kind, title })
      await refreshStats()
      setCapacity(null)
      setSaved(true)
      setPulse(true)
      window.setTimeout(() => setPulse(false), 900)
      onSaved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Replace failed')
    } finally {
      setSaving(false)
    }
  }

  function doDiscard() {
    setCapacity(null)
    // Sync counter in case other tabs changed it
    getGalleryStats().then(publishSavedCount).catch(() => undefined)
  }

  const countLabel = stats ? `${stats.count}/${stats.cap}` : '—/—'
  const classes = [
    'save-to-gallery-btn',
    saved ? 'save-to-gallery-btn--saved' : '',
    pulse ? 'save-to-gallery-btn--pulse' : '',
    saving ? 'save-to-gallery-btn--saving' : '',
  ].filter(Boolean).join(' ')

  return (
    <>
      <button
        type="button"
        className={classes}
        onClick={doSave}
        disabled={saved || saving}
        aria-label={saved ? 'Saved to gallery' : 'Save to gallery'}
        title={error ?? undefined}
      >
        <span className="save-to-gallery-icon" aria-hidden>
          {saved ? (
            <svg viewBox="0 0 16 16" width="13" height="13">
              <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.6"
                strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" width="13" height="13">
              <path d="M4 2.5h7l1.5 1.5v10L8 11.5 3.5 14V3A.5.5 0 014 2.5z"
                fill="none" stroke="currentColor" strokeWidth="1.5"
                strokeLinejoin="round" />
            </svg>
          )}
        </span>
        <span className="save-to-gallery-label">
          {saved ? 'Saved' : saving ? 'Saving…' : 'Save'}
        </span>
        <span className="save-to-gallery-count">{countLabel}</span>
        {pulse && <span className="save-to-gallery-plus" aria-hidden>+1</span>}
        <span className="save-to-gallery-shimmer" aria-hidden />
      </button>

      {capacity && (
        <CapacityModal
          open={true}
          tier={capacity.tier}
          cap={capacity.cap}
          savedCount={capacity.savedCount}
          busy={saving}
          onReplace={doReplace}
          onDiscard={doDiscard}
          onBackToPreview={() => {
            setCapacity(null)
            onBackToPreview?.()
          }}
          onClose={() => setCapacity(null)}
        />
      )}
    </>
  )
}
