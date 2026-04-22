import { createClient } from '@supabase/supabase-js'

// Fail-fast env validation. No placeholder fallbacks — silently shipping broken
// auth to production is far worse than refusing to boot locally. Copy
// .env.example to .env.local and fill in real values.
const SUPABASE_PLACEHOLDER_URL = 'https://placeholder.supabase.co'
const SUPABASE_PLACEHOLDER_ANON_KEY = 'placeholder-anon-key'

function requireEnv(name: string, value: string | undefined, placeholder: string): string {
  if (!value || value === placeholder) {
    throw new Error(
      `${name} is required — check your .env.local`,
    )
  }
  return value
}

const supabaseUrl = requireEnv(
  'VITE_SUPABASE_URL',
  import.meta.env.VITE_SUPABASE_URL,
  SUPABASE_PLACEHOLDER_URL,
)
const supabaseAnonKey = requireEnv(
  'VITE_SUPABASE_ANON_KEY',
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  SUPABASE_PLACEHOLDER_ANON_KEY,
)

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  },
)
