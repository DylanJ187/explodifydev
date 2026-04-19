// frontend/src/components/ProceedToStyleButton.tsx
import { MODEL_TIER_CREDITS } from '../api/client'
import type { ModelTier } from '../api/client'

interface Props {
  modelTier: ModelTier
  creditsRemaining: number
  onProceed: () => void
}

export function ProceedToStyleButton({
  modelTier,
  creditsRemaining,
  onProceed,
}: Props) {
  const cost = MODEL_TIER_CREDITS[modelTier]
  const insufficient = creditsRemaining < cost

  return (
    <button
      type="button"
      className={[
        'apply-style-btn',
        insufficient ? 'apply-style-btn--insufficient' : '',
      ].filter(Boolean).join(' ')}
      onClick={onProceed}
      disabled={insufficient}
    >
      <span className="apply-style-btn-label">Apply Styling</span>
      <span className="apply-style-btn-cost">{cost} credits</span>
    </button>
  )
}
