// TODO: Terminal B will ship real impl
export default function LandingPage() {
  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#e8e8e8', padding: 48 }}>
      <h1 style={{ fontSize: 32, letterSpacing: '-0.02em' }}>Explodify</h1>
      <p style={{ opacity: 0.6, marginTop: 16 }}>Landing page stub — replaced by Terminal B.</p>
      <a
        href="/login"
        style={{
          display: 'inline-block',
          marginTop: 24,
          padding: '10px 20px',
          background: '#d4a843',
          color: '#080808',
          textDecoration: 'none',
          fontWeight: 600,
          borderRadius: 4,
        }}
      >
        Sign in
      </a>
    </div>
  )
}
