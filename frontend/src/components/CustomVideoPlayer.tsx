// frontend/src/components/CustomVideoPlayer.tsx
import { useEffect, useRef, useState } from 'react'

interface Props {
  src: string
  posterSrc?: string
  downloadName?: string
  canDownload?: boolean
  autoPlay?: boolean
  loop?: boolean
  watermark?: string
  onUpgradeClick?: () => void
}

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) return '0:00'
  const s = Math.floor(t)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

export function CustomVideoPlayer({
  src,
  posterSrc,
  downloadName,
  canDownload = false,
  autoPlay = true,
  loop = true,
  watermark = 'EXPLODIFY',
  onUpgradeClick,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const shellRef = useRef<HTMLDivElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true)
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [hovering, setHovering] = useState(false)
  const [upgradePulse, setUpgradePulse] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onTime = () => setCurrent(v.currentTime)
    const onMeta = () => setDuration(v.duration)
    const onProg = () => {
      if (v.buffered.length > 0) setBuffered(v.buffered.end(v.buffered.length - 1))
    }
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('timeupdate', onTime)
    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('progress', onProg)
    return () => {
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('progress', onProg)
    }
  }, [src])

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  function togglePlay() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play().catch(() => { /* autoplay block */ })
    else v.pause()
  }

  function toggleMute() {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
  }

  function onSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const v = videoRef.current
    if (!v) return
    const pct = Number(e.target.value) / 1000
    v.currentTime = pct * duration
  }

  function toggleFullscreen() {
    const el = shellRef.current
    if (!el) return
    if (!document.fullscreenElement) el.requestFullscreen?.()
    else document.exitFullscreen?.()
  }

  function handleDownloadBlocked() {
    setUpgradePulse(true)
    onUpgradeClick?.()
    window.setTimeout(() => setUpgradePulse(false), 900)
  }

  const progressPct = duration > 0 ? (current / duration) * 100 : 0
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0

  return (
    <div
      ref={shellRef}
      className={`cvp ${hovering || !playing ? 'cvp--show-chrome' : ''} ${isFullscreen ? 'cvp--fullscreen' : ''}`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onContextMenu={canDownload ? undefined : e => e.preventDefault()}
    >
      <video
        ref={videoRef}
        src={src}
        poster={posterSrc}
        autoPlay={autoPlay}
        loop={loop}
        muted={muted}
        playsInline
        className="cvp-video"
        controlsList="nodownload noremoteplayback noplaybackrate"
        disablePictureInPicture
        onClick={togglePlay}
      />

      {/* Corner registration marks — matches profile aesthetic */}
      <span className="cvp-corner cvp-corner--tl" aria-hidden />
      <span className="cvp-corner cvp-corner--tr" aria-hidden />
      <span className="cvp-corner cvp-corner--bl" aria-hidden />
      <span className="cvp-corner cvp-corner--br" aria-hidden />

      {/* Watermark — always visible, louder for free tier */}
      {!canDownload && (
        <div className="cvp-watermark" aria-hidden>
          <span className="cvp-watermark-dot" />
          <span className="cvp-watermark-text">{watermark}</span>
          <span className="cvp-watermark-trial">free tier · preview</span>
        </div>
      )}

      {/* Center play overlay when paused */}
      {!playing && (
        <button
          type="button"
          className="cvp-center-play"
          onClick={togglePlay}
          aria-label="Play"
        >
          <span className="cvp-center-play-icon" aria-hidden>
            <svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
          </span>
        </button>
      )}

      {/* Chrome bar */}
      <div className="cvp-chrome">
        <div className="cvp-scrub">
          <div className="cvp-scrub-rail" aria-hidden>
            <div className="cvp-scrub-buffered" style={{ width: `${bufferedPct}%` }} />
            <div className="cvp-scrub-progress" style={{ width: `${progressPct}%` }}>
              <span className="cvp-scrub-knob" />
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={1000}
            value={duration > 0 ? (current / duration) * 1000 : 0}
            onChange={onSeek}
            className="cvp-scrub-input"
            aria-label="Seek"
          />
        </div>

        <div className="cvp-bar">
          <button
            type="button"
            className="cvp-btn"
            onClick={togglePlay}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <svg viewBox="0 0 24 24" width="14" height="14"><path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="14" height="14"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
            )}
          </button>

          <button
            type="button"
            className="cvp-btn"
            onClick={toggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? (
              <svg viewBox="0 0 24 24" width="14" height="14"><path d="M3 9v6h4l5 4V5L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" fill="currentColor"/><path d="M19 12l3 3m0-6l-3 3" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="14" height="14"><path d="M3 9v6h4l5 4V5L7 9H3zm11.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" fill="currentColor"/></svg>
            )}
          </button>

          <div className="cvp-time">
            <span className="cvp-time-cur">{fmt(current)}</span>
            <span className="cvp-time-sep">/</span>
            <span className="cvp-time-dur">{fmt(duration)}</span>
          </div>

          <div className="cvp-spacer" />

          {canDownload ? (
            <a
              className="cvp-btn cvp-btn--primary"
              href={src}
              download={downloadName}
              aria-label="Download"
            >
              <svg viewBox="0 0 24 24" width="13" height="13"><path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z" fill="currentColor"/></svg>
              <span className="cvp-btn-label">Download</span>
            </a>
          ) : (
            <button
              type="button"
              className={`cvp-btn cvp-btn--locked ${upgradePulse ? 'cvp-btn--pulse' : ''}`}
              onClick={handleDownloadBlocked}
              aria-label="Upgrade to download"
            >
              <svg viewBox="0 0 24 24" width="13" height="13"><path d="M12 17a2 2 0 100-4 2 2 0 000 4zm6-7h-1V7a5 5 0 10-10 0v3H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2zM8.9 7a3.1 3.1 0 016.2 0v3H8.9V7z" fill="currentColor"/></svg>
              <span className="cvp-btn-label">Upgrade to download</span>
            </button>
          )}

          <button
            type="button"
            className="cvp-btn"
            onClick={toggleFullscreen}
            aria-label="Fullscreen"
          >
            <svg viewBox="0 0 24 24" width="13" height="13"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" fill="currentColor"/></svg>
          </button>
        </div>
      </div>
    </div>
  )
}
