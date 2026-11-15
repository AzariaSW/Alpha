import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

const KEY = Buffer.from(env.DATA_ENCRYPTION_KEY, 'hex');

function seal(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    __encrypted: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

function open(envelope) {
  const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function encryptJson(value) {
  return seal(JSON.stringify(value));
}

export function decryptJson(value) {
  if (!value || value.__encrypted !== 1) return value;
  return JSON.parse(open(value));
}

export function encryptText(value) {
  const envelope = seal(value);
  return `enc:v1:${envelope.iv}:${envelope.tag}:${envelope.ciphertext}`;
}

export function decryptText(value) {
  if (typeof value !== 'string' || !value.startsWith('enc:v1:')) return value;
  const [, , iv, tag, ciphertext] = value.split(':');
  return open({ iv, tag, ciphertext });
}
