// frontend/src/App.tsx
import { useState, useEffect, useRef } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { UploadZone } from './components/UploadZone'
import { StylePanel } from './components/StylePanel'
import { EasingEditor, ORBIT_EASING_PRESETS, CINEMATIC_EXPLOSION_SAMPLES, CINEMATIC_ORBIT_SAMPLES } from './components/EasingEditor'
import type { OrbitMode, OrbitDirection } from './components/orientation/createViewer'
import { MeshViewer } from './components/MeshViewer'
import type { MeshViewerHandle } from './components/MeshViewer'
import { IdleOutput } from './components/IdleOutput'
import { LoadingOutput } from './components/LoadingOutput'
import { VideoOutput } from './components/VideoOutput'
import { CustomVideoPlayer } from './components/CustomVideoPlayer'
import { SaveToGalleryButton } from './components/SaveToGalleryButton'
import { LoopModeSelector } from './components/LoopModeSelector'
import { TopNav } from './components/TopNav'
import type { NavTab } from './components/TopNav'
import CreditsBlocks from './components/shell/CreditsBlocks'
import CubeLogo from './components/shell/CubeLogo'
import { Gallery } from './components/Gallery'
import { Profile } from './components/Profile'
import { JobQueueProvider, useJobQueue } from './contexts/JobQueueContext'
import { JobQueueIndicator } from './components/JobQueueIndicator'
import { getPreviewImages, createJob, getJobStatus, approvePhase4, restyleJob } from './api/client'
import type { JobStatus, LoopMode, PreviewResult, VariantName } from './api/client'
import RequireAuth from './routes/RequireAuth'
import RootRedirect from './routes/RootRedirect'
import { useActiveTab, pathForTab } from './routes/useActiveTab'
import LoginPage from './pages/LoginPage'
import AuthCallback from './pages/AuthCallback'
import LandingPage from './pages/LandingPage'

type AppState = 'idle' | 'uploading' | 'orientation' | 'processing' | 'awaiting_approval' | 'styling' | 'done' | 'error'

export interface Row {
  part: string
  material: string
}

export interface StyleOptions {
  rows: Row[]
  prompt: string
}

export interface RestyleEntry {
  jobId: string
  status: 'generating' | 'done' | 'error'
  variants: VariantName[]
  aiStyled: boolean
}

const DEFAULT_STYLE: StyleOptions = {
  rows: [
    { part: '', material: '' },
    { part: '', material: '' },
    { part: '', material: '' },
  ],
  prompt: '',
}

const DEFAULT_EASING = CINEMATIC_EXPLOSION_SAMPLES
const DEFAULT_ORBIT_EASING = CINEMATIC_ORBIT_SAMPLES

export default function App() {
  return (
    <JobQueueProvider>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/landing" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route element={<RequireAuth />}>
          <Route path="/gallery" element={<AppInner />} />
          <Route path="/studio" element={<AppInner />} />
          <Route path="/profile" element={<AppInner />} />
          <Route path="/dashboard" element={<Navigate to="/gallery" replace />} />
          <Route path="/projects" element={<Navigate to="/gallery" replace />} />
        </Route>
      </Routes>
      <JobQueueIndicator />
    </JobQueueProvider>
  )
}

function AppInner() {
  const tab: NavTab = useActiveTab()
  const navigate = useNavigate()
  const location = useLocation()
  const routeState = location.state as { initialPrompt?: string } | null
  const initialPrompt = routeState?.initialPrompt

  const [state, setState] = useState<AppState>('idle')
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [orbitRangeDeg, setOrbitRangeDeg] = useState(40)
  const [explodeScalar, setExplodeScalar] = useState(1.5)
  const [cameraZoom, setCameraZoom] = useState(1.0)
  const [styleOptions, setStyleOptions] = useState<StyleOptions>(DEFAULT_STYLE)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [selectedVariant, setSelectedVariant] = useState<VariantName>('y')
  const [easingCurve, setEasingCurve] = useState<number[]>(DEFAULT_EASING)
  const [orbitMode, setOrbitMode] = useState<OrbitMode>('horizontal')
  const [orbitDirection, setOrbitDirection] = useState<OrbitDirection>(1)
  const [orbitEasingCurve, setOrbitEasingCurve] = useState<number[]>(DEFAULT_ORBIT_EASING)
  const [loopMode, setLoopMode] = useState<LoopMode>('loop-preview')
  const { enqueue: enqueueJob } = useJobQueue()
  const [renderedSettings, setRenderedSettings] = useState<{ explodeScalar: number; orbitRangeDeg: number; cameraZoom: number; orbitMode: OrbitMode; orbitDirection: OrbitDirection } | null>(null)
  const [restyleStack, setRestyleStack] = useState<RestyleEntry[]>([])
  const [cameraDirection, setCameraDirection] = useState<[number, number, number]>([0.3, 0.3, 1.0])
  const meshViewerRef = useRef<MeshViewerHandle | null>(null)
  const lastSubmittedDirection = useRef<[number, number, number]>([0.3, 0.3, 1.0])
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const restyleStackRef = useRef<RestyleEntry[]>(restyleStack)
  restyleStackRef.current = restyleStack

  useEffect(() => {
    if (initialPrompt) {
      setStyleOptions(s => ({ ...s, prompt: initialPrompt }))
    }
  }, [initialPrompt])

  const settingsChanged = renderedSettings !== null && (
    renderedSettings.explodeScalar !== explodeScalar ||
    renderedSettings.orbitRangeDeg !== orbitRangeDeg ||
    renderedSettings.cameraZoom !== cameraZoom ||
    renderedSettings.orbitMode !== orbitMode ||
    renderedSettings.orbitDirection !== orbitDirection
  )

  async function handleUpload(file: File) {
    setErrorMsg(null)
    setUploadedFile(file)
    try {
      setState('uploading')
      const result = await getPreviewImages(file)
      setPreview(result)
      const names = result.component_names ?? []
      if (names.length > 0) {
        setStyleOptions(prev => ({
          ...prev,
          rows: names.slice(0, 20).map(name => ({ part: name, material: '' })),
        }))
      }
      setState('orientation')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Preview failed')
      setState('error')
    }
  }

  async function handleGenerate(variantsToRender?: VariantName[]) {
    if (!preview) return
    setErrorMsg(null)
    // Read direction imperatively so snap animations in progress don't cause stale state.
    const dir = meshViewerRef.current?.getCameraDirection() ?? cameraDirection
    lastSubmittedDirection.current = dir
    try {
      setState('processing')
      const id = await createJob({
        previewId: preview.preview_id,
        explodeScalar,
        rows: styleOptions.rows,
        stylePrompt: styleOptions.prompt,
        cameraDirection: dir,
        rotationOffsetDeg: 0,
        orbitRangeDeg,
        cameraZoom,
        selectedVariant,
        easingCurve,
        orbitMode,
        orbitDirection,
        orbitEasingCurve,
        variantsToRender,
        loopMode,
      })
      setJobId(id)
      setJobStatus(null)
      enqueueJob(
        id,
        `${uploadedFile?.name?.replace(/\.[^/.]+$/, '') ?? 'Render'} · ${selectedVariant.toUpperCase()} axis`,
        { pinnedToCurrent: true },
      )
      setRenderedSettings({ explodeScalar, orbitRangeDeg, cameraZoom, orbitMode, orbitDirection })
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Job creation failed')
      setState('error')
    }
  }

  useEffect(() => {
    const shouldPoll = state === 'processing' || state === 'styling'
    if (!shouldPoll || !jobId) return

    pollRef.current = setInterval(async () => {
      try {
        const status = await getJobStatus(jobId)
        setJobStatus(status)
        if (status.status === 'awaiting_approval') {
          // Legacy dual-render flow still supported
          setState('awaiting_approval')
          clearInterval(pollRef.current!)
        } else if (status.current_phase >= 4 && status.status === 'running') {
          setState('styling')
        } else if (status.status === 'done') {
          setState('done')
          clearInterval(pollRef.current!)
        } else if (status.status === 'error') {
          setErrorMsg(status.error ?? 'Pipeline error')
          setState('error')
          clearInterval(pollRef.current!)
        }
      } catch {
        // keep polling on transient network errors
      }
    }, 2000)

    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [state, jobId])

  async function handleRestyle(opts: StyleOptions, variants: VariantName[]) {
    if (!jobId) return
    try {
      const newJobId = await restyleJob(jobId, {
        rows: opts.rows,
        stylePrompt: opts.prompt,
        selectedVariants: variants,
      })
      setRestyleStack(prev => [
        { jobId: newJobId, status: 'generating', variants, aiStyled: false },
        ...prev,
      ])
      enqueueJob(
        newJobId,
        `Restyle · ${variants.map(v => v.toUpperCase()).join('+')}`,
      )
    } catch {
      // silently fail — the skeleton will not appear
    }
  }

  const hasGeneratingRestyle = restyleStack.some(e => e.status === 'generating')
  useEffect(() => {
    if (!hasGeneratingRestyle) return
    const interval = setInterval(async () => {
      const generating = restyleStackRef.current.filter(e => e.status === 'generating')
      if (generating.length === 0) return
      const results = await Promise.allSettled(
        generating.map(e => getJobStatus(e.jobId).then(s => ({ jobId: e.jobId, s })))
      )
      setRestyleStack(prev =>
        prev.map(entry => {
          const found = results
            .filter((r): r is PromiseFulfilledResult<{ jobId: string; s: JobStatus }> => r.status === 'fulfilled')
            .find(r => r.value.jobId === entry.jobId)
          if (!found) return entry
          const { s } = found.value
          if (s.status === 'done') return { ...entry, status: 'done' as const, aiStyled: s.ai_styled }
          if (s.status === 'error') return { ...entry, status: 'error' as const }
          return entry
        })
      )
    }, 2000)
    return () => clearInterval(interval)
  }, [hasGeneratingRestyle])

  async function handleApprove(variants: VariantName[]) {
    if (!jobId) return
    try {
      await approvePhase4(jobId, variants, {
        rows: styleOptions.rows,
        stylePrompt: styleOptions.prompt,
      })
      setState('styling')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Approval failed')
      setState('error')
    }
  }

  function reset() {
    setState('idle')
    setJobId(null)
    setJobStatus(null)
    setPreview(null)
    setUploadedFile(null)
    setOrbitRangeDeg(40)
    setExplodeScalar(1.5)
    setCameraZoom(1.0)
    setStyleOptions(DEFAULT_STYLE)
    setSelectedVariant('y')
    setEasingCurve(DEFAULT_EASING)
    setOrbitMode('horizontal')
    setOrbitDirection(1)
    setOrbitEasingCurve(DEFAULT_ORBIT_EASING)
    setRenderedSettings(null)
    setErrorMsg(null)
    setRestyleStack([])
    setCameraDirection([0.3, 0.3, 1.0])
    lastSubmittedDirection.current = [0.3, 0.3, 1.0]
  }

  const showControls = state === 'orientation' || state === 'processing' || state === 'awaiting_approval' || state === 'styling' || state === 'done'
  const controlsDisabled = state !== 'orientation' && state !== 'awaiting_approval'

  const topbar = (
    <header className="app-topbar" role="banner">
      <span className="app-topbar-edge app-topbar-edge--l" aria-hidden />
      <span className="app-topbar-edge app-topbar-edge--r" aria-hidden />

      <div className="app-topbar-brand">
        <button
          type="button"
          className="wordmark wordmark--button"
          onClick={() => navigate(pathForTab('gallery'))}
          aria-label="Go to gallery"
        >
          <CubeLogo size={30} className="wordmark__cube" />
          <span className="wordmark__text">EXPLOD<em>I</em>FY</span>
        </button>
      </div>

      <div className="app-topbar-nav">
        <TopNav
          tab={tab}
          onChange={(next) => navigate(pathForTab(next))}
        />
      </div>

      <div className="app-topbar-meta">
        <CreditsBlocks
          remaining={30}
          total={30}
          onClick={() => navigate(pathForTab('profile'))}
        />
      </div>
    </header>
  )

  if (tab === 'gallery') {
    return (
      <div className="app-shell">
        {topbar}
        <Gallery />
      </div>
    )
  }

  if (tab === 'profile') {
    return (
      <div className="app-shell">
        {topbar}
        <div className="app-layout app-layout--single">
          <main className="right-panel right-panel--profile">
            <Profile />
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      {topbar}
      <div className="app-layout">

      {/* Left panel */}
      <aside className="left-panel">

        <div className="left-scroll">

          {(state === 'idle' || state === 'uploading') && (
            <section className="panel-section animate-fade-in">
              <div className="section-label">Input File</div>
              <UploadZone
                onUpload={handleUpload}
                loading={state === 'uploading'}
              />
            </section>
          )}

          {showControls && (
            <>
              <section className="panel-section animate-fade-in" style={{ paddingBottom: 14 }}>
                <button className="reupload-btn" onClick={reset}>
                  ↑&nbsp;&nbsp;Upload different file
                </button>
              </section>

              <section className="panel-section animate-fade-in">
                <div className="section-label">Style &amp; Parameters</div>
                <StylePanel
                  options={styleOptions}
                  onOptionsChange={setStyleOptions}
                  disabled={controlsDisabled}
                />
              </section>

              {state === 'orientation' && (
                <>
                  <section className="panel-section animate-fade-in">
                    <div className="section-label">Explosion Profile</div>
                    <EasingEditor
                      value={easingCurve}
                      onChange={setEasingCurve}
                      disabled={false}
                    />
                  </section>

                  <section className="panel-section animate-fade-in">
                    <div className="section-label">Camera Orbit Easing</div>
                    <EasingEditor
                      value={orbitEasingCurve}
                      onChange={setOrbitEasingCurve}
                      disabled={false}
                      presets={ORBIT_EASING_PRESETS}
                    />
                  </section>

                  <section className="panel-section animate-fade-in">
                    <div className="section-label">Loop Mode</div>
                    <LoopModeSelector
                      value={loopMode}
                      onChange={setLoopMode}
                      disabled={false}
                    />
                  </section>
                </>
              )}

              {state === 'processing' && (
                <section className="panel-section animate-fade-in">
                  <div className="processing-indicator">
                    <div className="processing-dot" />
                    Rendering unstyled video...
                  </div>
                </section>
              )}

              {state === 'awaiting_approval' && (
                <section className="panel-section animate-fade-in">
                  {settingsChanged ? (
                    <>
                      <div className="settings-changed-indicator">
                        Settings changed
                      </div>
                      <button className="generate-btn" onClick={() => handleGenerate()}>
                        Re-render
                        <span className="generate-arrow">→</span>
                      </button>
                    </>
                  ) : (
                    <div className="done-indicator">
                      <span>✓</span>
                      Render ready
                    </div>
                  )}
                </section>
              )}

              {state === 'styling' && (
                <section className="panel-section animate-fade-in">
                  <div className="processing-indicator">
                    <div className="processing-dot" />
                    Kling AI styling...
                  </div>
                </section>
              )}

              {state === 'done' && (
                <section className="panel-section animate-fade-in">
                  <div className="done-indicator">
                    <span>✓</span>
                    {jobStatus?.ai_styled ? 'Styled video ready' : 'Base render ready'}
                  </div>
                  <button className="reupload-btn" onClick={reset}>
                    ↺&nbsp;&nbsp;Start over with new file
                  </button>
                </section>
              )}
            </>
          )}

          {state === 'error' && (
            <section className="panel-section animate-fade-in">
              <div className="error-box">
                <span className="error-label">Error</span>
                <p className="error-msg">{errorMsg ?? 'Something went wrong'}</p>
                <button className="error-retry" onClick={reset}>Try again</button>
              </div>
            </section>
          )}

        </div>
      </aside>

      {/* Right panel */}
      <main className="right-panel">
        {state === 'idle' && <IdleOutput />}

        {state === 'uploading' && (
          <LoadingOutput phase="orientation" jobStatus={null} />
        )}

        {state === 'orientation' && preview && uploadedFile && (
          <MeshViewer
            ref={meshViewerRef}
            file={uploadedFile}
            previewId={preview.preview_id}
            previewImages={preview.images}
            explosionAxes={preview.explosion_axes ?? null}
            selectedAxis={selectedVariant}
            onAxisChange={setSelectedVariant}
            explodeScalar={explodeScalar}
            onExplodeChange={setExplodeScalar}
            orbitRangeDeg={orbitRangeDeg}
            onOrbitRangeChange={setOrbitRangeDeg}
            orbitMode={orbitMode}
            onOrbitModeChange={setOrbitMode}
            orbitDirection={orbitDirection}
            onOrbitDirectionChange={setOrbitDirection}
            cameraDirection={cameraDirection}
            onCameraDirectionChange={setCameraDirection}
            initialCameraDirection={lastSubmittedDirection.current}
            onGenerate={() => handleGenerate()}
          />
        )}

        {state === 'processing' && (
          <LoadingOutput phase="pipeline" jobStatus={jobStatus} />
        )}

        {state === 'awaiting_approval' && jobId && (
          <DualApprovalGate
            jobId={jobId}
            selectedVariant={selectedVariant}
            loopMode={loopMode}
            onApprove={handleApprove}
            onAdjust={() => setState('orientation')}
            onSkip={reset}
          />
        )}

        {state === 'styling' && (
          <LoadingOutput phase="styling" jobStatus={jobStatus} />
        )}

        {state === 'done' && jobId && (
          <VideoOutput
            jobId={jobId}
            aiStyled={jobStatus?.ai_styled ?? false}
            selectedVariants={[selectedVariant]}
            styleOptions={styleOptions}
            restyleStack={restyleStack}
            onRestyle={handleRestyle}
            loopMode={loopMode}
          />
        )}

        {state === 'error' && (
          <div className="output-error-panel animate-fade-in">
            No output -- see error on left
          </div>
        )}
      </main>
      </div>
    </div>
  )
}


/* Legacy dual-variant approval gate — only shown when backend uses old flow */
function DualApprovalGate({
  jobId,
  selectedVariant,
  loopMode,
  onApprove,
  onAdjust,
  onSkip,
}: {
  jobId: string
  selectedVariant: VariantName
  loopMode: LoopMode
  onApprove: (variants: VariantName[]) => void
  onAdjust: () => void
  onSkip: () => void
}) {
  const isLoop = loopMode === 'loop-preview'
  const videoUrl = isLoop
    ? `/jobs/${jobId}/loop_video/${selectedVariant}`
    : `/jobs/${jobId}/base_video/${selectedVariant}`
  const downloadName = `explodify_${selectedVariant}_${isLoop ? 'loop' : 'base'}_${jobId}.mp4`
  const durationLabel = isLoop ? '6S SEAMLESS LOOP' : '3S @ 24FPS'
  const frameLabel = isLoop ? '144 FRAMES' : '72 FRAMES'

  return (
    <div className="review-gate animate-fade-in">
      <div className="review-header">
        <div className="review-header-left">
          <span className="review-tag">REVIEW</span>
          <span className="review-phase">EXPLOSION RENDER</span>
        </div>
        <div className="review-header-right">
          <span className="review-meta-item">{frameLabel}</span>
          <span className="review-meta-sep">·</span>
          <span className="review-meta-item">{durationLabel}</span>
          <span className="review-meta-sep">·</span>
          <span className="review-meta-item review-meta-unstyled">UNSTYLED RENDER</span>
        </div>
      </div>

      <div className="review-single-video">
        <div className="review-video-stage-wrap">
          <CustomVideoPlayer
            src={videoUrl}
            downloadName={downloadName}
            canDownload={false}
            autoPlay
            loop
          />
        </div>
      </div>

      <div className="review-actions">
        <div className="review-actions-left">
          <button
            className="review-proceed-btn"
            onClick={() => onApprove([selectedVariant])}
          >
            <span className="review-proceed-label">Style This Video</span>
            <span className="review-proceed-arrow">→</span>
          </button>
          <SaveToGalleryButton
            jobId={jobId}
            variant={selectedVariant}
            kind="base"
            title={`Unstyled · ${selectedVariant.toUpperCase()} axis`}
          />
          <button className="review-redo-btn review-adjust-btn" onClick={onAdjust}>
            ← Adjust Explosion
          </button>
          <button className="review-redo-btn" onClick={onSkip}>
            ↺ Start Over
          </button>
        </div>
      </div>
    </div>
  )
}
