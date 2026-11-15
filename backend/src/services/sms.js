import { logger } from '../config/logger.js';

const demoOutbox = [];

function maskPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  return digits.length < 4 ? '***' : `***${digits.slice(-4)}`;
}

export async function queueRegistrationReminder({ to, url }) {
  const body = `Continue your registration: ${url}`;
  demoOutbox.push({ to, body, queuedAt: new Date().toISOString() });
  logger.info({ to: maskPhone(to) }, 'Registration reminder added to the demo SMS outbox; no SMS provider is configured');
  return { delivered: false, demo: true };
}

export function getDemoSmsOutbox() {
  return demoOutbox.map((message) => ({ ...message }));
}
