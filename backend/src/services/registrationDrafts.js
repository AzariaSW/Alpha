import { createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';
import { isUsingMockDb } from '../db/database.js';
import {
  claimRegistrationReminder,
  deleteExpiredRegistrationDrafts,
  deleteRegistrationDraft,
  findRegistrationDraft,
  saveRegistrationDraft as saveFallbackDraft,
} from '../db/repositories/registrationDrafts.js';
import { logger } from '../config/logger.js';
import { queueRegistrationReminder } from './sms.js';
import { redis } from './redis.js';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const REDIS_TTL_SECONDS = 24 * 60 * 60;
const FALLBACK_RETENTION_MS = 50 * 365.25 * 24 * 60 * 60 * 1000;
const DRAFT_INDEX = 'registration:drafts:idle';
const monitorEveryMs = 30_000;

let monitor;
let lastPurgeAt = 0;

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function draftKey(tokenHash) {
  return `registration:draft:${tokenHash}`;
}

function newToken() {
  return randomBytes(32).toString('hex');
}

function appBaseUrl(requestBaseUrl) {
  if (env.NODE_ENV === 'production' && !env.PUBLIC_APP_URL) {
    throw new Error('PUBLIC_APP_URL is required in production for registration resume links');
  }
  return env.PUBLIC_APP_URL || requestBaseUrl || 'http://localhost:3000';
}

function resumeUrl(token, baseUrl) {
  const url = new URL('/', baseUrl);
  url.searchParams.set('resume', token);
  return url.toString();
}

function requirePersistentPostgres() {
  if (env.NODE_ENV === 'production' && isUsingMockDb()) {
    throw new Error('PostgreSQL is required for the registration draft fallback');
  }
}

export async function saveProgress({ token: existingToken, answers, stepId, baseUrl }) {
  const token = existingToken || newToken();
  const tokenHash = hashToken(token);
  const key = draftKey(tokenHash);
  const cached = await redis.get(key);
  const wasArchived = cached ? JSON.parse(cached).wasArchived === true : false;
  const updatedAt = Date.now();
  const draft = {
    token,
    answers,
    stepId,
    updatedAt,
    baseUrl: appBaseUrl(baseUrl),
    wasArchived,
  };
  await redis.set(key, JSON.stringify(draft), { EX: REDIS_TTL_SECONDS });
  await redis.zAdd(DRAFT_INDEX, { score: updatedAt + IDLE_TIMEOUT_MS, value: tokenHash });
  if (wasArchived) {
    requirePersistentPostgres();
    await deleteRegistrationDraft(tokenHash);
    requirePersistentPostgres();
  }
  return { token, updatedAt };
}

export async function loadProgress(token, requestBaseUrl) {
  const tokenHash = hashToken(token);
  const key = draftKey(tokenHash);
  const cached = await redis.get(key);
  const updatedAt = Date.now();
  let draft;
  if (cached) {
    draft = JSON.parse(cached);
  } else {
    const saved = await findRegistrationDraft(tokenHash);
    requirePersistentPostgres();
    if (!saved) return null;
    draft = {
      token,
      answers: saved.answers,
      stepId: saved.step_id,
      updatedAt,
      baseUrl: appBaseUrl(requestBaseUrl),
      wasArchived: true,
    };
  }
  draft.updatedAt = updatedAt;
  if (requestBaseUrl) draft.baseUrl = appBaseUrl(requestBaseUrl);
  await redis.set(key, JSON.stringify(draft), { EX: REDIS_TTL_SECONDS });
  await redis.zAdd(DRAFT_INDEX, { score: updatedAt + IDLE_TIMEOUT_MS, value: tokenHash });
  return { formId: 'signup', answers: draft.answers, stepId: draft.stepId };
}

export async function sendResumeLink(token, requestBaseUrl) {
  const draft = await loadProgress(token, requestBaseUrl);
  if (!draft) return { status: 'not_found' };
  const { phone, contactMethods } = draft.answers;
  if (!phone || !contactMethods?.includes('sms')) return { status: 'sms_not_allowed' };
  const sms = await queueRegistrationReminder({
    to: phone,
    url: resumeUrl(token, appBaseUrl(requestBaseUrl)),
  });
  return { status: 'queued', delivered: sms.delivered };
}

export async function discardProgress(token) {
  const tokenHash = hashToken(token);
  await redis.del(draftKey(tokenHash));
  await redis.zRem(DRAFT_INDEX, tokenHash);
  await deleteRegistrationDraft(tokenHash);
  requirePersistentPostgres();
}

export async function processDueDrafts(now = Date.now()) {
  const tokenHashes = await redis.zRangeByScore(DRAFT_INDEX, 0, now);
  for (const tokenHash of tokenHashes) {
    const key = draftKey(tokenHash);
    const cached = await redis.get(key);
    if (!cached) {
      await redis.zRem(DRAFT_INDEX, tokenHash);
      continue;
    }

    const draft = JSON.parse(cached);
    const dueAt = draft.updatedAt + IDLE_TIMEOUT_MS;
    if (dueAt > now) {
      await redis.zAdd(DRAFT_INDEX, { score: dueAt, value: tokenHash });
      continue;
    }

    try {
      requirePersistentPostgres();
      const expiresAt = new Date(Date.now() + FALLBACK_RETENTION_MS).toISOString();
      const saved = await saveFallbackDraft({
        tokenHash,
        answers: draft.answers,
        stepId: draft.stepId,
        expiresAt,
      });
      requirePersistentPostgres();
      if (!saved) throw new Error('PostgreSQL did not confirm the fallback draft');

      if (draft.answers.contactMethods?.includes('sms') && draft.answers.phone) {
        const reminder = await claimRegistrationReminder(tokenHash);
        if (reminder?.phone) {
          await queueRegistrationReminder({
            to: reminder.phone,
            url: resumeUrl(draft.token, draft.baseUrl),
          });
        }
      }

      await redis.del(key);
      await redis.zRem(DRAFT_INDEX, tokenHash);
    } catch (error) {
      logger.error({ err: error }, 'Could not archive an idle registration draft');
      const retryAt = Date.now() + 60_000;
      await redis.set(key, JSON.stringify(draft), { EX: 5 * 60 });
      await redis.zAdd(DRAFT_INDEX, { score: retryAt, value: tokenHash });
    }
  }

  if (now - lastPurgeAt >= 24 * 60 * 60 * 1000) {
    requirePersistentPostgres();
    await deleteExpiredRegistrationDrafts();
    lastPurgeAt = now;
  }
}

export function startDraftMonitor() {
  if (monitor) return;
  monitor = setInterval(() => {
    processDueDrafts().catch((error) => {
      logger.error({ err: error }, 'Registration draft monitor failed');
    });
  }, monitorEveryMs);
  monitor.unref();
}

export function stopDraftMonitor() {
  if (!monitor) return;
  clearInterval(monitor);
  monitor = null;
}

export const registrationDraftTiming = {
  idleTimeoutMs: IDLE_TIMEOUT_MS,
  redisTtlSeconds: REDIS_TTL_SECONDS,
  fallbackRetentionMs: FALLBACK_RETENTION_MS,
};
