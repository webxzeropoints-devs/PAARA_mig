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

async function ensurePaaraStoryTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS paara_story (
      id INTEGER NOT NULL DEFAULT 1,
      title TEXT NOT NULL DEFAULT 'A dream shaped by fashion. A brand built with purpose.',
      description TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'),
      updated_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'),
      CONSTRAINT paara_story_pkey PRIMARY KEY (id)
    );

    INSERT INTO paara_story (id, title, description)
    VALUES (
      1,
      'A dream shaped by fashion. A brand built with purpose.',
      'Paara Jewellery was founded by Dharshini, born from her lifelong love for fashion, styling, and the beauty found in intricate details.'
    )
    ON CONFLICT (id) DO NOTHING;
  `);
}

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
