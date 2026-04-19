// frontend/src/components/Profile.tsx
import { useEffect, useMemo, useState } from 'react'
import {
  type AccountProfile,
  type AccountUpdate,
  type GalleryTier,
  avatarUrl,
  getAccount,
  getGalleryStats,
  signOutEverywhere,
  updateAccount,
} from '../api/client'
import { ConfirmModal } from './shell/Modal'

type SectionId =
  | 'general'
  | 'plan'
  | 'defaults'
  | 'notifications'
  | 'privacy'

interface RailItem {
  id: SectionId
  index: string
  label: string
  hint: string
}

const RAIL: RailItem[] = [
  { id: 'general',       index: '01', label: 'General',            hint: 'Name & contact' },
  { id: 'plan',          index: '02', label: 'Plan & Credits',     hint: 'Tier, usage, top-ups' },
  { id: 'defaults',      index: '03', label: 'Render Defaults',    hint: 'Axis, duration, engine' },
  { id: 'notifications', index: '04', label: 'Notifications',      hint: 'Render & account alerts' },
  { id: 'privacy',       index: '05', label: 'Privacy & Security', hint: 'Data, sessions, deletion' },
]

// ── Pricing (Obsidian-style: honest, single line of fees) ───────────────────

interface PlanOffer {
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

const UPGRADE_PLANS: PlanOffer[] = [
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

const TOPUP_PACK = {
  label: 'Top-up pack',
  tagline: 'One-time purchase',
  price: '£14.99',
  cadence: 'one-time',
  credits: 150,
  creditsCadence: 'credits · no expiry',
  premium: 5,
  hq: 10,
  standard: 30,
}

const AXIS_OPTIONS: Array<{ value: 'x' | 'y' | 'z'; label: string }> = [
  { value: 'x', label: 'X axis' },
  { value: 'y', label: 'Y axis' },
  { value: 'z', label: 'Z axis' },
]

const DURATION_OPTIONS = ['3s', '5s', '10s']
const ENGINE_OPTIONS   = [
  { value: 'standard', label: 'Standard',     sub: 'Kling 3.0' },
  { value: 'high',     label: 'High Quality', sub: 'Kling 2.5 Pro' },
  { value: 'premium',  label: 'Premium',      sub: 'Kling o1' },
]

type PrefsSection = Record<string, boolean | string>
type Prefs = Record<string, PrefsSection>

const DEFAULT_PREFS: Prefs = {
  notifications: {
    render_complete: true,
    render_failed:   true,
    low_credits:     true,
    product_updates: false,
  },
  privacy: {
    public_gallery_opt_in: false,
    training_opt_out:      false,
  },
  defaults: {
    duration: '3s',
    engine:   'standard',
  },
}

function mergePrefs(base: Prefs, incoming?: Record<string, Record<string, boolean | string>> | null): Prefs {
  if (!incoming) return base
  const out: Prefs = { ...base }
  for (const [key, section] of Object.entries(incoming)) {
    out[key] = { ...(base[key] ?? {}), ...(section ?? {}) }
  }
  return out
}

export function Profile() {
  const [profile, setProfile]   = useState<AccountProfile | null>(null)
  const [prefs, setPrefs]       = useState<Prefs>(DEFAULT_PREFS)
  const [tier, setTier]         = useState<GalleryTier>('free')
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [section, setSection]   = useState<SectionId>('general')
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [deleteOpen, setDeleteOpen]   = useState(false)
  const [avatarBust, setAvatarBust]   = useState<number>(0)
  const [savedFlash, setSavedFlash]   = useState<string | null>(null)

  // Local buffer for text fields so typing doesn't POST on every keystroke.
  const [buf, setBuf] = useState({
    full_name: '',
    username:  '',
    email:     '',
    phone:     '',
  })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [p, stats] = await Promise.all([
          getAccount(),
          getGalleryStats().catch(() => null),
        ])
        if (cancelled) return
        setProfile(p)
        setPrefs(mergePrefs(DEFAULT_PREFS, p.preferences))
        setBuf({
          full_name:    p.full_name    ?? '',
          username:     p.username     ?? '',
          email:        p.email        ?? '',
          phone:        p.phone        ?? '',
        })
        if (p.avatar_path) setAvatarBust(Date.now())
        if (stats?.tier) setTier(stats.tier)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const flash = (msg: string) => {
    setSavedFlash(msg)
    window.setTimeout(() => setSavedFlash(null), 1400)
  }

  const commit = async (fields: AccountUpdate, successMsg = 'Saved') => {
    setSaving(true)
    try {
      const next = await updateAccount(fields)
      setProfile(next)
      setPrefs(mergePrefs(DEFAULT_PREFS, next.preferences))
      if (fields.avatar) setAvatarBust(Date.now())
      flash(successMsg)
    } catch (err) {
      flash('Save failed')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const commitPrefs = async (nextPrefs: Prefs, successMsg?: string) => {
    setPrefs(nextPrefs)
    await commit({ preferences: nextPrefs }, successMsg ?? 'Preferences saved')
  }

  const setPref = (groupKey: keyof typeof DEFAULT_PREFS, field: string, value: boolean | string) => {
    const next: Prefs = {
      ...prefs,
      [groupKey]: { ...(prefs[groupKey] ?? {}), [field]: value },
    }
    void commitPrefs(next)
  }

  const onAvatarChange = async (file: File | null) => {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { flash('Avatar too large (5MB max)'); return }
    await commit({ avatar: file }, 'Avatar updated')
  }

  const onSignOutAll = async () => {
    setSignOutOpen(false)
    try {
      await signOutEverywhere()
      flash('All sessions signed out')
    } catch {
      flash('Sign-out failed')
    }
  }

  const textFieldBlur = (key: keyof typeof buf) => {
    const current = (profile?.[key as keyof AccountProfile] as string | null) ?? ''
    if ((buf[key] ?? '') === current) return
    void commit({ [key]: buf[key] } as AccountUpdate)
  }

  const initials = useMemo(() => {
    const name = (buf.full_name || profile?.full_name || profile?.username || '').trim()
    if (!name) return 'E'
    const parts = name.split(/\s+/)
    if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
  }, [buf.full_name, profile])

  // Credits display (pulled from current tier until billing is wired up).
  const TIER_CREDITS: Record<GalleryTier, number> = { free: 30, pro: 450, studio: 900 }
  const creditsTotal = TIER_CREDITS[tier]
  const creditsRemaining = creditsTotal
  const pct = Math.max(0, Math.min(100, (creditsRemaining / creditsTotal) * 100))
  const isSubscriber = tier === 'pro' || tier === 'studio'

  if (loading) {
    return (
      <div className="settings-page">
        <div className="settings-loading">Loading account…</div>
      </div>
    )
  }

  const avatarSrc = profile?.avatar_path ? avatarUrl(avatarBust) : null

  return (
    <div className="settings-page animate-fade-in">
      <div className="settings-bg" aria-hidden />

      <div className={`settings-save-flash ${savedFlash ? 'is-visible' : ''}`} aria-live="polite">
        {saving ? 'Saving…' : savedFlash ?? ''}
      </div>

      <div className="settings-body">
        {/* ── LEFT RAIL ─────────────────────────────────────────── */}
        <nav className="settings-rail" aria-label="Settings sections">
          {RAIL.map(item => (
            <button
              key={item.id}
              type="button"
              className={`settings-rail-item ${section === item.id ? 'is-active' : ''}`}
              onClick={() => setSection(item.id)}
            >
              <span className="settings-rail-index">{item.index}</span>
              <span className="settings-rail-text">
                <span className="settings-rail-label">{item.label}</span>
                <span className="settings-rail-hint">{item.hint}</span>
              </span>
            </button>
          ))}
        </nav>

        <div className="settings-content">
          {section === 'general' && (
          <section id="general" className="settings-sect">
            <div className="settings-sect-head">
              <span className="settings-sect-index t-mono-label">01 · General</span>
              <h2>Profile</h2>
              <p>Your name, handle, and contact details. These appear on shared clips.</p>
            </div>

            <div className="settings-identity">
              <div className="settings-avatar-wrap">
                <div className="settings-avatar">
                  {avatarSrc
                    ? <img src={avatarSrc} alt="" />
                    : <span className="settings-avatar-initials">{initials}</span>}
                </div>
                <label className="settings-avatar-upload">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={e => onAvatarChange(e.target.files?.[0] ?? null)}
                    hidden
                  />
                  Upload photo
                </label>
                <span className="settings-avatar-hint">PNG, JPG, WEBP · up to 5 MB</span>
              </div>

              <div className="settings-grid">
                <Field label="Full name" hint="How you appear on exports and shared links">
                  <input
                    className="settings-input"
                    value={buf.full_name}
                    onChange={e => setBuf(b => ({ ...b, full_name: e.target.value }))}
                    onBlur={() => textFieldBlur('full_name')}
                    placeholder="Your full name"
                  />
                </Field>

                <Field label="Username" hint="Lowercase, 3–20 characters">
                  <div className="settings-input-prefix">
                    <span className="settings-input-prefix-tag">@</span>
                    <input
                      className="settings-input settings-input--prefixed"
                      value={buf.username}
                      onChange={e => setBuf(b => ({ ...b, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
                      onBlur={() => textFieldBlur('username')}
                      placeholder="handle"
                      maxLength={20}
                    />
                  </div>
                </Field>

                <Field label="Email">
                  <input
                    type="email"
                    className="settings-input"
                    value={buf.email}
                    onChange={e => setBuf(b => ({ ...b, email: e.target.value }))}
                    onBlur={() => textFieldBlur('email')}
                    placeholder="you@studio.com"
                  />
                </Field>

                <Field label="Phone" hint="Optional · for render alerts">
                  <input
                    type="tel"
                    className="settings-input"
                    value={buf.phone}
                    onChange={e => setBuf(b => ({ ...b, phone: e.target.value }))}
                    onBlur={() => textFieldBlur('phone')}
                    placeholder="+44 …"
                  />
                </Field>

              </div>
            </div>
          </section>

          )}
          {section === 'plan' && (
          <section id="plan" className="settings-sect">
            <div className="settings-sect-head">
              <span className="settings-sect-index t-mono-label">02 · Plan & Credits</span>
              <h2>Usage</h2>
              <p>
                {isSubscriber
                  ? 'Your monthly allowance and one-time top-ups.'
                  : 'Your current allowance and subscription options.'}
              </p>
            </div>

            <div className="settings-plan">
              <div className="settings-plan-head">
                <div className="settings-plan-head-left">
                  <span className="settings-plan-badge">{tier.toUpperCase()} TIER</span>
                </div>
                <span className="settings-plan-reset t-mono-label">
                  {tier === 'free' ? 'resets · monthly' : 'resets · monthly'}
                </span>
              </div>

              <div className="settings-credit-row">
                <span className="settings-credit-num">{creditsRemaining}</span>
                <span className="settings-credit-sep">/</span>
                <span className="settings-credit-total">{creditsTotal}</span>
                <span className="settings-credit-unit">credits remaining</span>
              </div>

              <div
                className="settings-bar"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="settings-bar-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>

            <div className="settings-upgrade-grid settings-upgrade-grid--three">
              <article className="settings-upgrade-card" data-accent="slate">
                <span className="settings-upgrade-kind t-mono-label">One-time</span>
                <div className="settings-upgrade-head">
                  <span className="settings-upgrade-label">{TOPUP_PACK.label}</span>
                  <span className="settings-upgrade-tagline">{TOPUP_PACK.tagline}</span>
                </div>
                <div className="settings-upgrade-price">
                  <span className="settings-upgrade-price-num">{TOPUP_PACK.price}</span>
                  <span className="settings-upgrade-price-cadence">{TOPUP_PACK.cadence}</span>
                </div>
                <div className="settings-upgrade-credits">
                  <span className="settings-upgrade-credits-num">{TOPUP_PACK.credits}</span>
                  <span className="settings-upgrade-credits-cadence">{TOPUP_PACK.creditsCadence}</span>
                </div>
                <ul className="settings-upgrade-bullets">
                  <li>
                    <span className="settings-upgrade-num">{TOPUP_PACK.premium}</span>
                    <span>Premium renders</span>
                  </li>
                  <li>
                    <span className="settings-upgrade-num">{TOPUP_PACK.hq}</span>
                    <span>High Quality renders</span>
                  </li>
                  <li>
                    <span className="settings-upgrade-num">{TOPUP_PACK.standard}</span>
                    <span>Standard renders</span>
                  </li>
                </ul>
                <button
                  type="button"
                  className="settings-btn"
                  onClick={() => flash('Top-up requires billing — coming soon')}
                >
                  Buy top-up <span aria-hidden>→</span>
                </button>
              </article>

              {!isSubscriber && UPGRADE_PLANS.map(plan => (
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
                    onClick={() => flash('Upgrades require billing — coming soon')}
                  >
                    Choose {plan.label} <span aria-hidden>→</span>
                  </button>
                </article>
              ))}
            </div>
          </section>

          )}
          {section === 'defaults' && (
          <section id="defaults" className="settings-sect">
            <div className="settings-sect-head">
              <span className="settings-sect-index t-mono-label">03 · Render Defaults</span>
              <h2>Starting point</h2>
              <p>What a fresh project picks up when you open it.</p>
            </div>

            <div className="settings-grid settings-grid--tight">
              <Field label="Default explosion axis">
                <div className="settings-seg">
                  {AXIS_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`settings-seg-btn ${profile?.axis_preference === opt.value ? 'is-active' : ''}`}
                      onClick={() => void commit({ axis_preference: opt.value })}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Default duration">
                <div className="settings-seg">
                  {DURATION_OPTIONS.map(d => (
                    <button
                      key={d}
                      type="button"
                      className={`settings-seg-btn ${prefs.defaults?.duration === d ? 'is-active' : ''}`}
                      onClick={() => setPref('defaults', 'duration', d)}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Default engine" hint="Cost per render varies by tier" full>
                <div className="settings-pref-grid">
                  {ENGINE_OPTIONS.map(eng => {
                    const active = prefs.defaults?.engine === eng.value
                    return (
                      <button
                        key={eng.value}
                        type="button"
                        className={`settings-pref-card ${active ? 'is-active' : ''}`}
                        onClick={() => setPref('defaults', 'engine', eng.value)}
                      >
                        <span className="settings-pref-card-label">{eng.label}</span>
                        <span className="settings-pref-card-sub">{eng.sub}</span>
                      </button>
                    )
                  })}
                </div>
              </Field>
            </div>
          </section>

          )}
          {section === 'notifications' && (
          <section id="notifications" className="settings-sect">
            <div className="settings-sect-head">
              <span className="settings-sect-index t-mono-label">04 · Notifications</span>
              <h2>What we tell you</h2>
              <p>In-app and email alerts. Phone alerts when a number is on file.</p>
            </div>

            <ToggleRow
              label="Render complete"
              hint="Ping when a job finishes"
              checked={Boolean(prefs.notifications?.render_complete)}
              onChange={v => setPref('notifications', 'render_complete', v)}
            />
            <ToggleRow
              label="Render failed"
              hint="Ping when a job errors out"
              checked={Boolean(prefs.notifications?.render_failed)}
              onChange={v => setPref('notifications', 'render_failed', v)}
            />
            <ToggleRow
              label="Low credits"
              hint="Warn when monthly balance drops below 20%"
              checked={Boolean(prefs.notifications?.low_credits)}
              onChange={v => setPref('notifications', 'low_credits', v)}
            />
            <ToggleRow
              label="Product updates"
              hint="Occasional release notes. No marketing."
              checked={Boolean(prefs.notifications?.product_updates)}
              onChange={v => setPref('notifications', 'product_updates', v)}
            />
          </section>

          )}
          {section === 'privacy' && (
          <section id="privacy" className="settings-sect">
            <div className="settings-sect-head">
              <span className="settings-sect-index t-mono-label">05 · Privacy & Security</span>
              <h2>Your data</h2>
              <p>What we show to others, and the controls over your account and sessions.</p>
            </div>

            <ToggleRow
              label="Show in public gallery"
              hint="Featured renders may appear in the community showcase"
              checked={Boolean(prefs.privacy?.public_gallery_opt_in)}
              onChange={v => setPref('privacy', 'public_gallery_opt_in', v)}
            />
            <ToggleRow
              label="Opt out of training"
              hint="Keeps your uploads out of model improvement"
              checked={Boolean(prefs.privacy?.training_opt_out)}
              onChange={v => setPref('privacy', 'training_opt_out', v)}
            />

            <div className="settings-subzone settings-subzone--danger">
              <div className="settings-subzone-head">
                <span className="settings-subzone-index t-mono-label">Danger zone</span>
                <p>Irreversible actions. Take a breath first.</p>
              </div>

              <div className="settings-danger-row">
                <div>
                  <div className="settings-danger-label">Sign out everywhere</div>
                  <div className="settings-danger-hint">Revoke all active sessions on every device.</div>
                </div>
                <button type="button" className="settings-btn" onClick={() => setSignOutOpen(true)}>
                  Sign out all sessions
                </button>
              </div>

              <div className="settings-danger-row">
                <div>
                  <div className="settings-danger-label">Delete account</div>
                  <div className="settings-danger-hint">Removes your profile, gallery, and renders. Cannot be undone.</div>
                </div>
                <button type="button" className="settings-btn settings-btn--danger" onClick={() => setDeleteOpen(true)}>
                  Delete account
                </button>
              </div>
            </div>
          </section>
          )}

          <footer className="settings-footer">
            <span>© Explodify Studio</span>
            <span className="settings-foot-sep">·</span>
            <span>Auto-refund on pipeline failure</span>
            <span className="settings-foot-sep">·</span>
            <span>Prices incl. 20% UK VAT</span>
          </footer>
        </div>
      </div>

      <ConfirmModal
        open={signOutOpen}
        title="Sign out everywhere?"
        message="You'll be signed out on every device and need to log in again."
        confirmLabel="Sign out all"
        onConfirm={onSignOutAll}
        onCancel={() => setSignOutOpen(false)}
      />

      <ConfirmModal
        open={deleteOpen}
        title="Delete your account?"
        message="This permanently removes your profile, saved gallery, and renders. This action cannot be undone."
        confirmLabel="Delete account"
        destructive
        onConfirm={() => { setDeleteOpen(false); flash('Deletion requires auth — coming soon') }}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  )
}

// ── Small primitives ─────────────────────────────────────────────────────────

interface FieldProps {
  label: string
  hint?: string
  full?: boolean
  children: React.ReactNode
}

function Field({ label, hint, full, children }: FieldProps) {
  return (
    <label className={`settings-field ${full ? 'settings-field--full' : ''}`}>
      <span className="settings-field-label">{label}</span>
      {children}
      {hint && <span className="settings-field-hint">{hint}</span>}
    </label>
  )
}

interface ToggleRowProps {
  label: string
  hint?: string
  checked: boolean
  onChange: (next: boolean) => void
}

function ToggleRow({ label, hint, checked, onChange }: ToggleRowProps) {
  return (
    <div className="settings-toggle-row">
      <div className="settings-toggle-text">
        <div className="settings-toggle-label">{label}</div>
        {hint && <div className="settings-toggle-hint">{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`settings-switch ${checked ? 'is-on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="settings-switch-thumb" />
      </button>
    </div>
  )
}
