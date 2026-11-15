import pino from 'pino';
import { env } from './env.js';
export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-api-key"]',
      'req.body',
      '*.password',
      '*.finNumber',
      '*.identityImage',
      '*.token',
      '*.phone',
      '*.email',
      '*.birthDate',
      '*.fullName',
      '*.documentName',
      '*.documentPhone',
      '*.registration',
      '*.document',
      '*.answers',
      'err.issues.*.input',
    ],
    censor: '[REDACTED]',
  },
});
