import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || null;

let pool = null;
let usePg = Boolean(DATABASE_URL);

if (usePg) {
  try {
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });

    pool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client', err);
    });
  } catch (err) {
    console.warn('DB connection failed — using mock fallback', err);
    usePg = false;
    pool = {
      query: async () => ({ rows: [] }),
      connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
    };
  }
}

export { pool, usePg };

