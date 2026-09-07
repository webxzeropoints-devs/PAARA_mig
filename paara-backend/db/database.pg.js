require('dotenv').config();
const { Pool } = require('pg');

const connectionString = String(process.env.DATABASE_URL || '').trim();

if (!connectionString) {
  throw new Error('[DB] DATABASE_URL is not set');
}

const databaseUrl = new URL(connectionString);
databaseUrl.searchParams.delete('sslmode');

const pool = new Pool({
  connectionString: databaseUrl.toString(),
  ssl: { rejectUnauthorized: false },
  max: 10,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected PostgreSQL pool error:', err);
});

async function query(text, params = []) {
  return pool.query(text, params);
}

async function close() {
  await pool.end();
}

module.exports = {
  pool,
  query,
  close,
  isServerless: false,
  persist: async () => true,
  persistAfterWrite: async () => true,
  acquireWriteLock: async () => () => {},
  markWrite: () => {},
  getSyncStatus: () => ({
    database: 'postgresql',
  }),
};
