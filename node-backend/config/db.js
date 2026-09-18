import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || null;
const isProduction = process.env.NODE_ENV === 'production';

let pool = null;
let usePg = Boolean(DATABASE_URL);

if (usePg) {
  try {
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: isProduction ? { rejectUnauthorized: false } : false,
    });

    pool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client', err);
    });
  } catch (err) {
    console.error('[db] Failed to initialize PostgreSQL pool.', err);
    usePg = false;
    pool = null;
  }
}

export async function checkPostgresReachability() {
  if (!usePg || !pool) {
    return {
      configured: false,
      connected: false,
      type: 'PostgreSQL',
      note: DATABASE_URL ? 'PostgreSQL configured but connection could not be established' : 'DATABASE_URL is not configured',
    };
  }

  try {
    await pool.query('SELECT 1');
    return {
      configured: true,
      connected: true,
      type: 'PostgreSQL',
    };
  } catch (err) {
    return {
      configured: true,
      connected: false,
      type: 'PostgreSQL',
      error: err.message,
    };
  }
}

export { pool, usePg };

export function getDatabaseStatus() {
  if (usePg && pool) {
    return {
      configured: true,
      connected: true,
      type: 'PostgreSQL',
      connection_string: DATABASE_URL ? 'postgresql://***' : null,
    };
  }
  return {
    configured: usePg,
    connected: false,
    type: 'PostgreSQL',
    note: DATABASE_URL
      ? 'PostgreSQL connection failed on startup; no fallback store is used'
      : 'DATABASE_URL environment variable is not defined',
  };
}