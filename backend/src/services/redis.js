import { createClient } from 'redis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const mockValues = new Map();
const mockSets = new Map();
let client;
let connecting;
let warnedAboutMock = false;

if (env.REDIS_URL) {
  client = createClient({ url: env.REDIS_URL });
  client.on('error', (error) => logger.error({ err: error }, 'Redis connection error'));
}

function getMockValue(key) {
  const item = mockValues.get(key);
  if (!item) return null;
  if (item.expiresAt && item.expiresAt <= Date.now()) {
    mockValues.delete(key);
    return null;
  }
  return item.value;
}

async function getClient() {
  if (!client) {
    if (!warnedAboutMock) {
      logger.warn('REDIS_URL is not configured; registration drafts use an in-memory development adapter');
      warnedAboutMock = true;
    }
    return null;
  }
  if (!client.isOpen) {
    connecting ??= client.connect().finally(() => {
      connecting = null;
    });
    await connecting;
  }
  return client;
}

export async function connectRedis() {
  if (!env.REDIS_URL && env.NODE_ENV === 'production') {
    throw new Error('REDIS_URL is required in production for registration drafts');
  }
  await getClient();
}

export const redis = {
  async get(key) {
    const active = await getClient();
    return active ? active.get(key) : getMockValue(key);
  },
  async set(key, value, options = {}) {
    const active = await getClient();
    if (active) return active.set(key, value, options);
    const seconds = options.EX;
    mockValues.set(key, {
      value,
      expiresAt: seconds ? Date.now() + seconds * 1000 : null,
    });
    return 'OK';
  },
  async del(key) {
    const active = await getClient();
    if (active) return active.del(key);
    return Number(mockValues.delete(key));
  },
  async zAdd(key, member) {
    const active = await getClient();
    if (active) return active.zAdd(key, [member]);
    const set = mockSets.get(key) || new Map();
    set.set(member.value, member.score);
    mockSets.set(key, set);
    return 1;
  },
  async zRangeByScore(key, min, max) {
    const active = await getClient();
    if (active) return active.zRangeByScore(key, min, max);
    return [...(mockSets.get(key) || new Map()).entries()]
      .filter(([, score]) => score >= Number(min) && score <= Number(max))
      .sort((a, b) => a[1] - b[1])
      .map(([value]) => value);
  },
  async zRem(key, value) {
    const active = await getClient();
    if (active) return active.zRem(key, value);
    return Number(mockSets.get(key)?.delete(value) || false);
  },
  async quit() {
    if (client?.isOpen) await client.quit();
  },
};
