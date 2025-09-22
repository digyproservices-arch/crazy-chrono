import { createClient } from '@supabase/supabase-js';

// Expect these env vars to be defined in .env.local or .env.production
// REACT_APP_SUPABASE_URL
// REACT_APP_SUPABASE_ANON_KEY
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

let supabase = null;
try {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.warn('[supabase] init failed:', e);
}

export default supabase;
