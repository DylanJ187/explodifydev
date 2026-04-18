import { MeshBackground } from '../components/shell/MeshBackground'
import { Hero } from '../components/landing/Hero'
import { PipelineScrolly } from '../components/landing/PipelineScrolly'
import { Features } from '../components/landing/Features'
import { CTACard } from '../components/landing/CTACard'

export function LandingPage() {
  return (
    <div className="landing-shell">
      <MeshBackground />
      <div className="landing-shell__content">
        <LandingNav />
        <main className="landing-main">
          <Hero />
          <PipelineScrolly />
          <Features />
          <CTACard />
        </main>
        <LandingFooter />
      </div>
    </div>
  )
}

function LandingNav() {
  return (
    <nav className="landing-nav" aria-label="Landing primary">
      <a className="landing-nav__brand" href="/">
        <span className="landing-nav__mark" aria-hidden>✦</span>
        <span>Explodify</span>
      </a>
      <div className="landing-nav__actions">
        <a
          className="landing-nav__link"
          href="#pipeline"
          onClick={(e) => {
            e.preventDefault()
            document.getElementById('pipeline')?.scrollIntoView({ behavior: 'smooth' })
          }}
        >
          How it works
        </a>
        <a className="landing-nav__cta" href="/login">
          Sign in
        </a>
      </div>
    </nav>
  )
}

function LandingFooter() {
  return (
    <footer className="landing-footer">
      <span className="landing-footer__brand">Explodify</span>
      <span className="landing-footer__meta">
        CAD to advertisement · built for product teams
      </span>
      <span className="landing-footer__copy">© 2026</span>
    </footer>
  )
}

export default LandingPage
