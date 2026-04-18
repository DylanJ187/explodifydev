// TODO: Terminal B will ship real impl
interface Props {
  remaining: number
  total: number
  onClick?: () => void
}

export default function CreditsCube({ remaining, total, onClick }: Props) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0
  const low = total > 0 && remaining <= total * 0.3

  return (
    <button
      type="button"
      className={`top-nav-credits ${low ? 'top-nav-credits--low' : ''}`}
      onClick={onClick}
      aria-label={`${remaining} credits remaining. Click to upgrade.`}
    >
      <span className="top-nav-credits-bar" aria-hidden>
        <span className="top-nav-credits-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="top-nav-credits-label">
        {remaining} <span className="top-nav-credits-unit">cr</span>
      </span>
    </button>
  )
}
