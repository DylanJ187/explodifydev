// frontend/src/components/TopNav.tsx
export type NavTab = 'gallery' | 'studio' | 'profile'

interface TabDef {
  id: NavTab
  label: string
  idx: string
}

const TABS: TabDef[] = [
  { id: 'gallery', label: 'Gallery', idx: '01' },
  { id: 'studio',   label: 'Studio',   idx: '02' },
  { id: 'profile',  label: 'Profile',  idx: '03' },
]

interface Props {
  tab: NavTab
  onChange: (next: NavTab) => void
}

export function TopNav({ tab, onChange }: Props) {
  const activeIdx = TABS.findIndex(t => t.id === tab)
  const hasActive = activeIdx >= 0

  return (
    <nav className="top-nav" aria-label="Primary">
      <div className={`top-nav-tabs ${hasActive ? 'top-nav-tabs--has-active' : ''}`} role="tablist">
        {hasActive && (
          <span
            className="top-nav-slider"
            aria-hidden
            style={{ '--tab-i': activeIdx } as React.CSSProperties}
          />
        )}

        {TABS.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              className={`top-nav-tab ${active ? 'top-nav-tab--active' : ''}`}
              onClick={() => onChange(t.id)}
              aria-selected={active}
              aria-current={active ? 'page' : undefined}
            >
              <span className="top-nav-idx" aria-hidden>{t.idx}</span>
              <span className="top-nav-label">{t.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
