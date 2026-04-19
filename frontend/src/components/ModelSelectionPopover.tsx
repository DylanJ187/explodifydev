// frontend/src/components/ModelSelectionPopover.tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MODEL_TIER_CREDITS, MODEL_TIER_LABELS } from '../api/client'
import type { ModelTier } from '../api/client'
import { CreditIcon } from './StylePanel'

const TIER_ORDER: ModelTier[] = ['premium', 'high_quality', 'standard']

const TIER_MODEL: Record<ModelTier, string> = {
  premium: 'Kling o1',
  high_quality: 'Kling 2.5 Pro',
  standard: 'Kling 3.0',
}

interface Props {
  open: boolean
  anchorRef: React.RefObject<HTMLButtonElement | null>
  modelTier: ModelTier
  creditsRemaining: number
  onSelect: (tier: ModelTier) => void
  onClose: () => void
}

interface Coords { top: number; left: number }

export function ModelSelectionPopover({
  open,
  anchorRef,
  modelTier,
  creditsRemaining,
  onSelect,
  onClose,
}: Props) {
  const popRef = useRef<HTMLDivElement | null>(null)
  const [coords, setCoords] = useState<Coords | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    const btn = anchorRef.current
    if (!btn) return
    const update = () => {
      const rect = btn.getBoundingClientRect()
      setCoords({
        top: rect.top + rect.height / 2,
        left: rect.right + 10,
      })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, anchorRef])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (popRef.current?.contains(t)) return
      if (anchorRef.current?.contains(t)) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, onClose, anchorRef])

  if (!open || !coords) return null

  return createPortal(
    <div
      ref={popRef}
      className="model-popover"
      role="radiogroup"
      aria-label="Render quality"
      style={{ top: coords.top, left: coords.left }}
    >
      <span className="model-popover-arrow" aria-hidden />
      {TIER_ORDER.map(tier => {
        const cost = MODEL_TIER_CREDITS[tier]
        const cantAfford = creditsRemaining < cost
        const active = tier === modelTier
        return (
          <button
            key={tier}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={cantAfford}
            className={[
              'model-pill',
              active ? 'model-pill--active' : '',
              cantAfford ? 'model-pill--disabled' : '',
            ].filter(Boolean).join(' ')}
            onClick={() => {
              if (cantAfford) return
              onSelect(tier)
              onClose()
            }}
          >
            <span className="model-pill-text">
              <span className="model-pill-tier">{MODEL_TIER_LABELS[tier]}</span>
              <span className="model-pill-name">{TIER_MODEL[tier]}</span>
            </span>
            <span className="model-pill-cost">
              <CreditIcon size={11} />
              <span>{cost}</span>
            </span>
          </button>
        )
      })}
    </div>,
    document.body,
  )
}

export default ModelSelectionPopover
