// frontend/src/components/PricingModal.tsx
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type PlanId = 'free' | 'one-time' | 'pro' | 'studio'
type BillingCycle = 'monthly' | 'annual'

interface PlanDef {
  id: PlanId
  label: string
  tagline: string
  priceMonthly: string
  priceAnnual: string
  priceOTO?: string
  priceCadence: string
  bullets: { premium: number; hq: number; standard: number }
  commitment: string
  highlight?: boolean
}

const PLANS: PlanDef[] = [
  {
    id: 'one-time',
    label: 'One-time',
    tagline: 'No commitment',
    priceMonthly: '£24.99',
    priceAnnual: '£24.99',
    priceCadence: 'one-time',
    bullets: { premium: 8, hq: 16, standard: 50 },
    commitment: 'Credits expire after 12 months',
  },
  {
    id: 'pro',
    label: 'Pro',
    tagline: 'For freelancers & solo studios',
    priceMonthly: '£29.99',
    priceAnnual: '£24.89',
    priceOTO: '£26.99',
    priceCadence: 'per month',
    bullets: { premium: 15, hq: 30, standard: 90 },
    commitment: 'Resets monthly · cancel any time',
    highlight: true,
  },
  {
    id: 'studio',
    label: 'Studio',
    tagline: 'For agencies & production teams',
    priceMonthly: '£49.99',
    priceAnnual: '£41.49',
    priceOTO: '£44.99',
    priceCadence: 'per month',
    bullets: { premium: 30, hq: 60, standard: 180 },
    commitment: 'Resets monthly · cancel any time',
  },
]

interface Props {
  open: boolean
  onClose: () => void
  currentPlan: PlanId
  showOTO?: boolean
  onChoose: (plan: PlanId, cycle: BillingCycle) => void
}

export function PricingModal({ open, onClose, currentPlan, showOTO = false, onChoose }: Props) {
  const [cycle, setCycle] = useState<BillingCycle>('monthly')
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  // Lock scroll while open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Save the element that opened the modal so focus can be returned
    triggerRef.current = document.activeElement as HTMLElement
    // Move focus into the modal
    closeRef.current?.focus()
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // ESC to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  function handleBackdrop() {
    onClose()
    triggerRef.current?.focus()
  }

  function handleChoose(plan: PlanId) {
    onChoose(plan, cycle)
    onClose()
  }

  return createPortal(
    <div
      className="pm-backdrop animate-fade-in"
      role="presentation"
      onClick={handleBackdrop}
    >
      <div
        className="pm-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pm-heading"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="pm-header">
          <div className="pm-header-left">
            <span className="pm-corner pm-corner--tl" aria-hidden />
            <h2 className="pm-heading" id="pm-heading">Choose your plan</h2>
            <p className="pm-subheading">Output framing · prices incl. VAT</p>
          </div>
          <div className="pm-header-right">
            <div className="pm-cycle" role="group" aria-label="Billing cycle">
              <button
                className={`pm-cycle-btn ${cycle === 'monthly' ? 'pm-cycle-btn--active' : ''}`}
                onClick={() => setCycle('monthly')}
                aria-pressed={cycle === 'monthly'}
              >
                Monthly
              </button>
              <button
                className={`pm-cycle-btn ${cycle === 'annual' ? 'pm-cycle-btn--active' : ''}`}
                onClick={() => setCycle('annual')}
                aria-pressed={cycle === 'annual'}
              >
                Annual
                <span className="pm-cycle-save">−17%</span>
              </button>
            </div>
            <button
              ref={closeRef}
              className="pm-close"
              onClick={handleBackdrop}
              aria-label="Close pricing"
            >
              ×
            </button>
          </div>
        </div>

        {/* OTO banner */}
        {showOTO && (
          <div className="pm-oto animate-fade-in">
            <span className="pm-oto-dot" aria-hidden />
            <div>
              <span className="pm-oto-title">Welcome offer — first month only</span>
              <span className="pm-oto-detail">Pro £26.99 · Studio £44.99</span>
            </div>
          </div>
        )}

        {/* Plan cards */}
        <div className="pm-grid">
          {PLANS.map(plan => {
            const isCurrent = currentPlan === plan.id
            const effectiveMonthly = showOTO && plan.priceOTO ? plan.priceOTO : plan.priceMonthly
            const price = cycle === 'annual' ? plan.priceAnnual : effectiveMonthly

            return (
              <article
                key={plan.id}
                className={[
                  'pm-card',
                  plan.highlight ? 'pm-card--highlight' : '',
                  isCurrent ? 'pm-card--current' : '',
                ].filter(Boolean).join(' ')}
              >
                <span className="pm-card-corner pm-card-corner--tl" aria-hidden />
                <span className="pm-card-corner pm-card-corner--tr" aria-hidden />
                <span className="pm-card-corner pm-card-corner--bl" aria-hidden />
                <span className="pm-card-corner pm-card-corner--br" aria-hidden />

                {plan.highlight && !isCurrent && (
                  <span className="pm-card-ribbon">Most popular</span>
                )}
                {isCurrent && (
                  <span className="pm-card-ribbon pm-card-ribbon--current">Current plan</span>
                )}

                <div className="pm-card-head">
                  <span className="pm-card-label">{plan.label}</span>
                  <span className="pm-card-tagline">{plan.tagline}</span>
                </div>

                <div className="pm-card-price">
                  <span className="pm-card-amount">{price}</span>
                  <span className="pm-card-cadence">
                    {plan.id === 'one-time'
                      ? plan.priceCadence
                      : cycle === 'annual'
                        ? '/mo · billed yearly'
                        : '/mo'}
                  </span>
                </div>

                <ul className="pm-card-bullets">
                  <li>
                    <span className="pm-card-num">{plan.bullets.premium}</span>
                    <span className="pm-card-bl">Premium renders</span>
                  </li>
                  <li>
                    <span className="pm-card-num">{plan.bullets.hq}</span>
                    <span className="pm-card-bl">High Quality renders</span>
                  </li>
                  <li>
                    <span className="pm-card-num">{plan.bullets.standard}</span>
                    <span className="pm-card-bl">Standard renders</span>
                  </li>
                </ul>

                <div className="pm-card-footnote">{plan.commitment}</div>

                <button
                  type="button"
                  className={[
                    'pm-card-cta',
                    plan.highlight && !isCurrent ? 'pm-card-cta--primary' : '',
                    isCurrent ? 'pm-card-cta--disabled' : '',
                  ].filter(Boolean).join(' ')}
                  disabled={isCurrent}
                  onClick={() => !isCurrent && handleChoose(plan.id)}
                >
                  {isCurrent
                    ? 'Current plan'
                    : plan.id === 'one-time'
                      ? 'Buy pack'
                      : 'Choose plan'}
                  {!isCurrent && <span className="pm-arrow">→</span>}
                </button>
              </article>
            )
          })}
        </div>

        {/* Enterprise row */}
        <div className="pm-enterprise">
          <div>
            <span className="pm-enterprise-label">Enterprise</span>
            <span className="pm-enterprise-copy">
              Need more than 30 Premium renders a month? Custom volume, dedicated support.
            </span>
          </div>
          <a
            className="pm-enterprise-cta"
            href="mailto:hello@explodify.app?subject=Enterprise%20enquiry"
            onClick={onClose}
          >
            Contact us <span className="pm-arrow">→</span>
          </a>
        </div>

        {/* Footer */}
        <div className="pm-footer">
          <span>Auto-refund on pipeline failure</span>
          <span className="pm-foot-sep">·</span>
          <span>Cancel subscriptions any time</span>
          <span className="pm-foot-sep">·</span>
          <span>Prices incl. 20% UK VAT</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
