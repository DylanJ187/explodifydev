import { useEffect, useRef, useState } from 'react'

export const LOOP_DURATION = 15

export function useLoopClock(containerRef: React.RefObject<HTMLElement | null>) {
  const tRef = useRef(0)
  const [, setTick] = useState(0)
  const visibleRef = useRef(true)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting
      },
      { threshold: 0.05 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [containerRef])

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      tRef.current = 13.4
      setTick((n) => n + 1)
      return
    }

    let raf = 0
    let last: number | null = null
    const tick = (ts: number) => {
      if (last == null) last = ts
      const dt = Math.min(0.05, (ts - last) / 1000)
      last = ts
      if (visibleRef.current) {
        tRef.current = (tRef.current + dt) % LOOP_DURATION
      }
      setTick((n) => (n + 1) & 0xffff)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return tRef
}
