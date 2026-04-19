const BLOCK_COUNT = 8

interface CreditsBlocksProps {
  remaining: number
  total: number
  onClick?: () => void
  label?: string
}

export function CreditsBlocks({ remaining, total, onClick, label = 'Credits remaining' }: CreditsBlocksProps) {
  const ratio = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0
  const filledCount = Math.round(ratio * BLOCK_COUNT)
  const low = ratio < 0.3 && total > 0

  const body = (
    <>
      <span className="credits-blocks__label">
        <span className="credits-blocks__label-text">{label}:</span>
        <span className="credits-blocks__count">
          {remaining}
          <span className="credits-blocks__sep" aria-hidden>/</span>
          {total}
        </span>
      </span>
      <span className="credits-blocks__track" aria-hidden>
        {Array.from({ length: BLOCK_COUNT }).map((_, i) => (
          <span
            key={i}
            className={`credits-blocks__block ${i < filledCount ? 'credits-blocks__block--filled' : ''}`}
          />
        ))}
      </span>
    </>
  )

  const className = `credits-blocks ${low ? 'credits-blocks--low' : ''}`
  const ariaLabel = `${remaining} of ${total} credits remaining`

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} aria-label={`${ariaLabel}. Click to upgrade.`}>
        {body}
      </button>
    )
  }
  return (
    <div className={className} aria-label={ariaLabel}>
      {body}
    </div>
  )
}

export default CreditsBlocks
