import { useRef } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { DemoReel } from './DemoReel'
import { HeroTitle } from './HeroTitle'
import { HeroBackdrop } from './HeroBackdrop'
import { useLoopClock } from './useLoopClock'

const EASE = [0.2, 0.8, 0.2, 1] as const

export function Hero() {
  const navigate = useNavigate()
  const sectionRef = useRef<HTMLElement>(null)
  const tRef = useLoopClock(sectionRef)

  return (
    <section ref={sectionRef} className="landing-hero">
      <HeroBackdrop />

      <div className="landing-hero__inner">
      <div className="landing-hero__col landing-hero__col--text">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <HeroTitle tRef={tRef} />
        </motion.div>

        <motion.p
          className="landing-hero__sub"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.18, ease: EASE }}
        >
          Turn your CAD files into full blown commercials in minutes.
        </motion.p>

        <motion.div
          className="landing-hero__cta-row"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.28, ease: EASE }}
        >
          <button
            type="button"
            className="landing-cta landing-cta--primary"
            onClick={() => navigate('/login')}
          >
            Start free
            <span className="landing-cta__arrow" aria-hidden>→</span>
          </button>
        </motion.div>
      </div>

      <motion.div
        className="landing-hero__col landing-hero__col--reel"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.75, delay: 0.25, ease: EASE }}
      >
        <DemoReel tRef={tRef} />
      </motion.div>
      </div>
    </section>
  )
}

export default Hero
