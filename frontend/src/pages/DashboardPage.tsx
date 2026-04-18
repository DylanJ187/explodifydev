import { MeshBackground } from '../components/shell/MeshBackground'
import { CreatePrompt } from '../components/dashboard/CreatePrompt'
import { RecentProjects } from '../components/dashboard/RecentProjects'

export function DashboardPage() {
  const greeting = greetingForHour(new Date().getHours())

  return (
    <div className="dashboard-shell">
      <MeshBackground />
      <div className="dashboard-shell__content">
        <section className="dashboard-hero">
          <span className="dashboard-hero__eyebrow">
            <span className="dashboard-hero__dot" aria-hidden />
            <span>{greeting.toUpperCase()}</span>
          </span>
          <h1 className="dashboard-hero__headline">
            What would you like to create?
          </h1>
          <p className="dashboard-hero__sub">
            Describe the style, or jump straight to the studio.
          </p>
          <CreatePrompt />
        </section>

        <RecentProjects />
      </div>
    </div>
  )
}

function greetingForHour(hour: number): string {
  if (hour < 5) return 'Still up?'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export default DashboardPage
