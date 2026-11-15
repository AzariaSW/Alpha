import { getPool } from '../database.js';
import { decryptJson, decryptText, encryptJson, encryptText } from '../../utils/dataEncryption.js';

export async function up() {
  const pool = getPool();
  await pool.query('ALTER TABLE registration_drafts ALTER COLUMN phone TYPE TEXT;');
  const { rows } = await pool.query('SELECT token_hash, answers, phone FROM registration_drafts');
  for (const row of rows) {
    const answers = row.answers?.__encrypted === 1 ? row.answers : encryptJson(row.answers);
    const phone = row.phone?.startsWith('enc:v1:') ? row.phone : row.phone ? encryptText(row.phone) : null;
    await pool.query(
      'UPDATE registration_drafts SET answers = $2::jsonb, phone = $3 WHERE token_hash = $1',
      [row.token_hash, JSON.stringify(answers), phone],
    );
  }
}

export async function down() {
  const pool = getPool();
  const { rows } = await pool.query('SELECT token_hash, answers, phone FROM registration_drafts');
  for (const row of rows) {
    await pool.query(
      'UPDATE registration_drafts SET answers = $2::jsonb, phone = $3 WHERE token_hash = $1',
      [row.token_hash, JSON.stringify(decryptJson(row.answers)), decryptText(row.phone)],
    );
  }
  await pool.query('ALTER TABLE registration_drafts ALTER COLUMN phone TYPE VARCHAR(25);');
}
