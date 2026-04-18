// frontend/src/components/Profile.tsx
import { useState } from 'react'
import { PricingModal } from './PricingModal'

type PlanId = 'free' | 'one-time' | 'pro' | 'studio'

const MODEL_TIERS = [
  { name: 'Standard',     sub: 'Kling 3.0',     credits: 10, note: 'Fast, great quality' },
  { name: 'High Quality', sub: 'Kling 2.5 Pro', credits: 30, note: 'Richer materials, more detail' },
  { name: 'Premium',      sub: 'Kling o1',      credits: 60, note: 'Cinematic, best results' },
]

export function Profile() {
  const [pricingOpen, setPricingOpen] = useState(false)

  // Free tier defaults — wire to real user state when auth lands
  const creditsTotal = 30
  const creditsRemaining = 30
  const pct = Math.max(0, Math.min(100, (creditsRemaining / creditsTotal) * 100))
  const currentPlan: PlanId = 'free'

  const standardRenders = Math.floor(creditsRemaining / 10)
  const hqRenders = Math.floor(creditsRemaining / 30)
  const premiumRenders = Math.floor(creditsRemaining / 60)
  const canAffordPremium = premiumRenders >= 1

  return (
    <div className="profile-page animate-fade-in">
      <div className="profile-bg" aria-hidden />

      <div className="profile-inner">

        {/* ── IDENTITY ROW ─────────────────────────────────────── */}
        <section className="profile-identity">
          <div className="profile-identity-left">
            <div className="profile-avatar">
              <span className="profile-avatar-initial">E</span>
            </div>
            <div className="profile-identity-text">
              <h1 className="profile-name">Explodify Operator</h1>
              <div className="profile-identity-meta">
                <span className="profile-chip">
                  <span className="profile-chip-dot" />
                  dylanjupp8@gmail.com
                </span>
                <span className="profile-chip profile-chip--muted">Joined Apr 2026</span>
              </div>
            </div>
          </div>
          <button type="button" className="profile-manage-btn">
            Manage account
            <span className="profile-manage-arrow">→</span>
          </button>
        </section>

        {/* ── USAGE CARD ───────────────────────────────────────── */}
        <section className="profile-usage">
          <div className="profile-usage-header">
            <div className="profile-usage-header-left">
              <span className="profile-plan-badge">FREE TIER</span>
              <span className="profile-plan-status">
                <span className="profile-plan-dot" />
                active
              </span>
            </div>
            <span className="profile-usage-reset">resets · monthly</span>
          </div>

          {/* Credit bar */}
          <div className="profile-credit-row">
            <div className="profile-credit-display">
              <span className="profile-credit-num">{creditsRemaining}</span>
              <span className="profile-credit-sep">/</span>
              <span className="profile-credit-total">{creditsTotal}</span>
              <span className="profile-credit-unit">credits remaining</span>
            </div>
          </div>

          <div
            className="profile-bar"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${creditsRemaining} of ${creditsTotal} credits`}
          >
            <div className="profile-bar-fill" style={{ width: `${pct}%` }} />
          </div>

          {/* Render budget */}
          <div className="profile-budget">
            <div className="profile-budget-row">
              <span className="profile-budget-label">Standard</span>
              <span className="profile-budget-val">{standardRenders}</span>
            </div>
            <div className="profile-budget-row">
              <span className="profile-budget-label">High Quality</span>
              <span className="profile-budget-val">{hqRenders}</span>
            </div>
            <div className={`profile-budget-row ${!canAffordPremium ? 'profile-budget-row--warn' : ''}`}>
              <span className="profile-budget-label">Premium</span>
              <span className="profile-budget-val">{premiumRenders}</span>
              {!canAffordPremium && (
                <span className="profile-budget-warn">60cr needed</span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="profile-usage-actions">
            <button
              type="button"
              className="profile-upgrade-btn"
              onClick={() => setPricingOpen(true)}
            >
              Upgrade plan
              <span className="profile-upgrade-arrow">→</span>
            </button>
            <button
              type="button"
              className="profile-pack-btn"
              onClick={() => setPricingOpen(true)}
            >
              Buy credit pack
            </button>
          </div>
        </section>

        {/* ── MODEL TIER REFERENCE ─────────────────────────────── */}
        <details className="profile-models-details">
          <summary className="profile-models-summary">
            <span className="profile-models-summary-label">Model tier reference</span>
            <span className="profile-models-summary-sub">credits per render</span>
            <span className="profile-models-summary-arrow" aria-hidden />
          </summary>
          <div className="profile-models-body">
            <div className="model-table">
              <div className="model-row model-row--head">
                <span>Tier</span>
                <span>Engine</span>
                <span className="model-cell-num">Credits</span>
                <span>Character</span>
              </div>
              {MODEL_TIERS.map(m => (
                <div key={m.name} className="model-row">
                  <span className="model-cell-name">
                    <span className={`model-pip model-pip--${m.name.toLowerCase().replace(' ', '-')}`} />
                    {m.name}
                  </span>
                  <span className="model-cell-sub">{m.sub}</span>
                  <span className="model-cell-num">
                    <span className="model-cell-num-main">{m.credits}</span>
                    <span className="model-cell-num-unit">cr</span>
                  </span>
                  <span className="model-cell-note">{m.note}</span>
                </div>
              ))}
            </div>
          </div>
        </details>

        {/* ── FOOTER ───────────────────────────────────────────── */}
        <footer className="profile-footer">
          <span>© Explodify Studio</span>
          <span className="profile-foot-sep">·</span>
          <span>Auto-refund on pipeline failure</span>
          <span className="profile-foot-sep">·</span>
          <span>Prices incl. 20% UK VAT</span>
        </footer>

      </div>

      <PricingModal
        open={pricingOpen}
        onClose={() => setPricingOpen(false)}
        currentPlan={currentPlan}
        showOTO={false}
        onChoose={(_plan, _cycle) => {
          // Stub — wire to Stripe Checkout when auth lands
          setPricingOpen(false)
        }}
      />
    </div>
  )
}
