import { useNavigate } from 'react-router-dom'

export function Hero() {
  const navigate = useNavigate()

  return (
    <section className="landing-hero">
      <div className="landing-hero__frame">
        <span className="landing-hero__edge landing-hero__edge--tl" aria-hidden />
        <span className="landing-hero__edge landing-hero__edge--tr" aria-hidden />
        <span className="landing-hero__edge landing-hero__edge--bl" aria-hidden />
        <span className="landing-hero__edge landing-hero__edge--br" aria-hidden />

        <div className="landing-hero__eyebrow">
          <span className="landing-hero__dot" aria-hidden />
          <span>CAD → Advertisement · Automated pipeline</span>
        </div>

        <h1 className="landing-hero__headline">
          Turn CAD files into <em>scroll-stopping</em> product ads
          <br />
          in minutes.
        </h1>

        <p className="landing-hero__sub">
          Upload a model — we explode, render, and style it with cinematic motion.
          No keyframes. No renderfarms. No compositing.
        </p>

        <div className="landing-hero__cta-row">
          <button
            type="button"
            className="landing-cta landing-cta--primary"
            onClick={() => navigate('/login')}
          >
            <span className="landing-cta__label">Start free</span>
            <span className="landing-cta__arrow" aria-hidden>→</span>
          </button>
          <button
            type="button"
            className="landing-cta landing-cta--ghost"
            onClick={() => {
              const el = document.getElementById('pipeline')
              el?.scrollIntoView({ behavior: 'smooth' })
            }}
          >
            See how it works
          </button>
        </div>

        <div className="landing-hero__meta">
          <span className="landing-hero__meta-item">
            <span className="landing-hero__meta-key">STAGE 01</span>
            <span className="landing-hero__meta-val">Upload</span>
          </span>
          <span className="landing-hero__meta-sep" aria-hidden>/</span>
          <span className="landing-hero__meta-item">
            <span className="landing-hero__meta-key">STAGE 02</span>
            <span className="landing-hero__meta-val">Explode</span>
          </span>
          <span className="landing-hero__meta-sep" aria-hidden>/</span>
          <span className="landing-hero__meta-item">
            <span className="landing-hero__meta-key">STAGE 03</span>
            <span className="landing-hero__meta-val">Render</span>
          </span>
          <span className="landing-hero__meta-sep" aria-hidden>/</span>
          <span className="landing-hero__meta-item">
            <span className="landing-hero__meta-key">STAGE 04</span>
            <span className="landing-hero__meta-val">Ship</span>
          </span>
        </div>
      </div>
    </section>
  )
}

export default Hero
