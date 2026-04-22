// frontend/src/components/shell/PricingModal.tsx
import { Modal } from './Modal'

export interface PlanOffer {
  id: 'pro' | 'studio'
  label: string
  tagline: string
  price: string
  cadence: string
  credits: number
  creditsCadence: string
  accent: 'amber' | 'teal'
  renders: number
}

export interface TopupPack {
  id: 'standard'
  label: string
  tagline: string
  price: string
  cadence: string
  credits: number
  creditsCadence: string
  renders: number
}

export const UPGRADE_PLANS: PlanOffer[] = [
  {
    id: 'pro',
    label: 'Pro',
    tagline: 'For freelancers & solo studios',
    price: '£29.99',
    cadence: '/mo',
    credits: 300,
    creditsCadence: 'credits / month',
    accent: 'amber',
    renders: 30,
  },
  {
    id: 'studio',
    label: 'Studio',
    tagline: 'For agencies & production teams',
    price: '£49.99',
    cadence: '/mo',
    credits: 700,
    creditsCadence: 'credits / month',
    accent: 'teal',
    renders: 70,
  },
]

export const TOPUP_PACKS: TopupPack[] = [
  {
    id: 'standard',
    label: 'Standard pack',
    tagline: 'No commitment',
    price: '£14.99',
    cadence: 'one-time',
    credits: 100,
    creditsCadence: 'credits · no expiry',
    renders: 10,
  },
]

interface PricingCardsProps {
  /** Hide subscription plans (used in Profile when already subscribed). */
  hideSubscriptions?: boolean
  onBuyPack?: (pack: TopupPack) => void
  onChoosePlan?: (plan: PlanOffer) => void
}

export function PricingCards({
  hideSubscriptions = false,
  onBuyPack,
  onChoosePlan,
}: PricingCardsProps) {
  return (
    <div className="settings-upgrade-grid">
      {TOPUP_PACKS.map(pack => (
        <article key={pack.id} className="settings-upgrade-card" data-accent="slate">
          <span className="settings-upgrade-kind t-mono-label">One-time</span>
          <div className="settings-upgrade-head">
            <span className="settings-upgrade-label">{pack.label}</span>
            <span className="settings-upgrade-tagline">{pack.tagline}</span>
          </div>
          <div className="settings-upgrade-price">
            <span className="settings-upgrade-price-num">{pack.price}</span>
            <span className="settings-upgrade-price-cadence">{pack.cadence}</span>
          </div>
          <div className="settings-upgrade-credits">
            <span className="settings-upgrade-credits-num">{pack.credits}</span>
            <span className="settings-upgrade-credits-cadence">{pack.creditsCadence}</span>
          </div>
          <ul className="settings-upgrade-bullets">
            <li>
              <span className="settings-upgrade-num">{pack.renders}</span>
              <span>Cinematic renders</span>
            </li>
          </ul>
          <button
            type="button"
            className="settings-btn"
            onClick={() => onBuyPack?.(pack)}
          >
            Buy {pack.label.replace(' pack', '').toLowerCase()} <span aria-hidden>→</span>
          </button>
        </article>
      ))}

      {!hideSubscriptions && UPGRADE_PLANS.map(plan => (
        <article key={plan.id} className="settings-upgrade-card" data-accent={plan.accent}>
          <span className="settings-upgrade-kind t-mono-label">Monthly</span>
          <div className="settings-upgrade-head">
            <span className="settings-upgrade-label">{plan.label}</span>
            <span className="settings-upgrade-tagline">{plan.tagline}</span>
          </div>
          <div className="settings-upgrade-price">
            <span className="settings-upgrade-price-num">{plan.price}</span>
            <span className="settings-upgrade-price-cadence">{plan.cadence}</span>
          </div>
          <div className="settings-upgrade-credits">
            <span className="settings-upgrade-credits-num">{plan.credits}</span>
            <span className="settings-upgrade-credits-cadence">{plan.creditsCadence}</span>
          </div>
          <ul className="settings-upgrade-bullets">
            <li>
              <span className="settings-upgrade-num">{plan.renders}</span>
              <span>Cinematic renders / month</span>
            </li>
          </ul>
          <button
            type="button"
            className="settings-btn"
            onClick={() => onChoosePlan?.(plan)}
          >
            Choose {plan.label} <span aria-hidden>→</span>
          </button>
        </article>
      ))}
    </div>
  )
}

interface PricingModalProps {
  open: boolean
  onClose: () => void
  title?: string
  subtitle?: string
}

export function PricingModal({
  open,
  onClose,
  title = 'Unlock downloads',
  subtitle = 'Remove watermarks and export clean MP4s. Pick a one-time pack or a monthly plan.',
}: PricingModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="xl">
      <p className="ex-modal-subtitle">{subtitle}</p>
      <PricingCards />
    </Modal>
  )
}

export default PricingModal
