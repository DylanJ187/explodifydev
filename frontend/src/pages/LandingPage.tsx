import { useNavigate } from 'react-router-dom'
import { Hero } from '../components/landing/Hero'
import CubeLogo from '../components/shell/CubeLogo'

export function LandingPage() {
  return (
    <div className="landing-shell">
      <LandingNav />
      <main className="landing-main">
        <Hero />
      </main>
      <LandingFooter />
    </div>
  )
}

function LandingNav() {
  const navigate = useNavigate()
  return (
    <header className="landing-topbar" role="banner">
      <div className="landing-topbar__brand">
        <button
          type="button"
          className="wordmark wordmark--button"
          onClick={() => navigate('/landing')}
          aria-label="Explodify home"
        >
          <CubeLogo size={30} className="wordmark__cube" />
          <span className="wordmark__text">
            EXPLOD<em>I</em>FY
          </span>
        </button>
      </div>

      <div className="landing-topbar__actions">
        <a className="landing-topbar__link" href="/login">
          Sign in
        </a>
      </div>
    </header>
  )
}

function LandingFooter() {
  return (
    <footer className="landing-footer">
      <span>Explodify</span>
      <span className="landing-footer__copy">© 2026</span>
    </footer>
  )
}

export default LandingPage
