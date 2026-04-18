// frontend/src/components/TopNav.tsx
export type NavTab = 'studio' | 'gallery' | 'profile'

interface TabDef {
  id: NavTab
  index: string
  label: string
}

const TABS: TabDef[] = [
  { id: 'studio',  index: '01', label: 'Studio' },
  { id: 'gallery', index: '02', label: 'Gallery' },
  { id: 'profile', index: '03', label: 'Profile' },
]

interface Props {
  tab: NavTab
  onChange: (next: NavTab) => void
  galleryCount?: number
  creditsRemaining?: number
  creditsTotal?: number
  onCreditClick?: () => void
}

export function TopNav({ tab, onChange, galleryCount, creditsRemaining, creditsTotal, onCreditClick }: Props) {
  const activeIdx = TABS.findIndex(t => t.id === tab)
  const showCredits = typeof creditsRemaining === 'number' && typeof creditsTotal === 'number'
  const creditPct = showCredits ? Math.max(0, Math.min(100, (creditsRemaining! / creditsTotal!) * 100)) : 0
  const creditLow = showCredits && creditsRemaining! <= creditsTotal! * 0.3

  return (
    <nav className="top-nav" aria-label="Primary">
      <div className="top-nav-logo" aria-label="Explodify">
        <span className="top-nav-logo-mark" aria-hidden>✦</span>
        <span className="top-nav-logo-text">Explodify</span>
      </div>

      <div className="top-nav-tabs" role="tablist">
        {/* Sliding active indicator */}
        <span
          className="top-nav-slider"
          aria-hidden
          style={{ '--tab-i': activeIdx } as React.CSSProperties}
        />

        {TABS.map((t, i) => {
          const active = tab === t.id
          const showBadge = t.id === 'gallery' && typeof galleryCount === 'number' && galleryCount > 0
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              className={`top-nav-tab ${active ? 'top-nav-tab--active' : ''}`}
              onClick={() => onChange(t.id)}
              aria-selected={active}
              aria-current={active ? 'page' : undefined}
              style={{ '--tab-i': i } as React.CSSProperties}
            >
              <span className="top-nav-index">{t.index}</span>
              <span className="top-nav-label">{t.label}</span>
              {showBadge && (
                <span className="top-nav-badge" aria-label={`${galleryCount} items`}>
                  {galleryCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {showCredits && (
        <button
          type="button"
          className={`top-nav-credits ${creditLow ? 'top-nav-credits--low' : ''}`}
          onClick={onCreditClick}
          aria-label={`${creditsRemaining} credits remaining. Click to upgrade.`}
        >
          <span className="top-nav-credits-bar" aria-hidden>
            <span
              className="top-nav-credits-fill"
              style={{ width: `${creditPct}%` }}
            />
          </span>
          <span className="top-nav-credits-label">
            {creditsRemaining} <span className="top-nav-credits-unit">cr</span>
          </span>
        </button>
      )}
    </nav>
  )
}
