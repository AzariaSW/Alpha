import { query } from '../database.js';

export async function saveRegistrationDraft({ tokenHash, answers, stepId, expiresAt }) {
  const result = await query(`
    INSERT INTO registration_drafts
      (token_hash, answers, step_id, phone, sms_consent, expires_at)
    VALUES ($1, $2::jsonb, $3, $4, $5, $6)
    ON CONFLICT (token_hash) DO UPDATE SET
      answers = EXCLUDED.answers,
      step_id = EXCLUDED.step_id,
      phone = EXCLUDED.phone,
      sms_consent = EXCLUDED.sms_consent,
      updated_at = NOW(),
      expires_at = EXCLUDED.expires_at
    RETURNING token_hash
  `, [
    tokenHash,
    JSON.stringify(answers),
    stepId,
    answers.phone || null,
    Boolean(answers.contactMethods?.includes('sms')),
    expiresAt,
  ]);
  return result.rows[0] || null;
}

export async function findRegistrationDraft(tokenHash) {
  const result = await query(`
    SELECT answers, step_id, expires_at
    FROM registration_drafts
    WHERE token_hash = $1 AND expires_at > NOW()
  `, [tokenHash]);
  return result.rows[0] || null;
}

export async function claimRegistrationReminder(tokenHash) {
  const result = await query(`
    UPDATE registration_drafts
    SET sms_sent_at = NOW()
    WHERE token_hash = $1 AND sms_sent_at IS NULL AND expires_at > NOW()
    RETURNING phone
  `, [tokenHash]);
  return result.rows[0] || null;
}

export async function deleteRegistrationDraft(tokenHash) {
  await query('DELETE FROM registration_drafts WHERE token_hash = $1', [tokenHash]);
}

export async function deleteExpiredRegistrationDrafts() {
  await query('DELETE FROM registration_drafts WHERE expires_at <= NOW()');
}
