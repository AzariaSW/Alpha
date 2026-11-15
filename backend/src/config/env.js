import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const configDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(configDir, '../../../.env') });
dotenv.config({ path: path.resolve(configDir, '../../.env') });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().optional().default(''),
  REDIS_URL: z.string().optional().default(''),
  PUBLIC_APP_URL: z.string().url().optional(),
  RABBITMQ_URL: z.string().optional().default(''),
  API_KEY_PEPPER: z.string().min(32).default('dev-accessibility-onboarding-pepper-key-32bytes!'),
  CORS_ORIGIN: z.string().default('*'),
  DEMO_SMS_OUTBOX: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
});

const parsed = schema.safeParse({
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL || undefined,
  REDIS_URL: process.env.REDIS_URL || undefined,
  PUBLIC_APP_URL: process.env.PUBLIC_APP_URL || undefined,
  RABBITMQ_URL: process.env.RABBITMQ_URL || undefined,
  API_KEY_PEPPER: process.env.API_KEY_PEPPER || undefined,
  CORS_ORIGIN: process.env.CORS_ORIGIN || undefined,
  DEMO_SMS_OUTBOX: process.env.DEMO_SMS_OUTBOX || undefined,
  TRUST_PROXY: process.env.TRUST_PROXY || undefined,
});

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
