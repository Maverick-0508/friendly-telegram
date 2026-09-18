import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || null;

let supabase = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
} else {
  console.warn('SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY not provided; Supabase client is not initialized.');
}

export async function checkSupabaseReachability() {
  if (!supabase) {
    return {
      configured: Boolean(supabaseUrl && supabaseKey),
      connected: false,
      type: 'Supabase',
      url: supabaseUrl || null,
      note: 'Supabase URL and key must be configured via environment variables.',
    };
  }

  try {
    await supabase.from('leads').select('id').limit(1);
    return {
      configured: true,
      connected: true,
      type: 'Supabase',
      url: supabaseUrl,
    };
  } catch (err) {
    return {
      configured: true,
      connected: false,
      type: 'Supabase',
      url: supabaseUrl,
      error: err.message,
    };
  }
}

export { supabase };

export function getSupabaseStatus() {
  if (supabase) {
    return {
      configured: true,
      connected: true,
      type: 'Supabase',
      url: supabaseUrl,
    };
  }
  return {
    configured: Boolean(supabaseUrl && supabaseKey),
    connected: false,
    type: 'Supabase',
    url: supabaseUrl || null,
    note: supabaseKey
      ? 'Attempted connection with provided key'
      : 'Supabase URL and key must be configured via environment variables.',
  };
}