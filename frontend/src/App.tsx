// frontend/src/App.tsx
import { useState, useEffect, useMemo, useRef } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { UploadZone } from './components/UploadZone'
import { StylePanel } from './components/StylePanel'
import { BackdropPicker } from './components/BackdropPicker'
import { EasingEditor, ORBIT_EASING_PRESETS, CINEMATIC_EXPLOSION_SAMPLES, CINEMATIC_ORBIT_SAMPLES } from './components/EasingEditor'
import type { OrbitMode, OrbitDirection } from './components/orientation/createViewer'
import { MeshViewer } from './components/MeshViewer'
import type { MeshViewerHandle } from './components/MeshViewer'
import { LoadingOutput } from './components/LoadingOutput'
import { VideoOutput } from './components/VideoOutput'
import { CustomVideoPlayer } from './components/CustomVideoPlayer'
import { SaveToGalleryButton } from './components/SaveToGalleryButton'
import { TopNav } from './components/TopNav'
import type { NavTab } from './components/TopNav'
import CreditsBlocks from './components/shell/CreditsBlocks'
import CubeLogo from './components/shell/CubeLogo'
import { Gallery } from './components/Gallery'
import { Profile } from './components/Profile'
import { JobQueueProvider, useJobQueue } from './contexts/JobQueueContext'
import { JobQueueIndicator } from './components/JobQueueIndicator'
import { getPreviewImages, createJob, getJobStatus, approvePhase4, restyleJob, galleryVideoUrl, styleGalleryItem, getCredits, CREDITS_PER_RENDER, GalleryFullError } from './api/client'
import type { JobStatus, PreviewResult, VariantName } from './api/client'
import { ConfirmCreditsModal, shouldSkipConfirm, setSkipConfirm } from './components/ConfirmCreditsModal'
import { ProceedToStyleButton } from './components/ProceedToStyleButton'
import { PricingModal } from './components/shell/PricingModal'
import { ReplaceGalleryModal } from './components/ReplaceGalleryModal'
import RequireAuth from './routes/RequireAuth'
import RootRedirect from './routes/RootRedirect'
import { useActiveTab, pathForTab } from './routes/useActiveTab'
import LoginPage from './pages/LoginPage'
import AuthCallback from './pages/AuthCallback'
import LandingPage from './pages/LandingPage'
import { loadStudio, saveStudio, clearStudio, isPersistableState } from './lib/studioStorage'
import { useSession } from './lib/useSession'

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
  // RequireAuth gates this component on a resolved, non-null session, so
  // `session.user.id` is available synchronously on first render.
  const { session } = useSession()
  const userId = session?.user.id ?? null
  const routeState = location.state as {
    initialPrompt?: string
    styleFromGallery?: { galleryId: string; variant: VariantName; title: string }
  } | null
  const initialPrompt = routeState?.initialPrompt
  const styleFromGallery = routeState?.styleFromGallery

  // Rehydrate once on mount. Stored snapshot only ever resurrects settled
  // states; transient ones (uploading/error) never wrote in the first place.
  // Keyed by userId so snapshots never cross identities.
  const snapshot = useMemo(() => loadStudio(userId), [userId])

  const [state, setState] = useState<AppState>(snapshot?.state ?? 'idle')
  const [jobId, setJobId] = useState<string | null>(snapshot?.jobId ?? null)
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(snapshot?.preview ?? null)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(snapshot?.uploadedFileName ?? null)
  const [orbitRangeDeg, setOrbitRangeDeg] = useState(snapshot?.orbitRangeDeg ?? 40)
  const [explodeScalar, setExplodeScalar] = useState(snapshot?.explodeScalar ?? 1.5)
  const [cameraZoom, setCameraZoom] = useState(snapshot?.cameraZoom ?? 1.0)
  const [styleOptions, setStyleOptions] = useState<StyleOptions>(snapshot?.styleOptions ?? DEFAULT_STYLE)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [selectedVariant, setSelectedVariant] = useState<VariantName>(snapshot?.selectedVariant ?? 'y')
  const [easingCurve, setEasingCurve] = useState<number[]>(snapshot?.easingCurve ?? DEFAULT_EASING)
  const [orbitMode, setOrbitMode] = useState<OrbitMode>(snapshot?.orbitMode ?? 'horizontal')
  const [orbitDirection, setOrbitDirection] = useState<OrbitDirection>(snapshot?.orbitDirection ?? 1)
  const [orbitEasingCurve, setOrbitEasingCurve] = useState<number[]>(snapshot?.orbitEasingCurve ?? DEFAULT_ORBIT_EASING)
  const [backdropColor, setBackdropColor] = useState<string>(snapshot?.backdropColor ?? '#000000')
  const [pendingApprove, setPendingApprove] = useState<null | { variants: VariantName[] }>(null)
  const [replaceModal, setReplaceModal] = useState<null | {
    variants: VariantName[]
    savedCount: number
    cap: number
  }>(null)
  const [fromGalleryContext, setFromGalleryContext] = useState<null | {
    galleryId: string
    variant: VariantName
  }>(snapshot?.fromGalleryContext ?? null)
  // DB-backed balance. `creditsTotal` is only used for the HUD progress bar —
  // we default to CREDITS_PER_RENDER so a brand-new account shows "full". The
  // ring clamps to 100 so that top-up purchases that push balance past the
  // nominal total never overflow the bar visually.
  const [creditsBalance, setCreditsBalance] = useState<number | null>(null)
  const creditsRemaining = creditsBalance ?? CREDITS_PER_RENDER
  const creditsTotal = Math.max(CREDITS_PER_RENDER, creditsRemaining)
  const refreshCredits = async () => {
    try {
      const next = await getCredits()
      setCreditsBalance(next.balance)
    } catch {
      // Non-fatal — the HUD falls back to its last known balance, and the
      // server is always the arbiter before a render goes through.
    }
  }
  useEffect(() => {
    void refreshCredits()
  }, [])
  const { enqueue: enqueueJob } = useJobQueue()
  const [renderedSettings, setRenderedSettings] = useState<{ explodeScalar: number; orbitRangeDeg: number; cameraZoom: number; orbitMode: OrbitMode; orbitDirection: OrbitDirection } | null>(snapshot?.renderedSettings ?? null)
  const [restyleStack, setRestyleStack] = useState<RestyleEntry[]>(snapshot?.restyleStack ?? [])
  const [cameraDirection, setCameraDirection] = useState<[number, number, number]>(snapshot?.cameraDirection ?? [0.3, 0.3, 1.0])
  const meshViewerRef = useRef<MeshViewerHandle | null>(null)
  const lastSubmittedDirection = useRef<[number, number, number]>(snapshot?.cameraDirection ?? [0.3, 0.3, 1.0])
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const restyleStackRef = useRef<RestyleEntry[]>(restyleStack)
  restyleStackRef.current = restyleStack
  // Snapshot of the last actionable state captured before each risky call.
  // Drives "Try again" after an error — lands the user on the step they were on,
  // not a wiped-clean idle.
  const preErrorSnapshotRef = useRef<{ state: AppState; jobId: string | null } | null>(null)

  useEffect(() => {
    if (initialPrompt) {
      setStyleOptions(s => ({ ...s, prompt: initialPrompt }))
    }
  }, [initialPrompt])

  useEffect(() => {
    if (!styleFromGallery) return
    if (state !== 'idle') return
    setJobId(`gallery-${styleFromGallery.galleryId}`)
    setSelectedVariant(styleFromGallery.variant)
    setFromGalleryContext({
      galleryId: styleFromGallery.galleryId,
      variant: styleFromGallery.variant,
    })
    setState('awaiting_approval')
    navigate(location.pathname, { replace: true, state: null })
  }, [styleFromGallery, state, navigate, location.pathname])

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
    setUploadedFileName(file.name)
    preErrorSnapshotRef.current = { state: 'idle', jobId: null }
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
    preErrorSnapshotRef.current = { state: 'orientation', jobId: null }
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
        backdropColor,
      })
      setJobId(id)
      setJobStatus(null)
      const baseName = (uploadedFile?.name ?? uploadedFileName ?? 'Render').replace(/\.[^/.]+$/, '')
      enqueueJob(
        id,
        `${baseName} · ${selectedVariant.toUpperCase()} axis`,
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
          void refreshCredits()
        } else if (status.status === 'error') {
          setErrorMsg(status.error ?? 'Pipeline error')
          setState('error')
          clearInterval(pollRef.current!)
          void refreshCredits()
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
      void refreshCredits()
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

  async function handleApprove(variants: VariantName[], replaceId?: string) {
    if (!jobId) return
    preErrorSnapshotRef.current = { state: 'awaiting_approval', jobId }
    try {
      if (fromGalleryContext) {
        const { jobId: newJobId } = await styleGalleryItem(fromGalleryContext.galleryId, {
          rows: styleOptions.rows,
          stylePrompt: styleOptions.prompt,
          replaceId,
        })
        setJobId(newJobId)
        setJobStatus(null)
        setFromGalleryContext(null)
        enqueueJob(
          newJobId,
          `Gallery restyle · ${variants.map(v => v.toUpperCase()).join('/')}`,
          { pinnedToCurrent: true },
        )
        setState('styling')
      } else {
        await approvePhase4(jobId, variants, {
          rows: styleOptions.rows,
          stylePrompt: styleOptions.prompt,
          replaceId,
        })
        setState('styling')
      }
      void refreshCredits()
    } catch (err) {
      if (err instanceof GalleryFullError) {
        setReplaceModal({ variants, savedCount: err.savedCount, cap: err.cap })
        return
      }
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
    setUploadedFileName(null)
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
    setFromGalleryContext(null)
    lastSubmittedDirection.current = [0.3, 0.3, 1.0]
    preErrorSnapshotRef.current = null
    clearStudio(userId)
  }

  // Try-again: restore the last actionable step the user was on. Falls back to
  // idle only when no snapshot was captured (e.g., an error outside our flows).
  function handleTryAgain() {
    const snap = preErrorSnapshotRef.current
    setErrorMsg(null)
    if (!snap) {
      setState('idle')
      setJobId(null)
      return
    }
    setState(snap.state)
    setJobId(snap.jobId)
  }

  // Debounced writer: any change in a persisted field queues a 200ms save.
  // Writes skip transient states (uploading, error) via isPersistableState.
  useEffect(() => {
    if (!isPersistableState(state)) return
    const t = window.setTimeout(() => {
      saveStudio(userId, {
        state,
        jobId,
        preview,
        uploadedFileName: uploadedFile?.name ?? uploadedFileName,
        orbitRangeDeg,
        explodeScalar,
        cameraZoom,
        styleOptions,
        selectedVariant,
        easingCurve,
        orbitMode,
        orbitDirection,
        orbitEasingCurve,
        backdropColor,
        cameraDirection,
        renderedSettings,
        restyleStack,
        fromGalleryContext,
      })
    }, 200)
    return () => window.clearTimeout(t)
  }, [
    userId,
    state, jobId, preview, uploadedFile, uploadedFileName,
    orbitRangeDeg, explodeScalar, cameraZoom, styleOptions,
    selectedVariant, easingCurve, orbitMode, orbitDirection,
    orbitEasingCurve, backdropColor, cameraDirection,
    renderedSettings, restyleStack, fromGalleryContext,
  ])

  const showControls = state === 'orientation' || state === 'processing' || state === 'awaiting_approval' || state === 'styling' || state === 'done'
  const controlsDisabled = state !== 'orientation' && state !== 'awaiting_approval'
  const styleDisabled = state !== 'orientation' && state !== 'processing' && state !== 'awaiting_approval'

  const topbar = (
    <header className="app-topbar" role="banner">
      <span className="app-topbar-edge app-topbar-edge--l" aria-hidden />
      <span className="app-topbar-edge app-topbar-edge--r" aria-hidden />

      <div className="app-topbar-brand">
        <button
          type="button"
          className="wordmark wordmark--button"
          onClick={() => navigate('/landing')}
          aria-label="Go to landing page"
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
          remaining={creditsRemaining}
          total={creditsTotal}
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

  // Pre-orientation states are full-width — the CAD drag-drop and the
  // subsequent "Reading geometry" screen both get the whole viewport so the
  // user isn't staring at a sidebar of inert controls before there's anything
  // to control. The left panel unlocks from 'orientation' onwards.
  const isIntroState = state === 'idle' || state === 'uploading'

  if (isIntroState) {
    return (
      <div className="app-shell">
        {topbar}
        <div className="app-layout app-layout--single">
          <main className="right-panel right-panel--intro">
            {state === 'idle' && (
              <div className="studio-intro animate-fade-in">
                <UploadZone onUpload={handleUpload} loading={false} />
              </div>
            )}
            {state === 'uploading' && (
              <div className="studio-intro studio-intro--loading animate-fade-in">
                <LoadingOutput phase="orientation" jobStatus={null} />
              </div>
            )}
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
                  disabled={styleDisabled}
                />
              </section>

              {state === 'orientation' && (
                <>
                  <section className="panel-section animate-fade-in">
                    <div className="section-label">Backdrop</div>
                    <BackdropPicker
                      value={backdropColor}
                      onChange={setBackdropColor}
                      disabled={false}
                    />
                  </section>

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
                <>
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
                </>
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
                <div className="error-actions">
                  <button className="error-retry" onClick={handleTryAgain}>Try again</button>
                  <button className="error-restart" onClick={reset}>Restart</button>
                </div>
              </div>
            </section>
          )}

        </div>
      </aside>

      {/* Right panel */}
      <main className="right-panel">
        {state === 'orientation' && preview && (
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
            creditsRemaining={creditsRemaining}
            videoSrc={fromGalleryContext ? galleryVideoUrl(fromGalleryContext.galleryId) : undefined}
            hideAdjust={!!fromGalleryContext}
            onApprove={(variants) => {
              if (shouldSkipConfirm()) {
                handleApprove(variants)
              } else {
                setPendingApprove({ variants })
              }
            }}
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
          />
        )}

        {state === 'error' && (
          <div className="output-error-panel animate-fade-in">
            No output -- see error on left
          </div>
        )}
      </main>
      </div>
      <ConfirmCreditsModal
        open={pendingApprove !== null}
        creditsRemaining={creditsRemaining}
        onCancel={() => setPendingApprove(null)}
        onConfirm={(dontAskAgain) => {
          const pending = pendingApprove
          setPendingApprove(null)
          if (dontAskAgain) setSkipConfirm(true)
          if (pending) handleApprove(pending.variants)
        }}
      />
      <ReplaceGalleryModal
        open={replaceModal !== null}
        savedCount={replaceModal?.savedCount ?? 0}
        cap={replaceModal?.cap ?? 0}
        onCancel={() => setReplaceModal(null)}
        onConfirm={(victimId) => {
          const pending = replaceModal
          setReplaceModal(null)
          if (pending) handleApprove(pending.variants, victimId)
        }}
      />
    </div>
  )
}


/* Legacy dual-variant approval gate — only shown when backend uses old flow */
function DualApprovalGate({
  jobId,
  selectedVariant,
  creditsRemaining,
  videoSrc,
  hideAdjust,
  onApprove,
  onAdjust,
  onSkip,
}: {
  jobId: string
  selectedVariant: VariantName
  creditsRemaining: number
  videoSrc?: string
  hideAdjust?: boolean
  onApprove: (variants: VariantName[]) => void
  onAdjust: () => void
  onSkip: () => void
}) {
  const videoUrl = videoSrc ?? `/jobs/${jobId}/base_video/${selectedVariant}`
  const downloadName = `explodify_${selectedVariant}_base_${jobId}.mp4`
  const durationLabel = '3S @ 24FPS'
  const frameLabel = '72 FRAMES'
  const [pricingOpen, setPricingOpen] = useState(false)

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
            onUpgradeClick={() => setPricingOpen(true)}
          />
        </div>
      </div>

      <div className="review-actions">
        <div className="review-actions-left">
          <ProceedToStyleButton
            creditsRemaining={creditsRemaining}
            onProceed={() => onApprove([selectedVariant])}
          />
          <SaveToGalleryButton
            jobId={jobId}
            variant={selectedVariant}
            kind="base"
            title={`Unstyled · ${selectedVariant.toUpperCase()} axis`}
          />
          {!hideAdjust && (
            <button className="review-redo-btn review-adjust-btn" onClick={onAdjust}>
              ← Adjust Explosion
            </button>
          )}
          <button className="review-redo-btn" onClick={onSkip}>
            ↺ Start Over
          </button>
        </div>
      </div>
      <PricingModal open={pricingOpen} onClose={() => setPricingOpen(false)} />
    </div>
  )
}
