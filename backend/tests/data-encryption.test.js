import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decryptJson, decryptText, encryptJson, encryptText } from '../src/utils/dataEncryption.js';

describe('registration draft encryption', () => {
  it('encrypts answers and round-trips the original values', () => {
    const answers = { fullName: 'Ada Example', phone: '0912345678' };
    const encrypted = encryptJson(answers);

    assert.equal(JSON.stringify(encrypted).includes('Ada Example'), false);
    assert.deepEqual(decryptJson(encrypted), answers);
  });

  it('encrypts phone numbers and continues reading legacy plaintext rows', () => {
    const encrypted = encryptText('0912345678');

    assert.notEqual(encrypted, '0912345678');
    assert.equal(decryptText(encrypted), '0912345678');
    assert.equal(decryptText('0912345678'), '0912345678');
  });
});
