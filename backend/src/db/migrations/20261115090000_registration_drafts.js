import { getPool } from '../database.js';

export async function up() {
  const pool = getPool();
  await pool.query('BEGIN');
  try {
    await pool.query(`
      CREATE TABLE registration_drafts (
        token_hash CHAR(64) PRIMARY KEY,
        answers JSONB NOT NULL,
        step_id VARCHAR(80) NOT NULL,
        phone VARCHAR(25),
        sms_consent BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        sms_sent_at TIMESTAMPTZ
      );
    `);
    await pool.query(`
      CREATE INDEX idx_registration_drafts_expiry ON registration_drafts (expires_at);
    `);
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

export async function down() {
  const pool = getPool();
  await pool.query('DROP TABLE IF EXISTS registration_drafts;');
}
