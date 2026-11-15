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
  API_KEY_PEPPER: z.string().min(32).optional(),
  DATA_ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  CORS_ORIGIN: z.string().default('*')
}).superRefine((config, context) => {
  if (config.NODE_ENV !== 'production') return;

  for (const key of ['DATABASE_URL', 'REDIS_URL', 'PUBLIC_APP_URL', 'API_KEY_PEPPER', 'DATA_ENCRYPTION_KEY']) {
    if (!config[key]) {
      context.addIssue({
        code: 'custom',
        path: [key],
        message: `${key} is required in production`,
      });
    }
  }

  if (config.CORS_ORIGIN === '*') {
    context.addIssue({
      code: 'custom',
      path: ['CORS_ORIGIN'],
      message: 'CORS_ORIGIN must be explicitly restricted in production',
    });
  }

  if (config.PUBLIC_APP_URL && new URL(config.PUBLIC_APP_URL).protocol !== 'https:') {
    context.addIssue({
      code: 'custom',
      path: ['PUBLIC_APP_URL'],
      message: 'PUBLIC_APP_URL must use HTTPS in production',
    });
  }
});

const parsed = schema.safeParse({
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL || undefined,
  REDIS_URL: process.env.REDIS_URL || undefined,
  PUBLIC_APP_URL: process.env.PUBLIC_APP_URL || undefined,
  RABBITMQ_URL: process.env.RABBITMQ_URL || undefined,
  API_KEY_PEPPER: process.env.API_KEY_PEPPER || undefined,
  DATA_ENCRYPTION_KEY: process.env.DATA_ENCRYPTION_KEY || undefined,
  CORS_ORIGIN: process.env.CORS_ORIGIN || undefined,
});

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  API_KEY_PEPPER: parsed.data.API_KEY_PEPPER || 'dev-accessibility-onboarding-pepper-key-32bytes!',
  DATA_ENCRYPTION_KEY: parsed.data.DATA_ENCRYPTION_KEY || '0'.repeat(64),
};
