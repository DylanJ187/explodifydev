// frontend/src/components/TopNav.tsx
import CreditsCube from './shell/CreditsCube'

export type NavTab = 'home' | 'studio' | 'gallery' | 'profile'

interface TabDef {
  id: NavTab
  index: string
  label: string
}

const TABS: TabDef[] = [
  { id: 'home',    index: '00', label: 'Home' },
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
        <CreditsCube
          remaining={creditsRemaining!}
          total={creditsTotal!}
          onClick={onCreditClick}
        />
      )}
    </nav>
  )
}
