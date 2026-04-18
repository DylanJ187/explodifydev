// TODO: wire to gallery API once backend exposes a per-user list endpoint.

interface PlaceholderProject {
  slot: number
}

const PLACEHOLDERS: PlaceholderProject[] = Array.from({ length: 6 }, (_, i) => ({ slot: i + 1 }))

export function RecentProjects() {
  return (
    <section className="dashboard-recents">
      <header className="dashboard-recents__head">
        <span className="dashboard-recents__eyebrow">RECENT · 00 / 06</span>
        <h2 className="dashboard-recents__title">Your projects</h2>
      </header>

      <div className="dashboard-recents__grid">
        {PLACEHOLDERS.map((p) => (
          <article key={p.slot} className="dashboard-recents__tile" aria-hidden>
            <div className="dashboard-recents__tile-inner">
              <span className="dashboard-recents__tile-index">
                {String(p.slot).padStart(2, '0')}
              </span>
              <span className="dashboard-recents__tile-label">Empty slot</span>
            </div>
          </article>
        ))}
      </div>

      <p className="dashboard-recents__empty-note">
        Your renders will appear here once you create your first project.
      </p>
    </section>
  )
}

export default RecentProjects
