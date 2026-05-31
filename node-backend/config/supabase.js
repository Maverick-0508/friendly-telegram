import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || null;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || null;

let supabase = null;

if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
} else {
  console.warn('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not provided; Supabase client will not be initialized.');
}

export { supabase };
