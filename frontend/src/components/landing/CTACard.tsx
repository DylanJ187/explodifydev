import { useNavigate } from 'react-router-dom'

export function CTACard() {
  const navigate = useNavigate()

  return (
    <section className="landing-cta-card">
      <div className="landing-cta-card__frame">
        <span className="landing-cta-card__edge landing-cta-card__edge--tl" aria-hidden />
        <span className="landing-cta-card__edge landing-cta-card__edge--tr" aria-hidden />
        <span className="landing-cta-card__edge landing-cta-card__edge--bl" aria-hidden />
        <span className="landing-cta-card__edge landing-cta-card__edge--br" aria-hidden />

        <span className="landing-cta-card__eyebrow">READY WHEN YOU ARE</span>
        <h2 className="landing-cta-card__headline">
          Drop a CAD file.<br />
          Ship an ad.
        </h2>
        <p className="landing-cta-card__sub">
          Free to start. Pay only for premium renders.
        </p>

        <div className="landing-cta-card__actions">
          <button
            type="button"
            className="landing-cta landing-cta--primary landing-cta--large"
            onClick={() => navigate('/login')}
          >
            <span className="landing-cta__label">Start creating</span>
            <span className="landing-cta__arrow" aria-hidden>→</span>
          </button>
        </div>

        <div className="landing-cta-card__footer">
          <span>NO CARD REQUIRED</span>
          <span className="landing-cta-card__sep" aria-hidden>·</span>
          <span>UNLIMITED PREVIEWS</span>
          <span className="landing-cta-card__sep" aria-hidden>·</span>
          <span>CANCEL ANYTIME</span>
        </div>
      </div>
    </section>
  )
}

export default CTACard
