import { useEffect, useState } from 'react'
import { LOOP_DURATION } from './useLoopClock'
import { MARK } from './DemoReel'

const FROM_STR = 'CAD'
const TO_STR = 'CINEMATIC AD'
const TRK = 0.015

interface Layout {
  fromPos: number[]
  toPos: number[]
  trackW: number
  fromEnd: number  // right edge (em) of last CAD glyph
  toEnd: number    // right edge (em) of last CINEMATIC AD glyph
}

// Fallback metrics (Bebas Neue-ish) used until the real font loads and we re-measure.
const FB_W: Record<string, number> = {
  C: 0.48, I: 0.18, N: 0.54, E: 0.44, M: 0.66,
  A: 0.50, T: 0.44, D: 0.52, ' ': 0.24,
}

function buildLayout(widthOf: (ch: string) => number): Layout {
  const lay = (str: string): number[] => {
    const out: number[] = []
    let x = 0
    for (const ch of str) {
      out.push(x)
      x += widthOf(ch) + TRK
    }
    return out
  }
  const fromPos = lay(FROM_STR)
  const toPos = lay(TO_STR)
  const lastFrom = FROM_STR[FROM_STR.length - 1]
  const lastTo = TO_STR[TO_STR.length - 1]
  const fromEnd = fromPos[fromPos.length - 1] + widthOf(lastFrom)
  const toEnd = toPos[toPos.length - 1] + widthOf(lastTo)
  const trackW = toEnd + 0.1
  return { fromPos, toPos, trackW, fromEnd, toEnd }
}

const FALLBACK_LAYOUT: Layout = buildLayout((ch) => FB_W[ch] ?? 0.5)

function measureWithFont(): Layout | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const PX = 1000
  ctx.font = `400 ${PX}px "Bebas Neue", sans-serif`
  return buildLayout((ch) => ctx.measureText(ch).width / PX)
}

type Glyph = { ch: string; toIdx: number; fromIdx: number }

// Map CAD letters to their targets in CINEMATIC AD:
//   C(0)→0   A(1)→10   D(2)→11
// Everything else is a new letter (fromIdx = -1).
const LETTERS: Glyph[] = [
  { ch: 'C', toIdx: 0, fromIdx: 0 },
  { ch: 'I', toIdx: 1, fromIdx: -1 },
  { ch: 'N', toIdx: 2, fromIdx: -1 },
  { ch: 'E', toIdx: 3, fromIdx: -1 },
  { ch: 'M', toIdx: 4, fromIdx: -1 },
  { ch: 'A', toIdx: 5, fromIdx: -1 },
  { ch: 'T', toIdx: 6, fromIdx: -1 },
  { ch: 'I', toIdx: 7, fromIdx: -1 },
  { ch: 'C', toIdx: 8, fromIdx: -1 },
  { ch: 'A', toIdx: 10, fromIdx: 1 },
  { ch: 'D', toIdx: 11, fromIdx: 2 },
]

function smooth(t: number, a: number, b: number): number {
  if (t <= a) return 0
  if (t >= b) return 1
  const u = (t - a) / (b - a)
  return u * u * (3 - 2 * u)
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u
}

interface Props {
  tRef: React.MutableRefObject<number>
}

// Morph window aligned to demo stage 4 (post-generate wipe).
// Forward stretches ~2s so the transition reads slow and deliberate.
const MORPH_START = MARK.wipeStart - 0.3
const MORPH_END = MARK.wipeStart + 1.7
const REVERSE_START = LOOP_DURATION - 0.9
const REVERSE_END = LOOP_DURATION - 0.15

export function HeroTitle({ tRef }: Props) {
  const [, setTick] = useState(0)
  const [layout, setLayout] = useState<Layout>(FALLBACK_LAYOUT)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      setTick((n) => (n + 1) & 0xffff)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    const apply = () => {
      const measured = measureWithFont()
      if (measured) setLayout(measured)
    }
    if (document.fonts?.ready) {
      document.fonts.ready.then(apply).catch(apply)
    } else {
      apply()
    }
  }, [])

  const { fromPos, toPos, trackW, fromEnd } = layout

  const t = tRef.current
  const forward = smooth(t, MORPH_START, MORPH_END)
  const reverse = smooth(t, REVERSE_START, REVERSE_END)
  const moveMorph = forward * (1 - reverse)

  // "goes in" lives next to CAD at the start; fades as morph proceeds.
  const goesInOp = 1 - moveMorph
  // "comes out" sits in the bottom row; fades in as the main row lifts up.
  const comesOutAppear = smooth(t, MARK.wipeStart + 0.4, MARK.wipeStart + 1.9)
  const comesOutDisappear = smooth(t, LOOP_DURATION - 0.75, LOOP_DURATION - 0.1)
  const comesOutOp = comesOutAppear * (1 - comesOutDisappear)

  // The main row (CAD → CINEMATIC AD + "goes in" tail) starts anchored to the
  // bottom slot of a 2-row box, then shifts upward into the top slot as it
  // morphs. "comes out" stays fixed in the bottom slot. This keeps the
  // subtitle/CTA below from moving while the title gains a second line.
  const ROW_STEP = 1.05
  const rowLiftEm = (1 - moveMorph) * ROW_STEP

  return (
    <h1 className="hero-title" aria-label="CAD goes in. Cinematic ad comes out.">
      <span
        className="hero-title__row"
        style={{
          width: `${trackW + 3.4}em`,
          transform: `translateY(${rowLiftEm}em)`,
        }}
      >
        <span
          className="hero-title__track"
          style={{ width: `${trackW}em` }}
        >
          {LETTERS.map((L, idx) => {
            const toLeft = toPos[L.toIdx]
            // Per-letter wipe phase: left letters go gold first, matching the cube wipe.
            const phase = L.toIdx / 11
            const goldStart = MARK.wipeStart - 0.2 + phase * 1.2
            const goldEnd = goldStart + 0.7

            let leftEm: number
            let tyEm = 0
            let wireOp: number
            let goldOp: number

            if (L.fromIdx >= 0) {
              // CAD letters stay gold throughout — same treatment as CINEMATIC AD.
              leftEm = lerp(fromPos[L.fromIdx], toLeft, moveMorph)
              wireOp = 0
              goldOp = 1
            } else {
              leftEm = toLeft
              const appear = smooth(t, goldStart - 0.05, goldEnd)
              const disappear = smooth(t, LOOP_DURATION - 0.8, LOOP_DURATION - 0.1)
              const visible = appear * (1 - disappear)
              tyEm = (1 - appear) * -0.2
              wireOp = 0
              goldOp = visible
            }

            return (
              <span
                key={idx}
                className="hero-title__glyph"
                style={{
                  transform: `translate(${leftEm}em, ${tyEm}em)`,
                }}
              >
                <span
                  className="hero-title__glyph-wire"
                  style={{ opacity: wireOp }}
                >
                  {L.ch === ' ' ? '\u00a0' : L.ch}
                </span>
                <span
                  className="hero-title__glyph-gold"
                  style={{ opacity: goldOp }}
                >
                  {L.ch === ' ' ? '\u00a0' : L.ch}
                </span>
              </span>
            )
          })}
        </span>

        <span
          className="hero-title__tail hero-title__tail--goesin"
          style={{
            opacity: goesInOp,
            left: `${fromEnd + 0.25}em`,
          }}
          aria-hidden
        >
          <span className="hero-title__tail-text">
            goes in
            <span className="hero-title__dots" aria-hidden>
              <span className="hero-title__dot">.</span>
              <span className="hero-title__dot">.</span>
              <span className="hero-title__dot">.</span>
            </span>
          </span>
        </span>
      </span>

      <span
        className="hero-title__comesout"
        style={{ opacity: comesOutOp }}
        aria-hidden
      >
        comes out.
      </span>
    </h1>
  )
}

export default HeroTitle
