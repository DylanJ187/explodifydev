// frontend/src/components/ConfirmCreditsModal.tsx
import { useEffect, useRef, useState } from 'react'
import { MODEL_TIER_CREDITS, MODEL_TIER_LABELS } from '../api/client'
import type { ModelTier } from '../api/client'
import { CreditIcon } from './StylePanel'

export const SKIP_CREDITS_CONFIRM_KEY = 'explodify.skipCreditsConfirm'

export function shouldSkipConfirm(): boolean {
  try {
    return localStorage.getItem(SKIP_CREDITS_CONFIRM_KEY) === '1'
  } catch {
    return false
  }
}

export function setSkipConfirm(skip: boolean): void {
  try {
    if (skip) localStorage.setItem(SKIP_CREDITS_CONFIRM_KEY, '1')
    else localStorage.removeItem(SKIP_CREDITS_CONFIRM_KEY)
  } catch {
    // ignore quota / privacy-mode errors
  }
}

interface Props {
  open: boolean
  modelTier: ModelTier
  creditsRemaining: number
  onConfirm: (dontAskAgain: boolean) => void
  onCancel: () => void
}

export function ConfirmCreditsModal({
  open,
  modelTier,
  creditsRemaining,
  onConfirm,
  onCancel,
}: Props) {
  const [dontAskAgain, setDontAskAgain] = useState(false)
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) { setDontAskAgain(false); return }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') onConfirm(dontAskAgain)
    }
    document.addEventListener('keydown', handleKey)
    const t = window.setTimeout(() => confirmBtnRef.current?.focus(), 40)
    return () => {
      document.removeEventListener('keydown', handleKey)
      window.clearTimeout(t)
    }
  }, [open, dontAskAgain, onCancel, onConfirm])

  if (!open) return null

  const cost = MODEL_TIER_CREDITS[modelTier]
  const insufficient = creditsRemaining < cost
  const balanceAfter = Math.max(0, creditsRemaining - cost)

  return (
    <div
      className="ex-modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="credits-confirm-title"
    >
      <div className="ex-modal-panel ex-modal-panel--sm">
        <header className="ex-modal-header">
          <h2 id="credits-confirm-title" className="ex-modal-title">Confirm render</h2>
          <button
            type="button"
            className="ex-modal-close"
            onClick={onCancel}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="ex-modal-body">
          <p className="ex-modal-message">
            You're about to spend credits on a{' '}
            <strong>{MODEL_TIER_LABELS[modelTier]}</strong> render.
          </p>

          <div className="credits-confirm-summary">
            <div className="credits-confirm-row">
              <span className="credits-confirm-key">Cost</span>
              <span className="credits-confirm-val credits-confirm-val--cost">
                <CreditIcon size={14} />
                <span>{cost} credits</span>
              </span>
            </div>
            <div className="credits-confirm-row">
              <span className="credits-confirm-key">Balance</span>
              <span className="credits-confirm-val">{creditsRemaining} credits</span>
            </div>
            <div className="credits-confirm-row">
              <span className="credits-confirm-key">After render</span>
              <span
                className={[
                  'credits-confirm-val',
                  insufficient ? 'credits-confirm-val--warn' : '',
                ].filter(Boolean).join(' ')}
              >
                {insufficient ? 'Not enough credits' : `${balanceAfter} credits`}
              </span>
            </div>
          </div>

          <label className="credits-confirm-skip">
            <input
              type="checkbox"
              checked={dontAskAgain}
              onChange={(e) => setDontAskAgain(e.target.checked)}
            />
            <span>Don't ask again</span>
          </label>

          <div className="ex-modal-actions">
            <button type="button" className="ex-modal-btn" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="ex-modal-btn ex-modal-btn--primary"
              ref={confirmBtnRef}
              disabled={insufficient}
              onClick={() => onConfirm(dontAskAgain)}
            >
              Spend {cost} credits
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
