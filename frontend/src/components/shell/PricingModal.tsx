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
  bullets: { premium: number; hq: number; standard: number }
}

export interface TopupPack {
  id: 'starter' | 'standard'
  label: string
  tagline: string
  price: string
  cadence: string
  credits: number
  creditsCadence: string
  premium: number
  hq: number
  standard: number
}

export const UPGRADE_PLANS: PlanOffer[] = [
  {
    id: 'pro',
    label: 'Pro',
    tagline: 'For freelancers & solo studios',
    price: '£29.99',
    cadence: '/mo',
    credits: 450,
    creditsCadence: 'credits / month',
    accent: 'amber',
    bullets: { premium: 15, hq: 30, standard: 90 },
  },
  {
    id: 'studio',
    label: 'Studio',
    tagline: 'For agencies & production teams',
    price: '£49.99',
    cadence: '/mo',
    credits: 900,
    creditsCadence: 'credits / month',
    accent: 'teal',
    bullets: { premium: 30, hq: 60, standard: 180 },
  },
]

export const TOPUP_PACKS: TopupPack[] = [
  {
    id: 'starter',
    label: 'Starter pack',
    tagline: 'Smallest pack',
    price: '£6.99',
    cadence: 'one-time',
    credits: 60,
    creditsCadence: 'credits · no expiry',
    premium: 2,
    hq: 4,
    standard: 12,
  },
  {
    id: 'standard',
    label: 'Standard pack',
    tagline: 'No commitment',
    price: '£14.99',
    cadence: 'one-time',
    credits: 150,
    creditsCadence: 'credits · no expiry',
    premium: 5,
    hq: 10,
    standard: 30,
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
    <div className="settings-upgrade-grid settings-upgrade-grid--four">
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
              <span className="settings-upgrade-num">{pack.premium}</span>
              <span>Premium renders</span>
            </li>
            <li>
              <span className="settings-upgrade-num">{pack.hq}</span>
              <span>High Quality renders</span>
            </li>
            <li>
              <span className="settings-upgrade-num">{pack.standard}</span>
              <span>Standard renders</span>
            </li>
            <li className="settings-upgrade-perk">
              <span className="settings-upgrade-perk-mark" aria-hidden>—</span>
              <span>Permanently removes watermarks</span>
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
              <span className="settings-upgrade-num">{plan.bullets.premium}</span>
              <span>Premium renders</span>
            </li>
            <li>
              <span className="settings-upgrade-num">{plan.bullets.hq}</span>
              <span>High Quality renders</span>
            </li>
            <li>
              <span className="settings-upgrade-num">{plan.bullets.standard}</span>
              <span>Standard renders</span>
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
    <Modal open={open} onClose={onClose} title={title} size="lg">
      <p className="ex-modal-subtitle">{subtitle}</p>
      <PricingCards />
    </Modal>
  )
}

export default PricingModal
