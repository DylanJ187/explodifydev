// frontend/src/components/ProceedToStyleButton.tsx
import { CREDITS_PER_RENDER } from '../api/client'

interface Props {
  creditsRemaining: number
  onProceed: () => void
}

function IconSparkle() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden>
      <path
        d="M8 1.5 L9.3 6.7 L14.5 8 L9.3 9.3 L8 14.5 L6.7 9.3 L1.5 8 L6.7 6.7 Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function ProceedToStyleButton({
  creditsRemaining,
  onProceed,
}: Props) {
  const insufficient = creditsRemaining < CREDITS_PER_RENDER

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
      <span className="apply-style-btn-row">
        <IconSparkle />
        <span className="apply-style-btn-label">Apply Styling</span>
      </span>
      <span className="apply-style-btn-cost">{CREDITS_PER_RENDER} credits</span>
    </button>
  )
}
