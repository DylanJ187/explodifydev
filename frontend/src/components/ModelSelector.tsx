// frontend/src/components/ModelSelector.tsx
import { useRef, useState } from 'react'
import { MODEL_TIER_CREDITS, MODEL_TIER_LABELS } from '../api/client'
import type { ModelTier } from '../api/client'
import { CreditIcon } from './StylePanel'
import { ModelSelectionPopover } from './ModelSelectionPopover'

const TIER_MODEL: Record<ModelTier, string> = {
  premium: 'Kling o1',
  high_quality: 'Kling 2.5 Pro',
  standard: 'Kling 3.0',
}

interface Props {
  modelTier: ModelTier
  onModelTierChange: (tier: ModelTier) => void
  creditsRemaining: number
  disabled?: boolean
}

export function ModelSelector({
  modelTier,
  onModelTierChange,
  creditsRemaining,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const cost = MODEL_TIER_CREDITS[modelTier]

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={[
          'model-selector',
          `model-selector--${modelTier}`,
          open ? 'model-selector--open' : '',
          disabled ? 'model-selector--disabled' : '',
        ].filter(Boolean).join(' ')}
        onClick={() => { if (!disabled) setOpen(v => !v) }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="model-selector-main">
          <span className="model-selector-head">
            <span className="model-selector-tier">{MODEL_TIER_LABELS[modelTier]}</span>
            <span className="model-selector-model">{TIER_MODEL[modelTier]}</span>
          </span>
          <span className="model-selector-cost">
            <CreditIcon size={11} />
            <span>{cost} credits</span>
          </span>
        </span>
        <span className="model-selector-chev" aria-hidden>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M3 2 L6 5 L3 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      <ModelSelectionPopover
        open={open}
        anchorRef={btnRef}
        modelTier={modelTier}
        creditsRemaining={creditsRemaining}
        onSelect={onModelTierChange}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
