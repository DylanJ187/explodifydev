import { CreditIcon } from '../StylePanel'

interface CreditsBlocksProps {
  remaining: number
  total: number
  onClick?: () => void
  label?: string
}

export function CreditsBlocks({ remaining, total, onClick, label = 'Credits remaining' }: CreditsBlocksProps) {
  const ratio = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0
  const low = ratio < 0.3 && total > 0

  const body = (
    <>
      <CreditIcon size={13} />
      <span className="credits-chip__count">{remaining}</span>
    </>
  )

  const className = `credits-chip ${low ? 'credits-chip--low' : ''}`
  const ariaLabel = `${remaining} of ${total} credits remaining. ${label}.`

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} aria-label={`${ariaLabel} Click to manage.`}>
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
