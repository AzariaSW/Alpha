
export async function up(pgm) {
  pgm.sql(`
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

    CREATE INDEX idx_registration_drafts_expiry
      ON registration_drafts (expires_at);
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DROP TABLE IF EXISTS registration_drafts;
  `);
}
