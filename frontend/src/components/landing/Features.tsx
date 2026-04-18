interface Feature {
  index: string
  title: string
  body: string
}

const FEATURES: Feature[] = [
  {
    index: 'A',
    title: 'Explosion control',
    body: 'Five-sample easing ramps. Pick any axis. Orbit horizontal or vertical. Preview a single frame live before you commit to 72.',
  },
  {
    index: 'B',
    title: 'Smart styling',
    body: 'FAL.ai Kling o1 on top of a clean pyrender base. Prompt it like a director — product shot, hero cut, moody reveal.',
  },
  {
    index: 'C',
    title: 'One-click render',
    body: 'Render in the background while you queue the next shot. Stitch loops together. Ship straight to social or paste into Meta Ads.',
  },
]

export function Features() {
  return (
    <section className="landing-features">
      <header className="landing-features__head">
        <span className="landing-features__eyebrow">FEATURES · 01 / 03</span>
        <h2 className="landing-features__title">Every stage is tuned.</h2>
        <p className="landing-features__sub">
          Explodify is opinionated where it matters and flexible where you need it.
        </p>
      </header>

      <div className="landing-features__grid">
        {FEATURES.map((f) => (
          <article key={f.index} className="landing-feature">
            <span className="landing-feature__index">{f.index}</span>
            <h3 className="landing-feature__title">{f.title}</h3>
            <p className="landing-feature__body">{f.body}</p>
            <span className="landing-feature__rule" aria-hidden />
          </article>
        ))}
      </div>
    </section>
  )
}

export default Features
